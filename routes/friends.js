const express = require('express');
const router = express.Router();
const db = require('../config/database');
const jwt = require('jsonwebtoken');

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
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

// POST /api/users/friends - Add a friend
router.post('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { friendEmail, friendId } = req.body;

    if (!friendEmail && !friendId) {
      return res.status(400).json({ error: 'Friend email or ID is required' });
    }

    let targetUserId = friendId;

    // If email provided, find user by email
    if (friendEmail && !friendId) {
      const [userRows] = await db.query(
        `SELECT id FROM users WHERE email = '${friendEmail}'`
      );

      if (userRows.length === 0) {
        return res.status(404).json({ error: 'User not found with that email' });
      }

      targetUserId = userRows[0].id;
    }

    // Can't add yourself as friend
    if (parseInt(targetUserId) === parseInt(userId)) {
      return res.status(400).json({ error: 'Cannot add yourself as a friend' });
    }

    // Check if friendship already exists
    const [existingRows] = await db.query(
      `SELECT id, status FROM friends 
       WHERE (user_id = ${userId} AND friend_id = ${targetUserId}) OR (user_id = ${targetUserId} AND friend_id = ${userId})`
    );

    if (existingRows.length > 0) {
      const existing = existingRows[0];
      if (existing.status === 'accepted') {
        return res.status(400).json({ error: 'You are already friends with this user' });
      } else if (existing.status === 'blocked') {
        return res.status(400).json({ error: 'Cannot add this user as a friend' });
      } else if (existing.status === 'pending') {
        return res.status(400).json({ error: 'Friend request already pending' });
      }
    }

    // Add friendship (automatically accepted for simplicity)
    await db.query(
      `INSERT INTO friends (user_id, friend_id, status) VALUES (${userId}, ${targetUserId}, 'accepted')`
    );

    // Also add the reverse relationship for easy querying
    await db.query(
      `INSERT INTO friends (user_id, friend_id, status) VALUES (${targetUserId}, ${userId}, 'accepted')`
    );

    // Get the friend's details
    const [friendRows] = await db.query(
      `SELECT id, name, email, profile_picture_url, points, total_cleanups, total_reports, streak_days
       FROM users WHERE id = ${targetUserId}`
    );

    const friend = friendRows[0];
    const levelInfo = calculateUserLevel(friend.points);

    res.status(201).json({
      success: true,
      message: 'Friend added successfully',
      data: {
        id: friend.id,
        name: friend.name,
        email: friend.email,
        profilePictureUrl: friend.profile_picture_url,
        points: friend.points,
        totalCleanups: friend.total_cleanups,
        totalReports: friend.total_reports,
        streakDays: friend.streak_days,
        level: levelInfo.level,
        levelTier: levelInfo.tier,
        levelColor: levelInfo.color
      }
    });

  } catch (error) {
    console.error('Error adding friend:', error);
    res.status(500).json({ error: 'Failed to add friend' });
  }
});

// DELETE /api/users/friends/:id - Remove a friend
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const friendId = req.params.id;

    // Check if friendship exists
    const [existingRows] = await db.query(
      `SELECT id FROM friends 
       WHERE (user_id = ${userId} AND friend_id = ${friendId}) OR (user_id = ${friendId} AND friend_id = ${userId})`
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Friendship not found' });
    }

    // Remove both directions of the friendship
    await db.query(
      `DELETE FROM friends 
       WHERE (user_id = ${userId} AND friend_id = ${friendId}) OR (user_id = ${friendId} AND friend_id = ${userId})`
    );

    res.json({
      success: true,
      message: 'Friend removed successfully'
    });

  } catch (error) {
    console.error('Error removing friend:', error);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

// GET /api/users/friends - Get user's friends list
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

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
        f.created_at as friendship_date
      FROM friends f
      JOIN users u ON f.friend_id = u.id
      WHERE f.user_id = ? AND f.status = 'accepted'
      ORDER BY u.points DESC, u.name ASC
    `;

    const [rows] = await db.query(query.replace('?', userId));

    const friends = rows.map(friend => {
      const levelInfo = calculateUserLevel(friend.points);
      
      return {
        id: friend.id,
        name: friend.name,
        email: friend.email,
        profilePictureUrl: friend.profile_picture_url,
        points: friend.points,
        totalCleanups: friend.total_cleanups,
        totalReports: friend.total_reports,
        streakDays: friend.streak_days,
        level: levelInfo.level,
        levelTier: levelInfo.tier,
        levelColor: levelInfo.color,
        lastActivity: friend.last_activity,
        friendshipDate: friend.friendship_date
      };
    });

    res.json({
      success: true,
      data: friends,
      meta: {
        total: friends.length
      }
    });

  } catch (error) {
    console.error('Error fetching friends:', error);
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

// GET /api/users/friends/search - Search for users to add as friends
router.get('/search', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { q: searchQuery, limit = 20 } = req.query;

    if (!searchQuery || searchQuery.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const query = `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.profile_picture_url,
        u.points,
        u.total_cleanups,
        u.total_reports,
        CASE 
          WHEN f.id IS NOT NULL THEN 'friends'
          ELSE 'not_friends'
        END as friendship_status
      FROM users u
      LEFT JOIN friends f ON (f.user_id = ? AND f.friend_id = u.id AND f.status = 'accepted')
      WHERE u.id != ? 
        AND (u.name LIKE ? OR u.email LIKE ?)
      ORDER BY 
        CASE WHEN f.id IS NOT NULL THEN 0 ELSE 1 END,
        u.points DESC,
        u.name ASC
      LIMIT ?
    `;

    const searchTerm = `%${searchQuery.trim()}%`;
    const [rows] = await db.query(
      query.replace('?', userId).replace('?', userId).replace('?', `'${searchTerm}'`).replace('?', `'${searchTerm}'`).replace('?', parseInt(limit))
    );

    const users = rows.map(user => {
      const levelInfo = calculateUserLevel(user.points);
      
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        profilePictureUrl: user.profile_picture_url,
        points: user.points,
        totalCleanups: user.total_cleanups,
        totalReports: user.total_reports,
        level: levelInfo.level,
        levelTier: levelInfo.tier,
        levelColor: levelInfo.color,
        friendshipStatus: user.friendship_status
      };
    });

    res.json({
      success: true,
      data: users,
      meta: {
        searchQuery,
        total: users.length,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

module.exports = router;