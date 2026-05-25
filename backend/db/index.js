const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { initializeSchema } = require('./schema');

const dbPath = path.resolve(__dirname, '..', process.env.DB_PATH || './data/db.sqlite');
const dataDir = path.dirname(dbPath);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
initializeSchema(db);

module.exports = db;
