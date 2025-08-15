const express = require("express");
const multer = require("multer");
const path = require("path");
const pool = require("../config/database");
const { authenticateToken } = require("../middleware/auth");

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
  try {
    const [reports] = await pool.execute(`
      SELECT tr.*, u.name as reporter_name 
      FROM trash_reports tr 
      LEFT JOIN users u ON tr.user_id = u.id 
      WHERE tr.status = 'pending'
      ORDER BY tr.created_at DESC
    `);

    res.json(reports);
  } catch (error) {
    console.error("Fetch reports error:", error);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

// Submit trash report
router.post(
  "/report",
  authenticateToken,
  upload.single("image"),
  async (req, res) => {
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
        return res.status(400).json({ error: "Photo is required" });
      }

      if (!latitude || !longitude) {
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

      res.status(201).json(reports[0]);
    } catch (error) {
      console.error("Report submission error:", error);
      res.status(500).json({ error: "Failed to submit report" });
    }
  }
);

// Get specific trash report
router.get("/report/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
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
      return res.status(404).json({ error: "Report not found" });
    }

    res.json(reports[0]);
  } catch (error) {
    console.error("Fetch report error:", error);
    res.status(500).json({ error: "Failed to fetch report" });
  }
});

// AI Analysis endpoint for trash photos
router.post(
  "/ai/analyze-trash",
  authenticateToken,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
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
      
      res.json({
        success: true,
        analysis: analysisResult,
        message: "Image analyzed successfully"
      });

    } catch (error) {
      console.error("AI analysis error:", error);
      res.status(500).json({ error: "Failed to analyze image" });
    }
  }
);

module.exports = router;
