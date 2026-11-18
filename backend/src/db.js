require('dotenv').config();
const mysql = require('mysql2/promise');

module.exports = mysql.createPool({
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  dateStrings: true,          // fechas 'YYYY-MM-DD'
  connectionLimit: 5,
});
