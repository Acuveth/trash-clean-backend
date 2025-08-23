require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'trash_clean',
  port: process.env.DB_PORT || 3306,
});

async function addMissingColumns() {
  let connection;
  try {
    connection = await pool.getConnection();
    console.log('Connected to database');

    // Add missing columns to users table
    const columnsToAdd = [
      'ADD COLUMN oauth_provider VARCHAR(20) NULL',
      'ADD COLUMN oauth_id VARCHAR(100) NULL',
      'ADD COLUMN profile_picture_url TEXT NULL',
      'ADD COLUMN is_oauth_user BOOLEAN DEFAULT FALSE'
    ];

    for (const columnSQL of columnsToAdd) {
      try {
        await connection.execute(`ALTER TABLE users ${columnSQL}`);
        console.log(`✅ Added: ${columnSQL}`);
      } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
          console.log(`⚠️  Column already exists: ${columnSQL}`);
        } else {
          console.error(`❌ Error adding ${columnSQL}:`, error.message);
        }
      }
    }

    // Add indexes if they don't exist
    try {
      await connection.execute('CREATE INDEX idx_oauth_lookup ON users (oauth_provider, oauth_id)');
      console.log('✅ Added oauth lookup index');
    } catch (error) {
      if (error.code === 'ER_DUP_KEYNAME') {
        console.log('⚠️  OAuth lookup index already exists');
      } else {
        console.error('❌ Error adding oauth index:', error.message);
      }
    }

    try {
      await connection.execute('CREATE INDEX idx_email ON users (email)');
      console.log('✅ Added email index');
    } catch (error) {
      if (error.code === 'ER_DUP_KEYNAME') {
        console.log('⚠️  Email index already exists');
      } else {
        console.error('❌ Error adding email index:', error.message);
      }
    }

    console.log('\n✅ Database schema update completed');

  } catch (error) {
    console.error('❌ Error updating schema:', error);
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

addMissingColumns();