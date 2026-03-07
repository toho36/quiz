import { runAuthoringSqliteMigrations } from '../lib/server/authoring-sqlite-store';

const requestedPath = process.argv[2];
const result = runAuthoringSqliteMigrations(requestedPath);

console.log(`Authoring SQLite database: ${result.databasePath}`);

if (result.appliedMigrations.length === 0) {
  console.log('No pending authoring migrations.');
} else {
  console.log(`Applied migrations: ${result.appliedMigrations.join(', ')}`);
}