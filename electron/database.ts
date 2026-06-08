import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { DatabaseSync } from 'node:sqlite';

let db: DatabaseSync | null = null;

export const getDatabase = (): DatabaseSync => {
  if (db) return db;

  try {
    const dataDir = app.getPath('userData');
    fs.mkdirSync(dataDir, { recursive: true });

    const databasePath = path.join(dataDir, 'nimako-pos.sqlite');
    console.info(`[sqlite] Database path: ${databasePath}`);

    db = new DatabaseSync(databasePath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db);

    console.info('[sqlite] Database initialized successfully.');
    return db;
  } catch (error) {
    console.error('[sqlite] Database initialization failed:', error);
    throw error;
  }
};

const migrate = (database: DatabaseSync): void => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      barcode TEXT UNIQUE NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      priceSingle REAL NOT NULL DEFAULT 0,
      priceBulk REAL NOT NULL DEFAULT 0,
      quantity REAL NOT NULL DEFAULT 0,
      category TEXT,
      unitType TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      lastSyncedAt TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

    CREATE TABLE IF NOT EXISTS cashiers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL,
      pinHash TEXT,
      offlinePinSetAt TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      lastSyncedAt TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_cashiers_email ON cashiers(email);

    CREATE TABLE IF NOT EXISTS cashier_sessions (
      id TEXT PRIMARY KEY,
      cashierId TEXT NOT NULL,
      cashierName TEXT NOT NULL,
      openedAt TEXT NOT NULL,
      closedAt TEXT,
      openingCash REAL NOT NULL DEFAULT 0,
      closingCash REAL,
      status TEXT NOT NULL DEFAULT 'open',
      syncStatus TEXT NOT NULL DEFAULT 'pending',
      syncedAt TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_status ON cashier_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_sync_status ON cashier_sessions(syncStatus);

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      localTransactionId TEXT UNIQUE NOT NULL,
      invoiceNumber TEXT UNIQUE NOT NULL,
      cashierId TEXT NOT NULL,
      cashierName TEXT NOT NULL,
      sessionId TEXT,
      subtotal REAL NOT NULL,
      discountType TEXT NOT NULL DEFAULT 'none',
      discountValue REAL NOT NULL DEFAULT 0,
      discountAmount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      paymentMethod TEXT NOT NULL,
      cashReceived REAL NOT NULL DEFAULT 0,
      cashChange REAL NOT NULL DEFAULT 0,
      customerName TEXT,
      syncStatus TEXT NOT NULL DEFAULT 'pending',
      createdAt TEXT NOT NULL,
      syncedAt TEXT,
      FOREIGN KEY (sessionId) REFERENCES cashier_sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_sync_status ON transactions(syncStatus);
    CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(createdAt);
    CREATE INDEX IF NOT EXISTS idx_transactions_cashier ON transactions(cashierId);
    CREATE INDEX IF NOT EXISTS idx_transactions_session ON transactions(sessionId);

    CREATE TABLE IF NOT EXISTS transaction_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transactionId INTEGER NOT NULL,
      productId TEXT NOT NULL,
      productName TEXT NOT NULL,
      barcode TEXT NOT NULL,
      quantity REAL NOT NULL,
      unitType TEXT NOT NULL,
      unitPrice REAL NOT NULL,
      total REAL NOT NULL,
      FOREIGN KEY (transactionId) REFERENCES transactions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction ON transaction_items(transactionId);
    CREATE INDEX IF NOT EXISTS idx_transaction_items_product ON transaction_items(productId);

    CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      syncType TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON sync_logs(createdAt);
  `);

  ensureColumn(database, 'cashiers', 'offlinePinSetAt', 'TEXT');
};

const ensureColumn = (database: DatabaseSync, table: string, column: string, type: string): void => {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some(existing => existing.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
};
