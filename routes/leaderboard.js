const express = require('express');
const router = express.Router();
const db = require('../config/database');
const jwt = require('jsonwebtoken');

// Middleware to verify JWT token
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [users] = await db.query(
      "SELECT id, email, name, points FROM users WHERE id = ?",
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = users[0];
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Helper function to get date filter based on period
const getDateFilter = (period) => {
  const now = new Date();
  switch (period) {
    case 'weekly':
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return `AND u.last_activity >= '${weekAgo.toISOString().split('T')[0]}'`;
    case 'monthly':
      const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      return `AND u.last_activity >= '${monthAgo.toISOString().split('T')[0]}'`;
    case 'all':
    default:
      return '';
  }
};

// Helper function to calculate user level
const calculateUserLevel = (points) => {
  if (points >= 10000) return { level: 'Eco Legend', tier: 6, color: '#9D4EDD' };
  if (points >= 5000) return { level: 'Eco Master', tier: 5, color: '#C77DFF' };
  if (points >= 2000) return { level: 'Eco Expert', tier: 4, color: '#E0AAFF' };
  if (points >= 1000) return { level: 'Eco Warrior', tier: 3, color: '#C0EBA6' };
  if (points >= 500) return { level: 'Eco Enthusiast', tier: 2, color: '#FCBF49' };
  return { level: 'Eco Beginner', tier: 1, color: '#EF476F' };
};

// Helper function to get next level threshold
const getNextLevelThreshold = (points) => {
  if (points >= 10000) return null; // Max level
  if (points >= 5000) return 10000;
  if (points >= 2000) return 5000;
  if (points >= 1000) return 2000;
  if (points >= 500) return 1000;
  return 500;
};

// GET /api/leaderboard/global - Global leaderboard with period filtering
router.get('/global', async (req, res) => {
  try {
    const { period = 'all', limit = 50 } = req.query;
    const dateFilter = getDateFilter(period);

    const query = `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.profile_picture_url,
        u.points,
        u.total_cleanups,
        u.total_reports,
        u.streak_days,
        u.last_activity,
        u.created_at
      FROM users u
      WHERE u.points > 0 ${dateFilter}
      ORDER BY u.points DESC, u.total_cleanups DESC, u.created_at ASC
      LIMIT ?
    `;

    const [rows] = await db.query(query.replace('?', parseInt(limit)));

    const leaderboard = rows.map((user, index) => {
      const levelInfo = calculateUserLevel(user.points);
      const nextThreshold = getNextLevelThreshold(user.points);
      
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        profilePictureUrl: user.profile_picture_url,
        points: user.points,
        totalCleanups: user.total_cleanups,
        totalReports: user.total_reports,
        streakDays: user.streak_days,
        position: index + 1,
        level: levelInfo.level,
        levelTier: levelInfo.tier,
        levelColor: levelInfo.color,
        nextLevelThreshold: nextThreshold,
        progressToNext: nextThreshold ? Math.min(100, (user.points / nextThreshold) * 100) : 100,
        lastActivity: user.last_activity,
        joinedAt: user.created_at
      };
    });

    res.json({
      success: true,
      data: leaderboard,
      meta: {
        period,
        limit: parseInt(limit),
        total: rows.length
      }
    });

  } catch (error) {
    console.error('Error fetching global leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// GET /api/leaderboard/friends - Friends leaderboard
router.get('/friends', verifyToken, async (req, res) => {
  try {
    const { period = 'all', limit = 50 } = req.query;
    const userId = req.user.id;
    const dateFilter = getDateFilter(period);

    const query = `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.profile_picture_url,
        u.points,
        u.total_cleanups,
        u.total_reports,
        u.streak_days,
        u.last_activity,
        u.created_at
      FROM users u
      WHERE u.id IN (
        SELECT friend_id FROM friends WHERE user_id = ? AND status = 'accepted'
        UNION
        SELECT user_id FROM friends WHERE friend_id = ? AND status = 'accepted'
        UNION
        SELECT ?
      ) AND u.points > 0 ${dateFilter}
      ORDER BY u.points DESC, u.total_cleanups DESC, u.created_at ASC
      LIMIT ?
    `;

    const [rows] = await db.query(query.replace('?', parseInt(limit)).replace('?', userId).replace('?', userId).replace('?', userId));

    const leaderboard = rows.map((user, index) => {
      const levelInfo = calculateUserLevel(user.points);
      const nextThreshold = getNextLevelThreshold(user.points);
      
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        profilePictureUrl: user.profile_picture_url,
        points: user.points,
        totalCleanups: user.total_cleanups,
        totalReports: user.total_reports,
        streakDays: user.streak_days,
        position: index + 1,
        level: levelInfo.level,
        levelTier: levelInfo.tier,
        levelColor: levelInfo.color,
        nextLevelThreshold: nextThreshold,
        progressToNext: nextThreshold ? Math.min(100, (user.points / nextThreshold) * 100) : 100,
        lastActivity: user.last_activity,
        joinedAt: user.created_at,
        isCurrentUser: user.id === userId
      };
    });

    res.json({
      success: true,
      data: leaderboard,
      meta: {
        period,
        limit: parseInt(limit),
        total: rows.length,
        includesSelf: true
      }
    });

  } catch (error) {
    console.error('Error fetching friends leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch friends leaderboard' });
  }
});

// GET /api/leaderboard/my-rank - Get current user's rank
router.get('/my-rank', verifyToken, async (req, res) => {
  try {
    const { period = 'all' } = req.query;
    const userId = req.user.id;
    const dateFilter = getDateFilter(period);

    // Get user's rank in global leaderboard
    const rankQuery = `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.profile_picture_url,
        u.points,
        u.total_cleanups,
        u.total_reports,
        u.streak_days,
        u.last_activity,
        u.created_at,
        (
          SELECT COUNT(*) + 1 
          FROM users u2 
          WHERE u2.points > u.points ${dateFilter}
        ) as global_rank,
        (
          SELECT COUNT(*) 
          FROM users u3 
          WHERE u3.points > 0 ${dateFilter}
        ) as total_users
      FROM users u
      WHERE u.id = ?
    `;

    const [userRows] = await db.query(rankQuery, [userId]);

    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userRows[0];
    
    // Handle users with no points or activity
    if (!user.points) user.points = 0;
    if (!user.total_cleanups) user.total_cleanups = 0;
    if (!user.total_reports) user.total_reports = 0;
    if (!user.streak_days) user.streak_days = 0;
    const levelInfo = calculateUserLevel(user.points);
    const nextThreshold = getNextLevelThreshold(user.points);

    const userRank = {
      id: user.id,
      name: user.name,
      email: user.email,
      profilePictureUrl: user.profile_picture_url,
      points: user.points,
      totalCleanups: user.total_cleanups,
      totalReports: user.total_reports,
      streakDays: user.streak_days,
      globalRank: user.global_rank,
      totalUsers: user.total_users,
      level: levelInfo.level,
      levelTier: levelInfo.tier,
      levelColor: levelInfo.color,
      nextLevelThreshold: nextThreshold,
      progressToNext: nextThreshold ? Math.min(100, (user.points / nextThreshold) * 100) : 100,
      lastActivity: user.last_activity,
      joinedAt: user.created_at
    };

    res.json({
      success: true,
      data: userRank,
      meta: {
        period
      }
    });

  } catch (error) {
    console.error('Error fetching user rank:', error);
    res.status(500).json({ error: 'Failed to fetch user rank' });
  }
});

// GET /api/leaderboard/stats - Get leaderboard statistics
router.get('/stats', async (req, res) => {
  try {
    const { period = 'all' } = req.query;
    const dateFilter = getDateFilter(period);

    const statsQuery = `
      SELECT 
        COUNT(*) as total_users,
        SUM(points) as total_points,
        SUM(total_cleanups) as total_cleanups,
        SUM(total_reports) as total_reports,
        AVG(points) as avg_points,
        MAX(points) as max_points,
        COUNT(CASE WHEN points >= 10000 THEN 1 END) as eco_legends,
        COUNT(CASE WHEN points >= 5000 AND points < 10000 THEN 1 END) as eco_masters,
        COUNT(CASE WHEN points >= 2000 AND points < 5000 THEN 1 END) as eco_experts,
        COUNT(CASE WHEN points >= 1000 AND points < 2000 THEN 1 END) as eco_warriors,
        COUNT(CASE WHEN points >= 500 AND points < 1000 THEN 1 END) as eco_enthusiasts,
        COUNT(CASE WHEN points < 500 THEN 1 END) as eco_beginners
      FROM users u
      WHERE u.points > 0 ${dateFilter}
    `;

    const [statsRows] = await db.query(statsQuery);
    const stats = statsRows[0];

    // Get top performer for the period
    const topPerformerQuery = `
      SELECT name, points, total_cleanups 
      FROM users 
      WHERE points > 0 ${dateFilter}
      ORDER BY points DESC 
      LIMIT 1
    `;

    const [topPerformerRows] = await db.query(topPerformerQuery);
    const topPerformer = topPerformerRows[0] || null;

    res.json({
      success: true,
      data: {
        totalUsers: stats.total_users || 0,
        totalPoints: stats.total_points || 0,
        totalCleanups: stats.total_cleanups || 0,
        totalReports: stats.total_reports || 0,
        averagePoints: Math.round(stats.avg_points || 0),
        maxPoints: stats.max_points || 0,
        levelDistribution: {
          ecoLegends: stats.eco_legends || 0,
          ecoMasters: stats.eco_masters || 0,
          ecoExperts: stats.eco_experts || 0,
          ecoWarriors: stats.eco_warriors || 0,
          ecoEnthusiasts: stats.eco_enthusiasts || 0,
          ecoBeginners: stats.eco_beginners || 0
        },
        topPerformer
      },
      meta: {
        period
      }
    });

  } catch (error) {
    console.error('Error fetching leaderboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard stats' });
  }
});

module.exports = router;