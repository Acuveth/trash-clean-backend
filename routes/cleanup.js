const express = require("express");
const multer = require("multer");
const path = require("path");
const pool = require("../config/database");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// Configure multer for cleanup photos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/cleanup-photos/");
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
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// Helper function to calculate distance between two points
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

// Simulated AI verification function
const simulateAIVerification = async () => {
  // Simulate processing time
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Simulate verification result
  const similarity = 0.75 + Math.random() * 0.2; // 75-95% similarity
  const handsDetected = Math.random() > 0.1; // 90% success rate
  const environmentClean = Math.random() > 0.05; // 95% success rate

  const verified = similarity > 0.7 && handsDetected && environmentClean;
  const confidence =
    (similarity + (handsDetected ? 1 : 0) + (environmentClean ? 1 : 0)) / 3;

  let pointsEarned = 0;
  let reason = "";

  if (verified) {
    pointsEarned = 20 + Math.floor(confidence * 30);
    reason = "Cleanup successfully verified";
  } else {
    if (similarity < 0.7) reason = "Photos do not match original trash";
    else if (!handsDetected) reason = "Trash not detected in hand";
    else if (!environmentClean) reason = "Environment does not appear clean";
  }

  return {
    verified,
    confidence: Math.round(confidence * 100) / 100,
    similarity: Math.round(similarity * 100) / 100,
    handsDetected,
    environmentClean,
    pointsEarned,
    reason,
  };
};

// Get nearby trash for cleanup (using Haversine formula)
router.get("/nearby", authenticateToken, async (req, res) => {
  const { lat, lng } = req.query;
  console.log("[CLEANUP/NEARBY] Request:", { lat, lng });
  
  try {
    const radius = 5; // 5km radius

    if (!lat || !lng) {
      console.log("[CLEANUP/NEARBY] Missing coordinates");
      return res
        .status(400)
        .json({ error: "Latitude and longitude are required" });
    }

    // Using Haversine formula for distance calculation in MariaDB
    const [reports] = await pool.execute(
      `
      SELECT *, 
        (6371 * acos(cos(radians(?)) * cos(radians(latitude)) * 
        cos(radians(longitude) - radians(?)) + sin(radians(?)) * 
        sin(radians(latitude)))) AS distance
      FROM trash_reports 
      WHERE status = 'pending'
      HAVING distance < ?
      ORDER BY distance
      LIMIT 20
    `,
      [lat, lng, lat, radius]
    );

    console.log("[CLEANUP/NEARBY] Found", reports.length, "reports");
    res.json(reports);
  } catch (error) {
    console.error("[CLEANUP/NEARBY] Error:", error.message);
    res.status(500).json({ error: "Failed to fetch nearby trash" });
  }
});

// Start cleanup session
router.post("/start", authenticateToken, async (req, res) => {
  const { trashId, startLocation, startTime } = req.body;
  console.log("[CLEANUP/START] Starting session:", {
    trashId,
    startLocation,
    startTime,
    userId: req.user?.id
  });
  
  try {

    // Verify trash exists and is available
    const [trashReports] = await pool.execute(
      "SELECT * FROM trash_reports WHERE id = ? AND status = ?",
      [trashId, "pending"]
    );

    if (trashReports.length === 0) {
      console.log("[CLEANUP/START] Trash not available:", trashId);
      return res.status(400).json({ error: "Trash not available for cleanup" });
    }

    const trash = trashReports[0];

    // Check distance (within 50 meters)
    const distance = calculateDistance(
      startLocation.latitude,
      startLocation.longitude,
      trash.latitude,
      trash.longitude
    );

    if (distance > 50) {
      console.log("[CLEANUP/START] Too far from trash:", {
        distance,
        maxDistance: 50,
        trashId
      });
      return res.status(400).json({ error: "Too far from trash location" });
    }

    // Create cleanup session
    const [result] = await pool.execute(
      `
      INSERT INTO cleanup_sessions 
      (user_id, trash_report_id, start_time, start_latitude, start_longitude) 
      VALUES (?, ?, ?, ?, ?)
    `,
      [
        req.user.id,
        trashId,
        startTime,
        startLocation.latitude,
        startLocation.longitude,
      ]
    );

    // Get the created session
    const [sessions] = await pool.execute(
      "SELECT * FROM cleanup_sessions WHERE id = ?",
      [result.insertId]
    );

    console.log("[CLEANUP/START] Session created:", result.insertId);
    res.json(sessions[0]);
  } catch (error) {
    console.error("[CLEANUP/START] Error:", error.message);
    res.status(500).json({ error: "Failed to start cleanup" });
  }
});

// Verify pickup photos
router.post(
  "/verify",
  authenticateToken,
  upload.fields([
    { name: "pickupPhoto", maxCount: 1 },
    { name: "afterPhoto", maxCount: 1 },
  ]),
  async (req, res) => {
    console.log("[CLEANUP/VERIFY] Photo verification:", {
      body: req.body,
      hasPickupPhoto: !!req.files?.pickupPhoto,
      hasAfterPhoto: !!req.files?.afterPhoto
    });
    
    try {
      const { originalPhotoUrl, latitude, longitude } = req.body;

      if (!req.files.pickupPhoto || !req.files.afterPhoto) {
        console.log("[CLEANUP/VERIFY] Missing photos:", {
          hasPickupPhoto: !!req.files?.pickupPhoto,
          hasAfterPhoto: !!req.files?.afterPhoto
        });
        return res.status(400).json({ error: "Both photos are required" });
      }

      console.log("[CLEANUP/VERIFY] Processing AI verification...");

      // Simulate AI verification
      const verificationResult = await simulateAIVerification();

      console.log("[CLEANUP/VERIFY] Verification result:", verificationResult);
      res.json(verificationResult);
    } catch (error) {
      console.error("[CLEANUP/VERIFY] Error:", error.message);
      res.status(500).json({ error: "Failed to verify photos" });
    }
  }
);

// Complete cleanup
router.post("/complete", authenticateToken, async (req, res) => {
  const { sessionId, endTime, verificationResult } = req.body;
  console.log("[CLEANUP/COMPLETE] Completing cleanup:", {
    sessionId,
    endTime,
    verified: verificationResult?.verified,
    points: verificationResult?.pointsEarned
  });
  
  try {

    if (!verificationResult || !verificationResult.verified) {
      console.log("[CLEANUP/COMPLETE] Cleanup not verified:", verificationResult);
      return res.status(400).json({ error: "Cleanup not verified" });
    }

    // Get session details
    const [sessions] = await pool.execute(
      "SELECT * FROM cleanup_sessions WHERE id = ? AND user_id = ?",
      [sessionId, req.user.id]
    );

    if (sessions.length === 0) {
      console.log("[CLEANUP/COMPLETE] Session not found:", sessionId);
      return res.status(404).json({ error: "Session not found" });
    }

    const session = sessions[0];

    // Update session
    await pool.execute(
      `
      UPDATE cleanup_sessions 
      SET end_time = ?, verification_score = ?, points_earned = ?, status = 'completed'
      WHERE id = ?
    `,
      [
        endTime,
        verificationResult.confidence,
        verificationResult.pointsEarned,
        sessionId,
      ]
    );

    // Update trash report status
    await pool.execute(
      `
      UPDATE trash_reports 
      SET status = 'cleaned', cleaned_at = ?, cleaned_by = ?
      WHERE id = ?
    `,
      [endTime, req.user.id, session.trash_report_id]
    );

    // Update user points and stats
    await pool.execute(
      `
      UPDATE users 
      SET points = points + ?, total_cleanups = total_cleanups + 1,
          last_activity = CURDATE()
      WHERE id = ?
    `,
      [verificationResult.pointsEarned, req.user.id]
    );

    console.log("[CLEANUP/COMPLETE] Cleanup completed successfully:", {
      sessionId,
      trashId: session.trash_report_id,
      pointsEarned: verificationResult.pointsEarned
    });
    
    res.json({
      success: true,
      pointsEarned: verificationResult.pointsEarned,
      trashId: session.trash_report_id,
    });
  } catch (error) {
    console.error("[CLEANUP/COMPLETE] Error:", error.message);
    res.status(500).json({ error: "Failed to complete cleanup" });
  }
});

module.exports = router;
