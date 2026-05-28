const Database = require('./backend/node_modules/better-sqlite3');
const path = require('path');

const db = new Database(path.resolve('./backend/data/db.sqlite'));

// Check all tables and their FK constraints
const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all();
console.log('Tables:', tables.map(t => t.name).join(', '));

for (const { name } of tables) {
  const fks = db.prepare(`PRAGMA foreign_key_list(${name})`).all();
  if (fks.length > 0) {
    console.log(`\n${name} FKs:`);
    fks.forEach(fk => console.log(`  -> ${fk.table}.${fk.to} ON DELETE ${fk.on_delete}`));
  }
}

// Check srs_sections CREATE statement
const srsSections = db.prepare(`SELECT sql FROM sqlite_master WHERE name='srs_sections'`).get();
console.log('\nsrs_sections CREATE SQL:', srsSections?.sql);

// Check logs table
const logs = db.prepare(`SELECT sql FROM sqlite_master WHERE name='logs'`).get();
console.log('\nlogs CREATE SQL:', logs?.sql);

db.close();
