// config/db.js
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST,          // TiDB host from secret
  port: Number(process.env.DB_PORT),  // TiDB port (usually 4000)
  user: process.env.DB_USERNAME,      // TiDB username
  password: process.env.DB_PASSWORD,  // TiDB password
  database: process.env.DB_DATABASE,  // TiDB database name
  ssl: {
    rejectUnauthorized: true,         // enforce SSL (TiDB requires it)
  },
  connectionLimit: 10,                // keep pool small for serverless
  connectTimeout: 10000,              // 10s timeout
});

export default pool;



