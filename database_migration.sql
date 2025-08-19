-- Database Migration for New Features
-- Run this SQL to update your database schema

-- Add new fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_days INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rank VARCHAR(50) DEFAULT 'Beginner';

-- Create achievements table
CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    category VARCHAR(50),
    points INTEGER,
    threshold_value INTEGER,
    achievement_type ENUM('cleanups', 'reports', 'points', 'streak') NOT NULL,
    rarity ENUM('common', 'uncommon', 'rare', 'legendary') DEFAULT 'common',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create user achievements junction table
CREATE TABLE IF NOT EXISTS user_achievements (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    user_id INTEGER NOT NULL,
    achievement_id INTEGER NOT NULL,
    unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    progress INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_achievement (user_id, achievement_id)
);

-- Insert default achievements
INSERT INTO achievements (title, description, icon, category, points, threshold_value, achievement_type, rarity) VALUES
('First Steps', 'Complete your first trash pickup', 'eco', 'beginner', 50, 1, 'cleanups', 'common'),
('Reporter', 'Submit your first trash report', 'camera_alt', 'beginner', 25, 1, 'reports', 'common'),
('Cleanup Novice', 'Complete 5 trash pickups', 'cleaning_services', 'cleanup', 100, 5, 'cleanups', 'common'),
('Point Collector', 'Earn 500 points', 'star', 'points', 100, 500, 'points', 'common'),
('Cleanup Expert', 'Complete 25 trash pickups', 'workspace_premium', 'cleanup', 500, 25, 'cleanups', 'uncommon'),
('Dedicated Reporter', 'Submit 10 trash reports', 'report', 'social', 250, 10, 'reports', 'uncommon'),
('Week Warrior', 'Maintain a 7-day streak', 'local_fire_department', 'streak', 300, 7, 'streak', 'uncommon'),
('Point Master', 'Earn 2500 points', 'emoji_events', 'points', 500, 2500, 'points', 'uncommon'),
('Cleanup Champion', 'Complete 50 trash pickups', 'military_tech', 'cleanup', 1000, 50, 'cleanups', 'rare'),
('Community Hero', 'Submit 25 trash reports', 'volunteer_activism', 'social', 500, 25, 'reports', 'rare'),
('Streak Legend', 'Maintain a 30-day streak', 'whatshot', 'streak', 1000, 30, 'streak', 'rare'),
('Point Legend', 'Earn 10000 points', 'diamond', 'points', 2000, 10000, 'points', 'legendary'),
('Cleanup Master', 'Complete 100 trash pickups', 'shield', 'cleanup', 2500, 100, 'cleanups', 'legendary');

-- Update existing users with default values
UPDATE users SET 
    bio = NULL,
    location = NULL,
    streak_days = 0,
    last_activity_date = CURDATE(),
    rank = CASE 
        WHEN total_cleanups >= 50 THEN 'Master'
        WHEN total_cleanups >= 25 THEN 'Expert'
        WHEN total_cleanups >= 10 THEN 'Advanced'
        WHEN total_cleanups >= 5 THEN 'Intermediate'
        ELSE 'Beginner'
    END
WHERE bio IS NULL;