const express = require("express");
const multer = require("multer");
const path = require("path");
const pool = require("../config/database");
const { authenticateToken } = require("../middleware/auth");
const { calculateDistance, validateCoordinates, checkProximity } = require("../utils/location");
const { verifyPickupPhoto, generateImageHash, processImage, checkRateLimit } = require("../utils/verification");
const { checkAndUnlockAchievements } = require("./achievements");

const router = express.Router();

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/trash-reports/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept all files in development for testing
    if (process.env.NODE_ENV === 'development' || file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// Helper function to calculate points
const calculatePoints = (size, trashType) => {
  const sizeMultiplier = {
    Small: 10,
    Medium: 20,
    Large: 30,
    "Very Large": 50,
  };

  const typeMultiplier = {
    General: 1.0,
    Plastic: 1.2,
    Glass: 1.1,
    Metal: 1.3,
    Organic: 0.8,
    Hazardous: 2.0,
  };

  const basePoints = sizeMultiplier[size] || 20;
  const multiplier = typeMultiplier[trashType] || 1.0;
  return Math.round(basePoints * multiplier);
};

// Get all trash reports
router.get("/reports", authenticateToken, async (req, res) => {
  console.log("[TRASH/REPORTS] Fetching all reports for user:", req.user?.id);
  try {
    const [reports] = await pool.execute(`
      SELECT tr.*, u.name as reporter_name 
      FROM trash_reports tr 
      LEFT JOIN users u ON tr.user_id = u.id 
      WHERE tr.status = 'pending'
      ORDER BY tr.created_at DESC
    `);

    console.log("[TRASH/REPORTS] Found", reports.length, "reports");
    res.json(reports);
  } catch (error) {
    console.error("[TRASH/REPORTS] Fetch error:", error.message, error.stack);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

// Submit trash report
router.post(
  "/report",
  authenticateToken,
  upload.single("image"),
  async (req, res) => {
    console.log("[TRASH/REPORT] New report submission:", {
      body: req.body,
      hasFile: !!req.file,
      fileName: req.file?.filename,
      fileSize: req.file?.size,
      userId: req.user?.id
    });
    
    try {
      const { 
        latitude, 
        longitude, 
        description, 
        trashType, 
        size,
        username,
        aiDescription,
        trashCount,
        trashTypes,
        severity,
        locationContext
      } = req.body;

      if (!req.file) {
        console.log("[TRASH/REPORT] No photo uploaded");
        return res.status(400).json({ error: "Photo is required" });
      }

      if (!latitude || !longitude) {
        console.log("[TRASH/REPORT] Missing location data:", { latitude, longitude });
        return res.status(400).json({ error: "Location is required" });
      }

      const photoUrl = `/uploads/trash-reports/${req.file.filename}`;
      
      // Parse trash types if it's a JSON string
      let parsedTrashTypes = null;
      if (trashTypes) {
        try {
          parsedTrashTypes = typeof trashTypes === 'string' ? JSON.parse(trashTypes) : trashTypes;
        } catch (e) {
          console.error("Error parsing trash types:", e);
        }
      }

      // Calculate points based on AI analysis or fallback to manual data
      const finalTrashType = trashType || (parsedTrashTypes && parsedTrashTypes[0]) || 'General';
      const finalSize = size || (severity === 'high' ? 'Large' : severity === 'low' ? 'Small' : 'Medium');
      const points = calculatePoints(finalSize, finalTrashType);

      // Bonus points for AI analysis
      const aiBonus = aiDescription ? 5 : 0;
      const finalPoints = points + aiBonus;

      // Insert the report with AI data
      const [result] = await pool.execute(
        `
      INSERT INTO trash_reports 
      (user_id, latitude, longitude, photo_url, description, trash_type, size, points,
       ai_description, trash_count, trash_types, severity, location_context, ai_analyzed) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
        [
          req.user.id,
          latitude,
          longitude,
          photoUrl,
          description || aiDescription || 'Trash report',
          finalTrashType,
          finalSize,
          finalPoints,
          aiDescription,
          parseInt(trashCount) || 1,
          JSON.stringify(parsedTrashTypes),
          severity || 'medium',
          locationContext,
          !!aiDescription
        ]
      );

      // Get the created report
      const [reports] = await pool.execute(
        "SELECT * FROM trash_reports WHERE id = ?",
        [result.insertId]
      );

      // Update user's report count and points
      await pool.execute(
        "UPDATE users SET total_reports = total_reports + 1, points = points + ? WHERE id = ?",
        [finalPoints, req.user.id]
      );

      // Check for achievements
      const newAchievements = await checkAndUnlockAchievements(req.user.id, 'reports');
      await checkAndUnlockAchievements(req.user.id, 'points');

      console.log("[TRASH/REPORT] Report created successfully:", result.insertId, "Points:", finalPoints);
      
      const response = {
        ...reports[0],
        newAchievements: newAchievements
      };
      
      res.status(201).json(response);
    } catch (error) {
      console.error("[TRASH/REPORT] Submission error:", error.message, error.stack);
      res.status(500).json({ error: "Failed to submit report" });
    }
  }
);

// Get specific trash report
router.get("/report/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  console.log("[TRASH/REPORT/:id] Fetching report:", id);
  
  try {
    const [reports] = await pool.execute(
      `
      SELECT tr.*, u.name as reporter_name 
      FROM trash_reports tr 
      LEFT JOIN users u ON tr.user_id = u.id 
      WHERE tr.id = ?
    `,
      [id]
    );

    if (reports.length === 0) {
      console.log("[TRASH/REPORT/:id] Report not found:", id);
      return res.status(404).json({ error: "Report not found" });
    }

    console.log("[TRASH/REPORT/:id] Report found:", id);
    res.json(reports[0]);
  } catch (error) {
    console.error("[TRASH/REPORT/:id] Fetch error:", error.message);
    res.status(500).json({ error: "Failed to fetch report" });
  }
});

// AI Analysis endpoint for trash photos
router.post(
  "/ai/analyze-trash",
  authenticateToken,
  upload.single("image"),
  async (req, res) => {
    console.log("[TRASH/AI] Analysis requested:", {
      hasFile: !!req.file,
      fileName: req.file?.filename,
      fileSize: req.file?.size
    });
    
    try {
      if (!req.file) {
        console.log("[TRASH/AI] No image provided for analysis");
        return res.status(400).json({ error: "Image is required for analysis" });
      }

      // Simulate AI analysis (replace with actual AI service call)
      const simulateAIAnalysis = () => {
        const trashTypes = [
          ["Plastic Bottle", "Food Wrapper"],
          ["Cigarette Butt", "Plastic Cup"],
          ["Paper", "Plastic Bag"],
          ["Glass Bottle", "Metal Can"],
          ["Food Container", "Napkin"],
          ["Straw", "Bottle Cap"]
        ];

        const locationContexts = [
          "Urban street", "Park area", "Beach", "Parking lot", 
          "Sidewalk", "Forest trail", "Playground", "Bus stop"
        ];

        const descriptions = [
          "Multiple pieces of litter scattered on the ground",
          "Single large item of trash visible",
          "Small debris and waste materials",
          "Collection of mixed waste items",
          "Plastic waste near water source",
          "Organic and inorganic waste mixed together"
        ];

        const severities = ["low", "medium", "high"];
        
        const randomTrashTypes = trashTypes[Math.floor(Math.random() * trashTypes.length)];
        const randomDescription = descriptions[Math.floor(Math.random() * descriptions.length)];
        const randomContext = locationContexts[Math.floor(Math.random() * locationContexts.length)];
        const randomSeverity = severities[Math.floor(Math.random() * severities.length)];
        const randomCount = Math.floor(Math.random() * 10) + 1;

        return {
          description: randomDescription,
          trashCount: randomCount,
          trashTypes: randomTrashTypes,
          severity: randomSeverity,
          locationContext: randomContext,
          confidence: 0.85 + Math.random() * 0.1, // 85-95% confidence
          processingTime: Math.floor(Math.random() * 2000) + 1000 // 1-3 seconds
        };
      };

      // Simulate processing delay with Promise
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const analysisResult = simulateAIAnalysis();
      
      console.log("[TRASH/AI] Analysis complete:", analysisResult);
      res.json({
        success: true,
        analysis: analysisResult,
        message: "Image analyzed successfully"
      });

    } catch (error) {
      console.error("[TRASH/AI] Analysis error:", error.message);
      res.status(500).json({ error: "Failed to analyze image" });
    }
  }
);

// Verify pickup with photo evidence
router.post("/verify-pickup", authenticateToken, upload.single("verificationImage"), async (req, res) => {
  console.log("[TRASH/VERIFY-PICKUP] Verification request:", {
    body: req.body,
    hasFile: !!req.file,
    userId: req.user?.id
  });
  
  try {
    const {
      trashId,
      userLatitude,
      userLongitude,
      locationAccuracy,
      trashLatitude,
      trashLongitude,
      distanceFromTrash,
      timestamp
    } = req.body;

    // Validate required fields
    if (!trashId || !userLatitude || !userLongitude || !req.file) {
      console.log("[TRASH/VERIFY-PICKUP] Missing fields:", {
        trashId: !trashId ? "missing" : "present",
        userLatitude: !userLatitude ? "missing" : "present",
        userLongitude: !userLongitude ? "missing" : "present",
        file: !req.file ? "missing" : "present"
      });
      return res.status(400).json({
        success: false,
        message: "Missing required fields: trashId, location, or verification image"
      });
    }

    // Validate coordinates
    if (!validateCoordinates(userLatitude, userLongitude)) {
      console.log("[TRASH/VERIFY-PICKUP] Invalid coordinates:", { userLatitude, userLongitude });
      return res.status(400).json({
        success: false,
        message: "Invalid GPS coordinates"
      });
    }

    // Check rate limiting
    const [recentPickups] = await pool.execute(
      "SELECT created_at FROM cleanup_sessions WHERE user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)",
      [req.user.id]
    );

    const rateCheck = checkRateLimit(recentPickups, 10);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        message: `Too many pickup attempts. ${rateCheck.remaining} remaining this hour.`
      });
    }

    // Verify trash exists and is not already picked up
    const [trashReports] = await pool.execute(
      "SELECT * FROM trash_reports WHERE id = ?",
      [trashId]
    );

    if (trashReports.length === 0) {
      console.log("[TRASH/VERIFY-PICKUP] Trash not found:", trashId);
      return res.status(404).json({
        success: false,
        message: "Trash item not found"
      });
    }

    const trash = trashReports[0];
    if (trash.status === 'cleaned' || trash.cleaned_by) {
      console.log("[TRASH/VERIFY-PICKUP] Trash already cleaned:", trashId);
      return res.status(409).json({
        success: false,
        message: "This trash has already been picked up"
      });
    }

    // Verify location proximity (50m radius)
    const proximity = checkProximity(
      parseFloat(userLatitude),
      parseFloat(userLongitude),
      trash.latitude,
      trash.longitude,
      50
    );

    if (!proximity.isWithinRadius) {
      console.log("[TRASH/VERIFY-PICKUP] Too far from trash:", {
        distance: proximity.distance,
        maxDistance: 50,
        trashId
      });
      return res.status(422).json({
        success: false,
        message: `Too far from trash location. Distance: ${proximity.distance}m (max: 50m)`
      });
    }

    // Process and verify the image
    const processedImage = await processImage(req.file.buffer);
    const imageHash = generateImageHash(processedImage);
    
    // Check for duplicate images (fraud prevention)
    const [duplicateImages] = await pool.execute(
      "SELECT id FROM cleanup_sessions WHERE verification_image_url LIKE ?",
      [`%${imageHash.substring(0, 16)}%`]
    );

    if (duplicateImages.length > 0) {
      return res.status(422).json({
        success: false,
        message: "This image has been used before. Please take a new photo."
      });
    }

    // AI verification of pickup photo
    const verification = await verifyPickupPhoto(
      processedImage,
      trash.description || trash.ai_description
    );

    if (!verification.isHoldingTrash || verification.confidence < 0.7) {
      return res.status(422).json({
        success: false,
        message: "Photo verification failed. Please ensure you're holding the trash item clearly in the photo."
      });
    }

    // Save verification image (in production, upload to cloud storage)
    const verificationImagePath = `/uploads/verification/${Date.now()}-${imageHash.substring(0, 8)}.jpg`;
    
    // Update trash status and create cleanup session
    await pool.execute("START TRANSACTION");

    try {
      // Update trash report
      await pool.execute(
        `UPDATE trash_reports 
         SET status = 'cleaned', cleaned_by = ?, cleaned_at = NOW() 
         WHERE id = ?`,
        [req.user.id, trashId]
      );

      // Create cleanup session
      const [sessionResult] = await pool.execute(
        `INSERT INTO cleanup_sessions 
         (user_id, trash_report_id, start_time, start_latitude, start_longitude,
          pickup_latitude, pickup_longitude, distance_from_trash, location_accuracy,
          verification_image_url, verification_score, ai_confidence, points_earned,
          status, verification_status, verification_timestamp)
         VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', 'verified', NOW())`,
        [
          req.user.id,
          trashId,
          userLatitude,
          userLongitude,
          userLatitude,
          userLongitude,
          proximity.distance,
          locationAccuracy || 10,
          verificationImagePath,
          verification.confidence,
          verification.confidence,
          trash.points || 10
        ]
      );

      // Award points to user
      await pool.execute(
        "UPDATE users SET points = points + ?, total_cleanups = total_cleanups + 1 WHERE id = ?",
        [trash.points || 10, req.user.id]
      );

      await pool.execute("COMMIT");

      // Check for achievements (after commit)
      const newAchievements = await checkAndUnlockAchievements(req.user.id, 'cleanups');
      await checkAndUnlockAchievements(req.user.id, 'points');

      console.log("[TRASH/VERIFY-PICKUP] Pickup verified:", {
        trashId,
        userId: req.user.id,
        points: trash.points || 10,
        sessionId: sessionResult.insertId
      });
      
      res.json({
        success: true,
        message: "Pickup verified successfully",
        pointsEarned: trash.points || 10,
        matchConfidence: verification.confidence,
        trashId: trashId,
        userId: req.user.id,
        sessionId: sessionResult.insertId,
        newAchievements: newAchievements
      });

    } catch (error) {
      await pool.execute("ROLLBACK");
      throw error;
    }

  } catch (error) {
    console.error("[TRASH/VERIFY-PICKUP] Error:", error.message, error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to verify pickup"
    });
  }
});

// Get nearby trash items
router.get("/nearby", authenticateToken, async (req, res) => {
  const { latitude, longitude, radius = 1000 } = req.query;
  console.log("[TRASH/NEARBY] Request:", { latitude, longitude, radius });
  
  try {

    if (!latitude || !longitude) {
      console.log("[TRASH/NEARBY] Missing coordinates");
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required"
      });
    }

    if (!validateCoordinates(parseFloat(latitude), parseFloat(longitude))) {
      console.log("[TRASH/NEARBY] Invalid coordinates:", { latitude, longitude });
      return res.status(400).json({
        success: false,
        message: "Invalid GPS coordinates"
      });
    }

    // Get trash reports within radius using Haversine formula
    const [trashItems] = await pool.execute(`
      SELECT 
        id,
        latitude,
        longitude,
        description,
        ai_description,
        photo_url,
        trash_type,
        size,
        points,
        created_at,
        severity,
        location_context,
        (6371000 * ACOS(
          COS(RADIANS(?)) * COS(RADIANS(latitude)) * 
          COS(RADIANS(longitude) - RADIANS(?)) + 
          SIN(RADIANS(?)) * SIN(RADIANS(latitude))
        )) AS distance
      FROM trash_reports 
      WHERE status = 'pending'
        AND (6371000 * ACOS(
          COS(RADIANS(?)) * COS(RADIANS(latitude)) * 
          COS(RADIANS(longitude) - RADIANS(?)) + 
          SIN(RADIANS(?)) * SIN(RADIANS(latitude))
        )) <= ?
      ORDER BY distance ASC
      LIMIT 50
    `, [
      latitude, longitude, latitude,
      latitude, longitude, latitude, radius
    ]);

    const items = trashItems.map(item => ({
      id: item.id,
      description: item.ai_description || item.description,
      location: {
        latitude: item.latitude,
        longitude: item.longitude
      },
      distance: Math.round(item.distance),
      points: item.points,
      reportedAt: item.created_at,
      imageUrl: item.photo_url,
      trashType: item.trash_type,
      size: item.size,
      severity: item.severity,
      locationContext: item.location_context
    }));

    console.log("[TRASH/NEARBY] Found", items.length, "items within", radius, "meters");
    res.json({
      success: true,
      items
    });

  } catch (error) {
    console.error("[TRASH/NEARBY] Error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch nearby trash"
    });
  }
});

// Report issues with trash pickup
router.post("/:trashId/report-issue", authenticateToken, async (req, res) => {
  const { trashId } = req.params;
  const { issueType, description } = req.body;
  console.log("[TRASH/REPORT-ISSUE] Issue reported:", { trashId, issueType, description });
  
  try {

    if (!issueType || !["not_found", "already_cleaned", "inaccessible", "wrong_location", "other"].includes(issueType)) {
      console.log("[TRASH/REPORT-ISSUE] Invalid issue type:", issueType);
      return res.status(400).json({
        success: false,
        message: "Valid issue type is required"
      });
    }

    // Verify trash exists
    const [trashReports] = await pool.execute(
      "SELECT id FROM trash_reports WHERE id = ?",
      [trashId]
    );

    if (trashReports.length === 0) {
      console.log("[TRASH/REPORT-ISSUE] Trash not found:", trashId);
      return res.status(404).json({
        success: false,
        message: "Trash item not found"
      });
    }

    // Insert issue report
    await pool.execute(
      "INSERT INTO pickup_issues (trash_report_id, user_id, issue_type, description) VALUES (?, ?, ?, ?)",
      [trashId, req.user.id, issueType, description || null]
    );

    // If reported as already cleaned, mark the trash as such
    if (issueType === "already_cleaned") {
      await pool.execute(
        "UPDATE trash_reports SET status = 'cleaned' WHERE id = ?",
        [trashId]
      );
    }

    console.log("[TRASH/REPORT-ISSUE] Issue reported successfully for trash:", trashId);
    res.json({
      success: true,
      message: "Issue reported successfully"
    });

  } catch (error) {
    console.error("[TRASH/REPORT-ISSUE] Error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to report issue"
    });
  }
});

module.exports = router;
