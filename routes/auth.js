const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/database");
const { authenticateToken } = require("../middleware/auth");
const { verifyOAuthToken, validateOAuthRequest, processProfilePicture } = require("../utils/oauth");
const multer = require("multer");
const path = require("path");
const axios = require("axios");

const router = express.Router();

// Configure multer for profile picture uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/profile-pictures/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      "profile-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const uploadProfile = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// Register new user
router.post("/register", async (req, res) => {
  console.log("[AUTH/REGISTER] Request received:", {
    body: req.body,
    headers: req.headers['content-type'],
    hasEmail: !!req.body.email,
    hasName: !!req.body.name,
    hasPassword: !!req.body.password
  });
  
  try {
    const { email, name, password } = req.body;

    // Basic validation
    if (!email || !name || !password) {
      console.log("[AUTH/REGISTER] Validation failed - missing fields:", {
        email: !email ? "missing" : "present",
        name: !name ? "missing" : "present",
        password: !password ? "missing" : "present"
      });
      return res.status(400).json({ error: "All fields are required" });
    }

    if (password.length < 6) {
      console.log("[AUTH/REGISTER] Password too short:", password.length, "characters");
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    // Check if user exists
    const [existingUsers] = await pool.execute(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );
    if (existingUsers.length > 0) {
      console.log("[AUTH/REGISTER] User already exists:", email);
      return res.status(400).json({ error: "User already exists" });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const [result] = await pool.execute(
      "INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)",
      [email, name, passwordHash]
    );

    // Get the created user with all fields
    const [users] = await pool.execute(
      `SELECT id, email, name, profile_picture_url, bio, location, points, 
       total_cleanups, total_reports, rank, streak_days, is_oauth_user, 
       oauth_provider, created_at, updated_at FROM users WHERE id = ?`,
      [result.insertId]
    );

    const user = users[0];
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || "default_secret"
    );

    console.log("[AUTH/REGISTER] Registration successful for:", email);
    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        profilePictureUrl: user.profile_picture_url,
        bio: user.bio,
        location: user.location,
        points: user.points || 0,
        totalCleanups: user.total_cleanups || 0,
        totalReports: user.total_reports || 0,
        rank: user.rank || 'Beginner',
        streakDays: user.streak_days || 0,
        isOauthUser: user.is_oauth_user || false,
        oauthProvider: user.oauth_provider,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      },
      token,
    });
  } catch (error) {
    console.error("[AUTH/REGISTER] Registration error:", error.message, error.stack);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Login user
router.post("/login", async (req, res) => {
  console.log("[AUTH/LOGIN] Request received:", {
    body: req.body,
    hasEmail: !!req.body.email,
    hasPassword: !!req.body.password
  });
  
  try {
    const { email, password } = req.body;

    // Basic validation
    if (!email || !password) {
      console.log("[AUTH/LOGIN] Validation failed - missing fields:", {
        email: !email ? "missing" : "present",
        password: !password ? "missing" : "present"
      });
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user
    const [users] = await pool.execute("SELECT * FROM users WHERE email = ?", [
      email,
    ]);
    if (users.length === 0) {
      console.log("[AUTH/LOGIN] User not found:", email);
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const user = users[0];

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      console.log("[AUTH/LOGIN] Invalid password for:", email);
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || "default_secret"
    );

    console.log("[AUTH/LOGIN] Login successful for:", email);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        profilePictureUrl: user.profile_picture_url,
        bio: user.bio,
        location: user.location,
        points: user.points || 0,
        totalCleanups: user.total_cleanups || 0,
        totalReports: user.total_reports || 0,
        rank: user.rank || 'Beginner',
        streakDays: user.streak_days || 0,
        isOauthUser: user.is_oauth_user || false,
        oauthProvider: user.oauth_provider,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      },
      token,
    });
  } catch (error) {
    console.error("[AUTH/LOGIN] Login error:", error.message, error.stack);
    res.status(500).json({ error: "Login failed" });
  }
});

// Get current user info
router.get("/me", authenticateToken, async (req, res) => {
  console.log("[AUTH/ME] User info requested for ID:", req.user?.id);
  
  try {
    // Get fresh user data from database
    const [users] = await pool.execute(
      `SELECT id, email, name, profile_picture_url, bio, location, points, total_cleanups, total_reports, streak_days, is_oauth_user, oauth_provider, created_at, updated_at FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = users[0];
    const userResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      profilePictureUrl: user.profile_picture_url,
      bio: user.bio,
      location: user.location,
      points: user.points || 0,
      totalCleanups: user.total_cleanups || 0,
      totalReports: user.total_reports || 0,
      streakDays: user.streak_days || 0,
      isOauthUser: user.is_oauth_user || false,
      oauthProvider: user.oauth_provider,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    };

    res.json(userResponse);
  } catch (error) {
    console.error("[AUTH/ME] Error fetching user:", error.message);
    res.status(500).json({ error: "Failed to fetch user info" });
  }
});

// Google OAuth2 authentication endpoint
router.post("/oauth", async (req, res) => {
  console.log("[AUTH/OAUTH] Request received:", {
    provider: req.body.provider,
    hasAccessToken: !!req.body.accessToken,
    userInfo: req.body.userInfo ? { email: req.body.userInfo.email, name: req.body.userInfo.name } : null
  });
  
  try {
    const { provider, accessToken, userInfo } = req.body;

    // Validate request data
    const validation = validateOAuthRequest(req.body);
    if (!validation.isValid) {
      console.log("[AUTH/OAUTH] Validation failed:", validation.errors);
      return res.status(400).json({
        success: false,
        message: "Invalid request data",
        errors: validation.errors
      });
    }

    // Verify token with OAuth provider
    const verifiedUserInfo = await verifyOAuthToken(provider, accessToken, userInfo);
    if (!verifiedUserInfo) {
      console.log("[AUTH/OAUTH] Token verification failed for provider:", provider);
      return res.status(401).json({
        success: false,
        message: "Invalid OAuth token or user information"
      });
    }
    console.log("[AUTH/OAUTH] Token verified for user:", verifiedUserInfo.email);

    // Check for rate limiting (optional - prevent OAuth abuse)
    const [recentAttempts] = await pool.execute(
      "SELECT COUNT(*) as count FROM users WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)"
    );

    if (recentAttempts[0].count > 100) {
      return res.status(429).json({
        success: false,
        message: "Too many authentication attempts. Please try again later."
      });
    }

    let user;
    
    // First, try to find user by OAuth provider and ID
    const [existingOAuthUsers] = await pool.execute(
      "SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?",
      [provider, verifiedUserInfo.id]
    );

    if (existingOAuthUsers.length > 0) {
      // User exists with this OAuth account
      user = existingOAuthUsers[0];
      
      // Update user info in case it changed
      await pool.execute(
        `UPDATE users SET 
         name = ?, 
         profile_picture_url = ?, 
         last_activity = CURDATE(),
         updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [
          verifiedUserInfo.name,
          processProfilePicture(provider, verifiedUserInfo.picture),
          user.id
        ]
      );
    } else {
      // Check if user exists with same email (account linking)
      const [existingEmailUsers] = await pool.execute(
        "SELECT * FROM users WHERE email = ?",
        [verifiedUserInfo.email]
      );

      if (existingEmailUsers.length > 0) {
        // Link OAuth to existing email account
        user = existingEmailUsers[0];
        await pool.execute(
          `UPDATE users SET 
           oauth_provider = ?, 
           oauth_id = ?, 
           profile_picture_url = ?, 
           is_oauth_user = TRUE,
           last_activity = CURDATE(),
           updated_at = CURRENT_TIMESTAMP 
           WHERE id = ?`,
          [
            provider,
            verifiedUserInfo.id,
            processProfilePicture(provider, verifiedUserInfo.picture),
            user.id
          ]
        );
      } else {
        // Create new user
        const [result] = await pool.execute(
          `INSERT INTO users 
           (email, name, oauth_provider, oauth_id, profile_picture_url, 
            is_oauth_user, points, total_cleanups, total_reports, last_activity) 
           VALUES (?, ?, ?, ?, ?, TRUE, 0, 0, 0, CURDATE())`,
          [
            verifiedUserInfo.email,
            verifiedUserInfo.name,
            provider,
            verifiedUserInfo.id,
            processProfilePicture(provider, verifiedUserInfo.picture)
          ]
        );

        // Get the created user
        const [newUsers] = await pool.execute(
          "SELECT * FROM users WHERE id = ?",
          [result.insertId]
        );
        user = newUsers[0];
      }
    }

    // Generate JWT tokens
    const accessTokenJWT = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        isOAuthUser: user.is_oauth_user 
      },
      process.env.JWT_SECRET || "default_secret",
      { expiresIn: '24h' }
    );

    const refreshTokenJWT = jwt.sign(
      { userId: user.id },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || "default_refresh_secret",
      { expiresIn: '30d' }
    );

    // Prepare user response
    const userResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      profilePictureUrl: user.profile_picture_url,
      points: user.points || 0,
      totalCleanups: user.total_cleanups || 0,
      totalReports: user.total_reports || 0,
      isOauthUser: user.is_oauth_user,
      oauthProvider: user.oauth_provider,
      rank: user.rank,
      streakDays: user.streak_days
    };

    res.json({
      success: true,
      user: userResponse,
      tokens: {
        accessToken: accessTokenJWT,
        refreshToken: refreshTokenJWT
      },
      message: "OAuth authentication successful"
    });

  } catch (error) {
    console.error("[AUTH/OAUTH] Authentication error:", error.message, error.stack);
    res.status(500).json({
      success: false,
      message: "Authentication failed",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Token refresh endpoint
router.post("/refresh", async (req, res) => {
  console.log("[AUTH/REFRESH] Token refresh requested:", {
    hasRefreshToken: !!req.body.refreshToken
  });
  
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      console.log("[AUTH/REFRESH] No refresh token provided");
      return res.status(400).json({
        success: false,
        message: "Refresh token is required"
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(
      refreshToken, 
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || "default_refresh_secret"
    );

    // Get user from database
    const [users] = await pool.execute(
      "SELECT * FROM users WHERE id = ?",
      [decoded.userId]
    );

    if (users.length === 0) {
      console.log("[AUTH/REFRESH] User not found for token");
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token"
      });
    }

    const user = users[0];

    // Generate new access token
    const newAccessToken = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        isOAuthUser: user.is_oauth_user 
      },
      process.env.JWT_SECRET || "default_secret",
      { expiresIn: '24h' }
    );

    console.log("[AUTH/REFRESH] Token refreshed successfully for user:", user.id);
    res.json({
      success: true,
      accessToken: newAccessToken
    });

  } catch (error) {
    console.error("[AUTH/REFRESH] Token refresh error:", error.message);
    res.status(401).json({
      success: false,
      message: "Invalid refresh token"
    });
  }
});

// Update user profile
router.put("/profile", authenticateToken, uploadProfile.single("profileImage"), async (req, res) => {
  const { name, bio, location } = req.body;
  console.log("[AUTH/PROFILE] Profile update request:", {
    userId: req.user?.id,
    name,
    bio,
    location,
    hasFile: !!req.file
  });
  
  try {
    // Validate input
    if (!name || name.trim().length === 0) {
      console.log("[AUTH/PROFILE] Name is required");
      return res.status(400).json({
        success: false,
        message: "Name is required"
      });
    }

    let updateFields = {
      name: name.trim(),
      bio: bio ? bio.trim() : null,
      location: location ? location.trim() : null
    };

    let updateQuery = "UPDATE users SET name = ?, bio = ?, location = ?, updated_at = CURRENT_TIMESTAMP";
    let updateParams = [updateFields.name, updateFields.bio, updateFields.location];

    // Handle profile picture upload
    if (req.file) {
      const profilePictureUrl = `/uploads/profile-pictures/${req.file.filename}`;
      updateQuery += ", profile_picture_url = ?";
      updateParams.push(profilePictureUrl);
      console.log("[AUTH/PROFILE] New profile picture:", profilePictureUrl);
    }

    updateQuery += " WHERE id = ?";
    updateParams.push(req.user.id);

    // Update user in database
    await pool.execute(updateQuery, updateParams);

    // Get updated user data
    const [users] = await pool.execute(
      `SELECT id, email, name, profile_picture_url, bio, location, points, 
       total_cleanups, total_reports, rank, streak_days, is_oauth_user, 
       oauth_provider, created_at, updated_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (users.length === 0) {
      console.log("[AUTH/PROFILE] User not found after update:", req.user.id);
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const user = users[0];
    const userResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      profilePictureUrl: user.profile_picture_url,
      bio: user.bio,
      location: user.location,
      points: user.points || 0,
      totalCleanups: user.total_cleanups || 0,
      totalReports: user.total_reports || 0,
      rank: user.rank || 'Beginner',
      streakDays: user.streak_days || 0,
      isOauthUser: user.is_oauth_user,
      oauthProvider: user.oauth_provider,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    };

    console.log("[AUTH/PROFILE] Profile updated successfully for:", user.email);
    res.json({
      success: true,
      user: userResponse,
      message: "Profile updated successfully"
    });

  } catch (error) {
    console.error("[AUTH/PROFILE] Update error:", error.message, error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to update profile"
    });
  }
});

// Export user data
router.get("/export-data", authenticateToken, async (req, res) => {
  console.log("[AUTH/EXPORT] Data export requested for user:", req.user?.id);
  
  try {
    // Get user data
    const [users] = await pool.execute(
      "SELECT * FROM users WHERE id = ?",
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Get user's trash reports
    const [trashReports] = await pool.execute(
      "SELECT * FROM trash_reports WHERE user_id = ?",
      [req.user.id]
    );

    // Get user's cleanup sessions
    const [cleanupSessions] = await pool.execute(
      "SELECT * FROM cleanup_sessions WHERE user_id = ?",
      [req.user.id]
    );

    // Get user's achievements
    const [achievements] = await pool.execute(
      `SELECT ua.*, a.title, a.description, a.icon, a.category, a.points, a.rarity
       FROM user_achievements ua
       JOIN achievements a ON ua.achievement_id = a.id
       WHERE ua.user_id = ?`,
      [req.user.id]
    );

    const userData = {
      user: {
        id: users[0].id,
        email: users[0].email,
        name: users[0].name,
        bio: users[0].bio,
        location: users[0].location,
        points: users[0].points,
        totalCleanups: users[0].total_cleanups,
        totalReports: users[0].total_reports,
        rank: users[0].rank,
        streakDays: users[0].streak_days,
        createdAt: users[0].created_at,
        updatedAt: users[0].updated_at
      },
      trashReports: trashReports,
      cleanupSessions: cleanupSessions,
      achievements: achievements,
      exportedAt: new Date().toISOString()
    };

    console.log("[AUTH/EXPORT] Data exported for user:", req.user.id);
    res.json(userData);

  } catch (error) {
    console.error("[AUTH/EXPORT] Export error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to export data"
    });
  }
});

// Google OAuth code exchange endpoint
router.post("/google/exchange", async (req, res) => {
  // Handle both codeVerifier and code_verifier field names
  const { 
    code, 
    redirectUri, 
    redirect_uri,
    clientId, 
    client_id,
    codeVerifier, 
    code_verifier 
  } = req.body;
  
  // Use whichever field name is provided
  const finalRedirectUri = redirectUri || redirect_uri;
  const finalClientId = clientId || client_id;
  const finalCodeVerifier = codeVerifier || code_verifier;
  
  console.log("[AUTH/GOOGLE/EXCHANGE] Full request body:", JSON.stringify(req.body, null, 2));
  console.log("[AUTH/GOOGLE/EXCHANGE] Body keys:", Object.keys(req.body));
  console.log("[AUTH/GOOGLE/EXCHANGE] Raw field values:", {
    codeVerifier_raw: req.body.codeVerifier,
    code_verifier_raw: req.body.code_verifier,
    codeVerifier_type: typeof req.body.codeVerifier,
    code_verifier_type: typeof req.body.code_verifier
  });
  console.log("[AUTH/GOOGLE/EXCHANGE] Extracted values:", {
    hasCode: !!code,
    codeLength: code ? code.length : 0,
    redirectUri: finalRedirectUri,
    clientId: finalClientId,
    hasCodeVerifier: !!finalCodeVerifier,
    codeVerifierLength: finalCodeVerifier ? finalCodeVerifier.length : 0,
    codeVerifierPreview: finalCodeVerifier ? finalCodeVerifier.substring(0, 20) + '...' : 'none',
    finalCodeVerifier_actual: finalCodeVerifier
  });
  
  try {
    // Validate required fields
    if (!code || !finalRedirectUri || !finalClientId) {
      console.log("[AUTH/GOOGLE/EXCHANGE] Missing required fields:", {
        code: !code ? "missing" : "present",
        redirectUri: !finalRedirectUri ? "missing" : "present",
        clientId: !finalClientId ? "missing" : "present",
        codeVerifier: !finalCodeVerifier ? "missing" : "present"
      });
      return res.status(400).json({
        success: false,
        message: "Missing required fields: code, redirectUri, or clientId"
      });
    }

    // Exchange authorization code for tokens
    console.log("[AUTH/GOOGLE/EXCHANGE] Exchanging code for tokens...");
    
    // For this client type, we need to use BOTH client_secret AND code_verifier
    let tokenResponse;
    let authMethod = 'unknown';
    
    let firstAttemptError = null;
    
    try {
      // Try hybrid approach first (PKCE + client_secret)
      if (finalCodeVerifier && process.env.GOOGLE_CLIENT_SECRET) {
        console.log("[AUTH/GOOGLE/EXCHANGE] Attempting hybrid PKCE + client_secret flow");
        authMethod = 'hybrid';
        
        const hybridPayload = new URLSearchParams({
          code: code,
          client_id: finalClientId,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: finalRedirectUri,
          grant_type: 'authorization_code',
          code_verifier: finalCodeVerifier
        });
        
        console.log("[AUTH/GOOGLE/EXCHANGE] Hybrid payload:", {
          code: code.substring(0, 20) + '...',
          client_id: finalClientId,
          client_secret: '[REDACTED]',
          redirect_uri: finalRedirectUri,
          grant_type: 'authorization_code',
          code_verifier: finalCodeVerifier.substring(0, 10) + '...'
        });
        
        try {
          tokenResponse = await axios.post('https://oauth2.googleapis.com/token', hybridPayload, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          });
          console.log(`[AUTH/GOOGLE/EXCHANGE] Token exchange successful using ${authMethod} method`);
        } catch (hybridError) {
          console.log(`[AUTH/GOOGLE/EXCHANGE] ${authMethod} method failed, trying fallbacks:`, {
            status: hybridError.response?.status,
            data: hybridError.response?.data
          });
          firstAttemptError = hybridError;
          tokenResponse = null; // Will trigger fallback attempts
        }
      }
      
      // Fallback 1: PKCE only (if hybrid failed)
      if (!tokenResponse && finalCodeVerifier) {
        console.log("[AUTH/GOOGLE/EXCHANGE] Attempting PKCE-only flow as fallback");
        authMethod = 'PKCE';
        
        const pkcePayload = new URLSearchParams({
          code: code,
          client_id: finalClientId,
          redirect_uri: finalRedirectUri,
          grant_type: 'authorization_code',
          code_verifier: finalCodeVerifier
        });
        
        try {
          tokenResponse = await axios.post('https://oauth2.googleapis.com/token', pkcePayload, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          });
          console.log(`[AUTH/GOOGLE/EXCHANGE] Token exchange successful using ${authMethod} method`);
        } catch (pkceError) {
          console.log(`[AUTH/GOOGLE/EXCHANGE] ${authMethod} method failed:`, {
            status: pkceError.response?.status,
            data: pkceError.response?.data
          });
          // Continue to next fallback
        }
      }
      
      // Fallback 2: Client secret only (if both above failed)
      if (!tokenResponse && process.env.GOOGLE_CLIENT_SECRET) {
        console.log("[AUTH/GOOGLE/EXCHANGE] Attempting client secret only flow as final fallback");
        authMethod = 'client_secret';
        
        const clientSecretPayload = new URLSearchParams({
          code: code,
          client_id: finalClientId,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: finalRedirectUri,
          grant_type: 'authorization_code'
        });
        
        try {
          tokenResponse = await axios.post('https://oauth2.googleapis.com/token', clientSecretPayload, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          });
          console.log(`[AUTH/GOOGLE/EXCHANGE] Token exchange successful using ${authMethod} method`);
        } catch (clientSecretError) {
          console.log(`[AUTH/GOOGLE/EXCHANGE] ${authMethod} method failed:`, {
            status: clientSecretError.response?.status,
            data: clientSecretError.response?.data
          });
        }
      }
      
      // If all methods failed, throw the first error
      if (!tokenResponse) {
        throw firstAttemptError || new Error('All authentication methods failed');
      }
      
    } catch (generalError) {
      console.error(`[AUTH/GOOGLE/EXCHANGE] Authentication failed:`, {
        status: generalError.response?.status,
        data: generalError.response?.data
      });
      throw generalError;
    }
    

    const { access_token, refresh_token, id_token } = tokenResponse.data;
    console.log("[AUTH/GOOGLE/EXCHANGE] Token exchange successful");

    // Get user info from Google
    console.log("[AUTH/GOOGLE/EXCHANGE] Fetching user info...");
    const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });

    const googleUser = userInfoResponse.data;
    console.log("[AUTH/GOOGLE/EXCHANGE] User info received:", {
      id: googleUser.id,
      email: googleUser.email,
      name: googleUser.name,
      verified_email: googleUser.verified_email
    });

    // Validate email is verified
    if (!googleUser.verified_email) {
      console.log("[AUTH/GOOGLE/EXCHANGE] Email not verified");
      return res.status(400).json({
        success: false,
        message: "Google account email is not verified"
      });
    }

    // Check for rate limiting (prevent OAuth abuse)
    const [recentAttempts] = await pool.execute(
      "SELECT COUNT(*) as count FROM users WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)"
    );

    if (recentAttempts[0].count > 100) {
      console.log("[AUTH/GOOGLE/EXCHANGE] Rate limit exceeded");
      return res.status(429).json({
        success: false,
        message: "Too many authentication attempts. Please try again later."
      });
    }

    let user;
    
    // First, try to find user by OAuth provider and ID
    const [existingOAuthUsers] = await pool.execute(
      "SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?",
      ['google', googleUser.id]
    );

    if (existingOAuthUsers.length > 0) {
      // User exists with this OAuth account
      user = existingOAuthUsers[0];
      console.log("[AUTH/GOOGLE/EXCHANGE] Existing OAuth user found:", user.email);
      
      // Update user info in case it changed
      await pool.execute(
        `UPDATE users SET 
         name = ?, 
         profile_picture_url = ?, 
         last_activity_date = CURDATE(),
         updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [
          googleUser.name,
          googleUser.picture,
          user.id
        ]
      );
    } else {
      // Check if user exists with same email (account linking)
      const [existingEmailUsers] = await pool.execute(
        "SELECT * FROM users WHERE email = ?",
        [googleUser.email]
      );

      if (existingEmailUsers.length > 0) {
        // Link OAuth to existing email account
        user = existingEmailUsers[0];
        console.log("[AUTH/GOOGLE/EXCHANGE] Linking OAuth to existing account:", user.email);
        
        await pool.execute(
          `UPDATE users SET 
           oauth_provider = ?, 
           oauth_id = ?, 
           profile_picture_url = ?, 
           is_oauth_user = TRUE,
           last_activity_date = CURDATE(),
           updated_at = CURRENT_TIMESTAMP 
           WHERE id = ?`,
          [
            'google',
            googleUser.id,
            googleUser.picture,
            user.id
          ]
        );
      } else {
        // Create new user
        console.log("[AUTH/GOOGLE/EXCHANGE] Creating new user:", googleUser.email);
        
        const [result] = await pool.execute(
          `INSERT INTO users 
           (email, name, oauth_provider, oauth_id, profile_picture_url, 
            is_oauth_user, points, total_cleanups, total_reports, last_activity_date, rank) 
           VALUES (?, ?, ?, ?, ?, TRUE, 0, 0, 0, CURDATE(), 'Beginner')`,
          [
            googleUser.email,
            googleUser.name,
            'google',
            googleUser.id,
            googleUser.picture
          ]
        );

        // Get the created user
        const [newUsers] = await pool.execute(
          "SELECT * FROM users WHERE id = ?",
          [result.insertId]
        );
        user = newUsers[0];
      }
    }

    // Generate JWT tokens
    const accessTokenJWT = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        isOAuthUser: user.is_oauth_user 
      },
      process.env.JWT_SECRET || "default_secret",
      { expiresIn: '24h' }
    );

    const refreshTokenJWT = jwt.sign(
      { userId: user.id },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || "default_refresh_secret",
      { expiresIn: '30d' }
    );

    // Get fresh user data
    const [updatedUsers] = await pool.execute(
      `SELECT id, email, name, profile_picture_url, bio, location, points, 
       total_cleanups, total_reports, rank, streak_days, is_oauth_user, 
       oauth_provider, created_at, updated_at FROM users WHERE id = ?`,
      [user.id]
    );

    const updatedUser = updatedUsers[0];
    const userResponse = {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      profilePictureUrl: updatedUser.profile_picture_url,
      bio: updatedUser.bio,
      location: updatedUser.location,
      points: updatedUser.points || 0,
      totalCleanups: updatedUser.total_cleanups || 0,
      totalReports: updatedUser.total_reports || 0,
      rank: updatedUser.rank || 'Beginner',
      streakDays: updatedUser.streak_days || 0,
      isOauthUser: updatedUser.is_oauth_user,
      oauthProvider: updatedUser.oauth_provider,
      createdAt: updatedUser.created_at,
      updatedAt: updatedUser.updated_at
    };

    console.log("[AUTH/GOOGLE/EXCHANGE] Authentication successful for:", user.email);
    res.json({
      success: true,
      user: userResponse,
      tokens: {
        accessToken: accessTokenJWT,
        refreshToken: refreshTokenJWT
      },
      message: "Google authentication successful"
    });

  } catch (error) {
    console.error("[AUTH/GOOGLE/EXCHANGE] Error:", error.message, error.stack);
    
    // Handle specific Google API errors
    if (error.response) {
      const { status, data } = error.response;
      console.error("[AUTH/GOOGLE/EXCHANGE] Google API error:", { status, data });
      console.error("[AUTH/GOOGLE/EXCHANGE] Full error details:", JSON.stringify(data, null, 2));
      
      if (status === 400) {
        let message = data.error_description || "Invalid authorization code or redirect URI";
        
        // Provide specific error messages for common issues
        if (data.error === 'invalid_grant') {
          if (data.error_description?.includes('code verifier')) {
            message = "The authorization code was likely generated without PKCE or with a different code_challenge. Please try logging in again.";
          } else if (data.error_description?.includes('expired') || data.error_description?.includes('used')) {
            message = "The authorization code has expired or has already been used. Please try logging in again.";
          } else {
            message = "The authorization code is invalid, expired, or has already been used. Please try logging in again.";
          }
        }
        
        return res.status(400).json({
          success: false,
          message: message,
          error: data.error,
          hint: "If this keeps happening, clear your browser cache and try again."
        });
      }
    }
    
    res.status(500).json({
      success: false,
      message: "Authentication failed",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
