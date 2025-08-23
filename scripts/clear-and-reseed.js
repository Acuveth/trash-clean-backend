require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'trash_clean',
  port: process.env.DB_PORT || 3306,
});

async function clearAndReseed() {
  let connection;
  try {
    connection = await pool.getConnection();
    console.log('Connected to database');
    
    console.log('Clearing existing trash reports...');
    await connection.execute('DELETE FROM trash_reports');
    console.log('✅ Cleared existing data');
    
    console.log('Now run: node scripts/seed-trash-data.js');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

clearAndReseed();