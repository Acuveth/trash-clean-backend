const mysql = require("mysql2/promise");
require("dotenv").config();

// Create connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "pass",
  database: process.env.DB_NAME || "trash_clean",
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "+00:00",
});

// Test database connection
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log("✅ MariaDB connected successfully");
    connection.release();
  } catch (error) {
    console.error("❌ Error connecting to MariaDB:", error.message);
  }
};

// Database initialization
const initDatabase = async () => {
  try {
    console.log("🔧 Initializing MariaDB tables...");

    // Users table with OAuth2 support
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255),
        oauth_provider VARCHAR(20),
        oauth_id VARCHAR(100),
        profile_picture_url TEXT,
        is_oauth_user BOOLEAN DEFAULT FALSE,
        points INT DEFAULT 0,
        total_cleanups INT DEFAULT 0,
        total_reports INT DEFAULT 0,
        streak_days INT DEFAULT 0,
        last_activity DATE,
        \`rank\` VARCHAR(50) DEFAULT 'Beginner',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_oauth_lookup (oauth_provider, oauth_id),
        INDEX idx_email (email)
      )
    `);

    // Trash reports table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS trash_reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        photo_url VARCHAR(500) NOT NULL,
        description TEXT,
        trash_type VARCHAR(100) NOT NULL,
        size VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        points INT DEFAULT 20,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        cleaned_at TIMESTAMP NULL,
        cleaned_by INT,
        ai_description TEXT,
        trash_count INT DEFAULT 1,
        trash_types JSON,
        severity VARCHAR(20) DEFAULT 'medium',
        location_context VARCHAR(100),
        ai_analyzed BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (cleaned_by) REFERENCES users(id),
        INDEX idx_status (status),
        INDEX idx_location (latitude, longitude),
        INDEX idx_created_at (created_at),
        INDEX idx_severity (severity)
      )
    `);

    // Cleanup sessions table with enhanced verification
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS cleanup_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        trash_report_id INT,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NULL,
        start_latitude DECIMAL(10, 8) NOT NULL,
        start_longitude DECIMAL(11, 8) NOT NULL,
        pickup_latitude DECIMAL(10, 8),
        pickup_longitude DECIMAL(11, 8),
        distance_from_trash DECIMAL(10, 2),
        location_accuracy DECIMAL(10, 2),
        pickup_photo_url VARCHAR(500),
        after_photo_url VARCHAR(500),
        verification_image_url VARCHAR(500),
        verification_score DECIMAL(3, 2),
        ai_confidence DECIMAL(3, 2),
        points_earned INT DEFAULT 0,
        status VARCHAR(50) DEFAULT 'active',
        verification_status VARCHAR(50),
        verification_timestamp TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (trash_report_id) REFERENCES trash_reports(id),
        INDEX idx_user_id (user_id),
        INDEX idx_status (status),
        INDEX idx_verification_status (verification_status)
      )
    `);

    // Pickup issues table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS pickup_issues (
        id INT AUTO_INCREMENT PRIMARY KEY,
        trash_report_id INT,
        user_id INT,
        issue_type ENUM('not_found', 'already_cleaned', 'inaccessible', 'wrong_location', 'other') NOT NULL,
        description TEXT,
        reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (trash_report_id) REFERENCES trash_reports(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        INDEX idx_trash_report (trash_report_id),
        INDEX idx_issue_type (issue_type)
      )
    `);

    // User achievements table (for future gamification)
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS user_achievements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        achievement_type VARCHAR(100) NOT NULL,
        earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE KEY unique_user_achievement (user_id, achievement_type)
      )
    `);

    // Friends table for leaderboard functionality
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS friends (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        friend_id INT NOT NULL,
        status ENUM('pending', 'accepted', 'blocked') DEFAULT 'accepted',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_friendship (user_id, friend_id),
        INDEX idx_user_id (user_id),
        INDEX idx_friend_id (friend_id),
        INDEX idx_status (status)
      )
    `);

    console.log("✅ MariaDB tables initialized successfully");
  } catch (error) {
    console.error("❌ MariaDB initialization error:", error);
  }
};

// Initialize database when module is loaded
testConnection();
initDatabase();

module.exports = pool;
