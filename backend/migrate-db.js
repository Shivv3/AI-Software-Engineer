const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, process.env.DB_PATH || './data/db.sqlite');
console.log('Using database at:', dbPath);

const db = new Database(dbPath);

try {
  // Check if projects table exists
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='projects'
  `).get();
  
  if (tableExists) {
    const tableInfo = db.prepare(`PRAGMA table_info(projects)`).all();
    const columnNames = tableInfo.map(col => col.name);
    const hasUserIdColumn = columnNames.includes('user_id');
    
    console.log('Current projects table columns:', columnNames.join(', '));
    
    if (!hasUserIdColumn) {
      console.log('Migrating database: Adding user_id column to projects table...');
      
      // Disable foreign key constraints temporarily
      db.exec(`PRAGMA foreign_keys = OFF`);
      
      // Delete related records first (srs_versions, logs, etc.)
      try {
        const deleteVersions = db.prepare(`DELETE FROM srs_versions`);
        const versionsResult = deleteVersions.run();
        console.log(`Deleted ${versionsResult.changes} SRS versions.`);
      } catch (e) {
        console.log('No SRS versions to delete or table does not exist.');
      }
      
      try {
        const deleteLogs = db.prepare(`DELETE FROM logs`);
        const logsResult = deleteLogs.run();
        console.log(`Deleted ${logsResult.changes} log entries.`);
      } catch (e) {
        console.log('No logs to delete or table does not exist.');
      }
      
      // Delete all existing projects since they don't have user associations
      const deleteStmt = db.prepare(`DELETE FROM projects`);
      const result = deleteStmt.run();
      console.log(`Deleted ${result.changes} existing projects without user associations.`);
      
      // Add user_id column
      db.exec(`ALTER TABLE projects ADD COLUMN user_id TEXT`);
      
      // Re-enable foreign key constraints
      db.exec(`PRAGMA foreign_keys = ON`);
      
      console.log('✅ Database migration completed successfully. user_id column added.');
    } else {
      console.log('✅ Database schema is up to date. user_id column already exists.');
    }
  } else {
    console.log('Projects table does not exist yet.');
  }
  
  db.close();
  console.log('Migration script completed.');
} catch (error) {
  console.error('❌ Migration error:', error);
  db.close();
  process.exit(1);
}

