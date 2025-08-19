const express = require("express");
const pool = require("../config/database");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// Get all achievements with user progress
router.get("/", authenticateToken, async (req, res) => {
  console.log("[ACHIEVEMENTS] Fetching achievements for user:", req.user?.id);
  
  try {
    // Get all achievements with user progress
    const [achievements] = await pool.execute(`
      SELECT 
        a.*,
        ua.unlocked_at,
        ua.progress,
        CASE 
          WHEN ua.achievement_id IS NOT NULL THEN true 
          ELSE false 
        END as unlocked
      FROM achievements a
      LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
      ORDER BY a.category, a.threshold_value ASC
    `, [req.user.id]);

    // Get user's current stats for progress calculation
    const [userStats] = await pool.execute(`
      SELECT 
        total_cleanups,
        total_reports, 
        points,
        streak_days
      FROM users 
      WHERE id = ?
    `, [req.user.id]);

    const stats = userStats[0] || {
      total_cleanups: 0,
      total_reports: 0,
      points: 0,
      streak_days: 0
    };

    // Calculate current progress for each achievement
    const achievementsWithProgress = achievements.map(achievement => {
      let currentProgress = 0;
      
      switch (achievement.achievement_type) {
        case 'cleanups':
          currentProgress = stats.total_cleanups || 0;
          break;
        case 'reports':
          currentProgress = stats.total_reports || 0;
          break;
        case 'points':
          currentProgress = stats.points || 0;
          break;
        case 'streak':
          currentProgress = stats.streak_days || 0;
          break;
        default:
          currentProgress = 0;
      }

      return {
        id: achievement.id,
        title: achievement.title,
        description: achievement.description,
        icon: achievement.icon,
        category: achievement.category,
        points: achievement.points,
        unlocked: achievement.unlocked,
        progress: Math.min(currentProgress, achievement.threshold_value),
        maxProgress: achievement.threshold_value,
        rarity: achievement.rarity,
        unlockedAt: achievement.unlocked_at
      };
    });

    console.log("[ACHIEVEMENTS] Found", achievementsWithProgress.length, "achievements");
    res.json({
      achievements: achievementsWithProgress
    });

  } catch (error) {
    console.error("[ACHIEVEMENTS] Fetch error:", error.message, error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to fetch achievements"
    });
  }
});

// Get achievement categories
router.get("/categories", authenticateToken, async (req, res) => {
  console.log("[ACHIEVEMENTS/CATEGORIES] Fetching categories");
  
  try {
    const [categories] = await pool.execute(`
      SELECT DISTINCT category 
      FROM achievements 
      WHERE category IS NOT NULL
      ORDER BY category
    `);

    const categoryList = categories.map(row => row.category);
    
    console.log("[ACHIEVEMENTS/CATEGORIES] Found categories:", categoryList);
    res.json({
      categories: categoryList
    });

  } catch (error) {
    console.error("[ACHIEVEMENTS/CATEGORIES] Error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch categories"
    });
  }
});

// Check and unlock achievements for a user
async function checkAndUnlockAchievements(userId, type = null) {
  try {
    console.log("[ACHIEVEMENTS/CHECK] Checking achievements for user:", userId, "type:", type);

    // Get user's current stats
    const [userStats] = await pool.execute(`
      SELECT total_cleanups, total_reports, points, streak_days
      FROM users WHERE id = ?
    `, [userId]);

    if (userStats.length === 0) {
      return [];
    }

    const stats = userStats[0];

    // Get achievements that user hasn't unlocked yet
    let achievementQuery = `
      SELECT a.*
      FROM achievements a
      WHERE a.id NOT IN (
        SELECT achievement_id 
        FROM user_achievements 
        WHERE user_id = ?
      )
    `;
    
    let queryParams = [userId];

    // Filter by type if specified
    if (type) {
      achievementQuery += " AND a.achievement_type = ?";
      queryParams.push(type);
    }

    const [pendingAchievements] = await pool.execute(achievementQuery, queryParams);

    const newlyUnlocked = [];

    for (const achievement of pendingAchievements) {
      let currentProgress = 0;
      
      switch (achievement.achievement_type) {
        case 'cleanups':
          currentProgress = stats.total_cleanups || 0;
          break;
        case 'reports':
          currentProgress = stats.total_reports || 0;
          break;
        case 'points':
          currentProgress = stats.points || 0;
          break;
        case 'streak':
          currentProgress = stats.streak_days || 0;
          break;
      }

      // Check if achievement should be unlocked
      if (currentProgress >= achievement.threshold_value) {
        try {
          // Unlock the achievement
          await pool.execute(`
            INSERT INTO user_achievements (user_id, achievement_id, progress, unlocked_at)
            VALUES (?, ?, ?, NOW())
          `, [userId, achievement.id, currentProgress]);

          // Award points to user
          await pool.execute(`
            UPDATE users 
            SET points = points + ?
            WHERE id = ?
          `, [achievement.points, userId]);

          newlyUnlocked.push({
            id: achievement.id,
            title: achievement.title,
            description: achievement.description,
            icon: achievement.icon,
            category: achievement.category,
            points: achievement.points,
            rarity: achievement.rarity
          });

          console.log("[ACHIEVEMENTS/CHECK] Unlocked achievement:", achievement.title, "for user:", userId);
        } catch (insertError) {
          // Ignore duplicate key errors (race condition)
          if (!insertError.message.includes('Duplicate entry')) {
            console.error("[ACHIEVEMENTS/CHECK] Error unlocking achievement:", insertError.message);
          }
        }
      }
    }

    return newlyUnlocked;

  } catch (error) {
    console.error("[ACHIEVEMENTS/CHECK] Error checking achievements:", error.message);
    return [];
  }
}

// Export the function for use in other routes
router.checkAndUnlockAchievements = checkAndUnlockAchievements;

module.exports = router;