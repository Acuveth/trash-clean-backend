const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
require("dotenv").config();

// Import routes (we'll create these next)
const authRoutes = require("./routes/auth");
const trashRoutes = require("./routes/trash");
const cleanupRoutes = require("./routes/cleanup");

const app = express();
const PORT = process.env.PORT || 3000;

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const originalSend = res.send;
  
  res.send = function(body) {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
    
    if (res.statusCode >= 400) {
      console.log(`[ERROR] Request body:`, req.body);
      console.log(`[ERROR] Response:`, typeof body === 'string' ? body : JSON.stringify(body));
    }
    
    return originalSend.call(this, body);
  };
  
  next();
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use("/api/", limiter);

// Static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Basic health check
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/trash", trashRoutes);
app.use("/api/cleanup", cleanupRoutes);

// Error handling middleware
app.use((error, req, res, next) => {
  console.error(`[SERVER ERROR] ${error.name}: ${error.message}`);
  console.error(`[SERVER ERROR] Request: ${req.method} ${req.originalUrl}`);
  console.error(`[SERVER ERROR] Body:`, req.body);
  console.error(`[SERVER ERROR] Stack:`, error.stack);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
