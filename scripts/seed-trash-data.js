require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'trash_clean',
  port: process.env.DB_PORT || 3306,
});

const mockTrashReports = [
  {
    latitude: 45.9598,
    longitude: 13.6476,
    photo_url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
    description: 'Large pile of plastic bottles near the park entrance',
    trash_type: 'plastic',
    size: 'large',
    status: 'pending',
    points: 30,
    trash_count: 20,
    trash_types: JSON.stringify(['plastic_bottles', 'plastic_bags']),
    severity: 'high',
    location_context: 'Mestni Park Nova Gorica - Main Entrance',
    ai_description: 'Multiple plastic bottles and bags scattered around park entrance area. Estimated 20+ items.',
    ai_analyzed: true
  },
  {
    latitude: 45.9563,
    longitude: 13.6494,
    photo_url: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=800',
    description: 'Food waste and packaging near bus stop',
    trash_type: 'mixed',
    size: 'medium',
    status: 'pending',
    points: 20,
    trash_count: 10,
    trash_types: JSON.stringify(['food_waste', 'paper', 'plastic']),
    severity: 'medium',
    location_context: 'Avtobusna postaja Nova Gorica',
    ai_description: 'Mixed waste including food containers and wrappers near public transport area.',
    ai_analyzed: true
  },
  {
    latitude: 45.9577,
    longitude: 13.6418,
    photo_url: 'https://images.unsplash.com/photo-1528190336454-13cd56b45b5a?w=800',
    description: 'Glass bottles dumped near recycling bin',
    trash_type: 'glass',
    size: 'small',
    status: 'cleaned',
    points: 15,
    trash_count: 5,
    trash_types: JSON.stringify(['glass_bottles']),
    severity: 'low',
    location_context: 'Bevkov trg - Recycling Point',
    ai_description: 'Several glass bottles left outside recycling container.',
    ai_analyzed: true,
    cleaned_at: new Date(Date.now() - 86400000).toISOString().slice(0, 19).replace('T', ' ')
  },
  {
    latitude: 45.9542,
    longitude: 13.6521,
    photo_url: 'https://images.unsplash.com/photo-1563725911583-7d108f720483?w=800',
    description: 'Cigarette butts around bench area',
    trash_type: 'cigarette_butts',
    size: 'small',
    status: 'pending',
    points: 10,
    trash_count: 50,
    trash_types: JSON.stringify(['cigarette_butts']),
    severity: 'low',
    location_context: 'Kidričeva ulica - Public Bench',
    ai_description: 'Numerous cigarette butts scattered around seating area.',
    ai_analyzed: true
  },
  {
    latitude: 45.9612,
    longitude: 13.6389,
    photo_url: 'https://images.unsplash.com/photo-1604187351574-c75ca79f5807?w=800',
    description: 'Construction debris on sidewalk',
    trash_type: 'construction',
    size: 'large',
    status: 'pending',
    points: 40,
    trash_count: 15,
    trash_types: JSON.stringify(['construction_debris', 'wood', 'metal']),
    severity: 'high',
    location_context: 'Solkan - Construction Site',
    ai_description: 'Construction materials and debris blocking pedestrian walkway.',
    ai_analyzed: true
  },
  {
    latitude: 45.9555,
    longitude: 13.6463,
    photo_url: 'https://images.unsplash.com/photo-1534239697798-120952b76f2b?w=800',
    description: 'Old furniture dumped in alley',
    trash_type: 'furniture',
    size: 'large',
    status: 'pending',
    points: 35,
    trash_count: 3,
    trash_types: JSON.stringify(['furniture', 'wood']),
    severity: 'high',
    location_context: 'Erjavčeva ulica - Back Alley',
    ai_description: 'Abandoned furniture including chairs and broken table.',
    ai_analyzed: true
  },
  {
    latitude: 45.9589,
    longitude: 13.6502,
    photo_url: 'https://images.unsplash.com/photo-1530210124550-912dc1381cb8?w=800',
    description: 'Paper waste scattered by wind',
    trash_type: 'paper',
    size: 'medium',
    status: 'cleaned',
    points: 15,
    trash_count: 12,
    trash_types: JSON.stringify(['paper', 'cardboard']),
    severity: 'medium',
    location_context: 'Qlandia Nova Gorica - Parking',
    ai_description: 'Papers and cardboard boxes scattered across parking area.',
    ai_analyzed: true,
    cleaned_at: new Date(Date.now() - 172800000).toISOString().slice(0, 19).replace('T', ' ')
  },
  {
    latitude: 45.9571,
    longitude: 13.6435,
    photo_url: 'https://images.unsplash.com/photo-1567393528677-d6adae7d4a0a?w=800',
    description: 'Medical waste found near clinic',
    trash_type: 'hazardous',
    size: 'small',
    status: 'pending',
    points: 50,
    trash_count: 8,
    trash_types: JSON.stringify(['medical_waste', 'hazardous']),
    severity: 'critical',
    location_context: 'Near Zdravstveni dom Nova Gorica',
    ai_description: 'HAZARDOUS: Medical waste requiring special disposal procedures.',
    ai_analyzed: true
  },
  {
    latitude: 45.9535,
    longitude: 13.6478,
    photo_url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
    description: 'Electronic waste - old computers',
    trash_type: 'electronic',
    size: 'large',
    status: 'pending',
    points: 45,
    trash_count: 4,
    trash_types: JSON.stringify(['electronic_waste', 'computers']),
    severity: 'high',
    location_context: 'Tehnološki park Nova Gorica',
    ai_description: 'Electronic waste including monitors and computer parts requiring special recycling.',
    ai_analyzed: true
  },
  {
    latitude: 45.9604,
    longitude: 13.6447,
    photo_url: 'https://images.unsplash.com/photo-1526951521990-620dc14c214b?w=800',
    description: 'Textile waste and old clothes',
    trash_type: 'textile',
    size: 'medium',
    status: 'pending',
    points: 20,
    trash_count: 15,
    trash_types: JSON.stringify(['textile', 'clothes']),
    severity: 'medium',
    location_context: 'Rdeči križ Nova Gorica - Donation Box',
    ai_description: 'Clothing and textile materials left outside donation container.',
    ai_analyzed: true
  }
];

async function seedDatabase() {
  let connection;
  try {
    connection = await pool.getConnection();
    console.log('Connected to database');

    const query = `
      INSERT INTO trash_reports (
        latitude, longitude, photo_url, description, trash_type, 
        size, status, points, trash_count, trash_types, 
        severity, location_context, ai_description, ai_analyzed, cleaned_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const report of mockTrashReports) {
      await connection.execute(query, [
        report.latitude,
        report.longitude,
        report.photo_url,
        report.description,
        report.trash_type,
        report.size,
        report.status,
        report.points,
        report.trash_count,
        report.trash_types,
        report.severity,
        report.location_context,
        report.ai_description,
        report.ai_analyzed,
        report.cleaned_at || null
      ]);
    }

    console.log(`✅ Successfully inserted ${mockTrashReports.length} mock trash reports`);

  } catch (error) {
    console.error('❌ Error seeding database:', error);
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

seedDatabase();