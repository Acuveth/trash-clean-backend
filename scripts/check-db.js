require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'trash_clean',
  port: process.env.DB_PORT || 3306,
});

async function checkDatabase() {
  let connection;
  try {
    connection = await pool.getConnection();
    console.log('Connected to database');

    // Check users table structure
    const [columns] = await connection.execute('SHOW COLUMNS FROM users');
    console.log('\nUsers table columns:');
    columns.forEach(col => {
      console.log(`- ${col.Field} (${col.Type}) ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'} ${col.Default ? `DEFAULT ${col.Default}` : ''}`);
    });

    // Check sample data
    const [users] = await connection.execute('SELECT id, name, email, points FROM users LIMIT 5');
    console.log('\nSample users:');
    users.forEach(user => {
      console.log(`- ${user.name}: ${user.points} points`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

checkDatabase();