require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'trash_clean',
  port: process.env.DB_PORT || 3306,
});

const mockUsers = [
  {
    name: 'Ana Novak',
    email: 'ana.novak@gmail.com',
    points: 8750,
    total_cleanups: 45,
    total_reports: 52,
    streak_days: 12,
    rank: 'Eco Master'
  },
  {
    name: 'Marko Petrović',
    email: 'marko.petrovic@gmail.com',
    points: 6420,
    total_cleanups: 38,
    total_reports: 41,
    streak_days: 8,
    rank: 'Eco Master'
  },
  {
    name: 'Luka Horvat',
    email: 'luka.horvat@gmail.com',
    points: 4350,
    total_cleanups: 29,
    total_reports: 35,
    streak_days: 15,
    rank: 'Eco Expert'
  },
  {
    name: 'Sara Kos',
    email: 'sara.kos@gmail.com',
    points: 3200,
    total_cleanups: 22,
    total_reports: 28,
    streak_days: 6,
    rank: 'Eco Expert'
  },
  {
    name: 'Jože Kranjc',
    email: 'joze.kranjc@gmail.com',
    points: 2850,
    total_cleanups: 19,
    total_reports: 24,
    streak_days: 9,
    rank: 'Eco Expert'
  },
  {
    name: 'Nina Žagar',
    email: 'nina.zagar@gmail.com',
    points: 1750,
    total_cleanups: 15,
    total_reports: 18,
    streak_days: 4,
    rank: 'Eco Warrior'
  },
  {
    name: 'Miha Štefan',
    email: 'miha.stefan@gmail.com',
    points: 1420,
    total_cleanups: 12,
    total_reports: 16,
    streak_days: 7,
    rank: 'Eco Warrior'
  },
  {
    name: 'Katja Novak',
    email: 'katja.novak@gmail.com',
    points: 980,
    total_cleanups: 8,
    total_reports: 12,
    streak_days: 3,
    rank: 'Eco Enthusiast'
  },
  {
    name: 'Tomaž Gornik',
    email: 'tomaz.gornik@gmail.com',
    points: 750,
    total_cleanups: 6,
    total_reports: 9,
    streak_days: 2,
    rank: 'Eco Enthusiast'
  },
  {
    name: 'Maja Košir',
    email: 'maja.kosir@gmail.com',
    points: 450,
    total_cleanups: 4,
    total_reports: 6,
    streak_days: 1,
    rank: 'Eco Beginner'
  },
  {
    name: 'David Petek',
    email: 'david.petek@gmail.com',
    points: 320,
    total_cleanups: 3,
    total_reports: 4,
    streak_days: 0,
    rank: 'Eco Beginner'
  },
  {
    name: 'Eva Jerin',
    email: 'eva.jerin@gmail.com',
    points: 180,
    total_cleanups: 2,
    total_reports: 3,
    streak_days: 1,
    rank: 'Eco Beginner'
  }
];

async function seedUsers() {
  let connection;
  try {
    connection = await pool.getConnection();
    console.log('Connected to database');

    // Hash password for all users
    const defaultPassword = await bcrypt.hash('password123', 10);

    const query = `
      INSERT INTO users (
        name, email, password_hash, points, total_cleanups, 
        total_reports, streak_days, \`rank\`, last_activity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const user of mockUsers) {
      try {
        await connection.execute(query, [
          user.name,
          user.email,
          defaultPassword,
          user.points,
          user.total_cleanups,
          user.total_reports,
          user.streak_days,
          user.rank,
          new Date().toISOString().split('T')[0] // today
        ]);
        console.log(`✅ Added user: ${user.name}`);
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          console.log(`⚠️  User ${user.name} already exists, skipping...`);
        } else {
          throw error;
        }
      }
    }

    console.log(`✅ Successfully processed ${mockUsers.length} users`);

  } catch (error) {
    console.error('❌ Error seeding users:', error);
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

seedUsers();