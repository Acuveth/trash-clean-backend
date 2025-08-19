const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/database");
const { authenticateToken } = require("../middleware/auth");
const { verifyOAuthToken, validateOAuthRequest, processProfilePicture } = require("../utils/oauth");

const router = express.Router();

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

    // Get the created user
    const [users] = await pool.execute(
      "SELECT id, email, name, points FROM users WHERE id = ?",
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
        points: user.points,
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
        points: user.points,
      },
      token,
    });
  } catch (error) {
    console.error("[AUTH/LOGIN] Login error:", error.message, error.stack);
    res.status(500).json({ error: "Login failed" });
  }
});

// Get current user info
router.get("/me", authenticateToken, (req, res) => {
  console.log("[AUTH/ME] User info requested for ID:", req.user?.id);
  res.json(req.user);
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

module.exports = router;
