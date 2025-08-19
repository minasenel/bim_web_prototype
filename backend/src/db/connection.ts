import Database from 'better-sqlite3';
import path from 'path';

let dbInstance: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!dbInstance) {
    const dbPath = path.resolve(__dirname, '../../data/bim.db');
    dbInstance = new Database(dbPath);
  }
  return dbInstance;
}

export function ensureDatabaseInitialized(): void {
  const db = getDatabase();
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      brand TEXT,
      category TEXT
    );
    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      address TEXT
    );
    CREATE TABLE IF NOT EXISTS stock (
      product_id INTEGER NOT NULL,
      store_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (product_id, store_id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (store_id) REFERENCES stores(id)
    );
  `);
}


