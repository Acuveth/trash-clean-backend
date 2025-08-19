const pool = require("../config/database");

// Helper function to update user rank based on total cleanups
async function updateUserRank(userId) {
  try {
    console.log("[UTILS/ACHIEVEMENTS] Updating rank for user:", userId);
    
    const [users] = await pool.execute(
      "SELECT total_cleanups FROM users WHERE id = ?",
      [userId]
    );

    if (users.length === 0) return;

    const totalCleanups = users[0].total_cleanups || 0;
    let newRank = 'Beginner';

    if (totalCleanups >= 100) {
      newRank = 'Master';
    } else if (totalCleanups >= 50) {
      newRank = 'Expert';
    } else if (totalCleanups >= 25) {
      newRank = 'Advanced';
    } else if (totalCleanups >= 10) {
      newRank = 'Intermediate';
    } else if (totalCleanups >= 5) {
      newRank = 'Novice';
    }

    await pool.execute(
      "UPDATE users SET rank = ? WHERE id = ?",
      [newRank, userId]
    );

    console.log("[UTILS/ACHIEVEMENTS] Updated rank to:", newRank, "for user:", userId);
    return newRank;

  } catch (error) {
    console.error("[UTILS/ACHIEVEMENTS] Error updating rank:", error.message);
    return null;
  }
}

// Helper function to update daily streak
async function updateDailyStreak(userId) {
  try {
    console.log("[UTILS/ACHIEVEMENTS] Updating streak for user:", userId);
    
    const [users] = await pool.execute(
      "SELECT last_activity_date, streak_days FROM users WHERE id = ?",
      [userId]
    );

    if (users.length === 0) return 0;

    const user = users[0];
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const lastActivity = user.last_activity_date ? user.last_activity_date.toISOString().split('T')[0] : null;
    
    let newStreakDays = user.streak_days || 0;

    if (!lastActivity) {
      // First activity
      newStreakDays = 1;
    } else if (lastActivity === today) {
      // Same day, no change to streak
      return newStreakDays;
    } else {
      const lastDate = new Date(lastActivity);
      const todayDate = new Date(today);
      const dayDiff = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));
      
      if (dayDiff === 1) {
        // Consecutive day
        newStreakDays += 1;
      } else {
        // Streak broken
        newStreakDays = 1;
      }
    }

    await pool.execute(
      "UPDATE users SET last_activity_date = CURDATE(), streak_days = ? WHERE id = ?",
      [newStreakDays, userId]
    );

    console.log("[UTILS/ACHIEVEMENTS] Updated streak to:", newStreakDays, "days for user:", userId);
    return newStreakDays;

  } catch (error) {
    console.error("[UTILS/ACHIEVEMENTS] Error updating streak:", error.message);
    return 0;
  }
}

// Initialize default achievements in database
async function initializeAchievements() {
  try {
    console.log("[UTILS/ACHIEVEMENTS] Initializing default achievements");
    
    // Check if achievements exist
    const [existing] = await pool.execute("SELECT COUNT(*) as count FROM achievements");
    
    if (existing[0].count > 0) {
      console.log("[UTILS/ACHIEVEMENTS] Achievements already exist, skipping initialization");
      return;
    }

    const defaultAchievements = [
      {
        title: 'First Steps',
        description: 'Complete your first trash pickup',
        icon: 'eco',
        category: 'beginner',
        points: 50,
        threshold_value: 1,
        achievement_type: 'cleanups',
        rarity: 'common'
      },
      {
        title: 'Reporter',
        description: 'Submit your first trash report',
        icon: 'camera_alt',
        category: 'beginner',
        points: 25,
        threshold_value: 1,
        achievement_type: 'reports',
        rarity: 'common'
      },
      {
        title: 'Cleanup Novice',
        description: 'Complete 5 trash pickups',
        icon: 'cleaning_services',
        category: 'cleanup',
        points: 100,
        threshold_value: 5,
        achievement_type: 'cleanups',
        rarity: 'common'
      },
      {
        title: 'Point Collector',
        description: 'Earn 500 points',
        icon: 'star',
        category: 'points',
        points: 100,
        threshold_value: 500,
        achievement_type: 'points',
        rarity: 'common'
      },
      {
        title: 'Cleanup Expert',
        description: 'Complete 25 trash pickups',
        icon: 'workspace_premium',
        category: 'cleanup',
        points: 500,
        threshold_value: 25,
        achievement_type: 'cleanups',
        rarity: 'uncommon'
      },
      {
        title: 'Dedicated Reporter',
        description: 'Submit 10 trash reports',
        icon: 'report',
        category: 'social',
        points: 250,
        threshold_value: 10,
        achievement_type: 'reports',
        rarity: 'uncommon'
      },
      {
        title: 'Week Warrior',
        description: 'Maintain a 7-day streak',
        icon: 'local_fire_department',
        category: 'streak',
        points: 300,
        threshold_value: 7,
        achievement_type: 'streak',
        rarity: 'uncommon'
      },
      {
        title: 'Point Master',
        description: 'Earn 2500 points',
        icon: 'emoji_events',
        category: 'points',
        points: 500,
        threshold_value: 2500,
        achievement_type: 'points',
        rarity: 'uncommon'
      },
      {
        title: 'Cleanup Champion',
        description: 'Complete 50 trash pickups',
        icon: 'military_tech',
        category: 'cleanup',
        points: 1000,
        threshold_value: 50,
        achievement_type: 'cleanups',
        rarity: 'rare'
      },
      {
        title: 'Community Hero',
        description: 'Submit 25 trash reports',
        icon: 'volunteer_activism',
        category: 'social',
        points: 500,
        threshold_value: 25,
        achievement_type: 'reports',
        rarity: 'rare'
      },
      {
        title: 'Streak Legend',
        description: 'Maintain a 30-day streak',
        icon: 'whatshot',
        category: 'streak',
        points: 1000,
        threshold_value: 30,
        achievement_type: 'streak',
        rarity: 'rare'
      },
      {
        title: 'Point Legend',
        description: 'Earn 10000 points',
        icon: 'diamond',
        category: 'points',
        points: 2000,
        threshold_value: 10000,
        achievement_type: 'points',
        rarity: 'legendary'
      },
      {
        title: 'Cleanup Master',
        description: 'Complete 100 trash pickups',
        icon: 'shield',
        category: 'cleanup',
        points: 2500,
        threshold_value: 100,
        achievement_type: 'cleanups',
        rarity: 'legendary'
      }
    ];

    for (const achievement of defaultAchievements) {
      await pool.execute(`
        INSERT INTO achievements (title, description, icon, category, points, threshold_value, achievement_type, rarity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        achievement.title,
        achievement.description,
        achievement.icon,
        achievement.category,
        achievement.points,
        achievement.threshold_value,
        achievement.achievement_type,
        achievement.rarity
      ]);
    }

    console.log("[UTILS/ACHIEVEMENTS] Default achievements initialized successfully");

  } catch (error) {
    console.error("[UTILS/ACHIEVEMENTS] Error initializing achievements:", error.message);
  }
}

module.exports = {
  updateUserRank,
  updateDailyStreak,
  initializeAchievements
};