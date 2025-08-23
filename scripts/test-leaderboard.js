require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'trash_clean',
  port: process.env.DB_PORT || 3306,
});

async function testQuery() {
  let connection;
  try {
    connection = await pool.getConnection();
    console.log('Connected to database');

    // Test simple query first
    const simpleQuery = `
      SELECT 
        u.id,
        u.name,
        u.points,
        u.total_cleanups
      FROM users u
      WHERE u.points > 0
      ORDER BY u.points DESC
      LIMIT ?
    `;

    console.log('\nTesting simple query...');
    const [rows] = await connection.query(simpleQuery.replace('?', '5'));
    console.log('Results:', rows.length);
    rows.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name}: ${user.points} points`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

testQuery();