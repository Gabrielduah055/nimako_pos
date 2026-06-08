import path from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { getDatabase } from './database';
import { ProductRepository } from './repositories/product.repository';
import { CashierRepository } from './repositories/cashier.repository';
import { SessionRepository } from './repositories/session.repository';
import { TransactionRepository } from './repositories/transaction.repository';
import { SyncService } from './sync.service';

let mainWindow: BrowserWindow | null = null;

const createRepositories = () => {
  const db = getDatabase();
  const productRepository = new ProductRepository(db);
  const cashierRepository = new CashierRepository(db);
  const sessionRepository = new SessionRepository(db);
  const transactionRepository = new TransactionRepository(db, productRepository);
  transactionRepository.resetSyncingToPending();
  const syncService = new SyncService(productRepository, cashierRepository, sessionRepository, transactionRepository);

  return {
    productRepository,
    cashierRepository,
    sessionRepository,
    transactionRepository,
    syncService,
  };
};

let repositories: ReturnType<typeof createRepositories>;

const registerIpc = (): void => {
  try {
    repositories = createRepositories();
  } catch (error) {
    console.error('[electron] Failed to initialize local repositories:', error);
    throw error;
  }
  ipcMain.handle('transaction:save', (_event, transaction) => repositories.transactionRepository.save(transaction));
  ipcMain.handle('transaction:pending', () => repositories.transactionRepository.getPending());
  ipcMain.handle('sync:pending', (_event, token?: string) => repositories.syncService.syncAll(token));
  ipcMain.handle('sync:bootstrap', (_event, token?: string) => repositories.syncService.bootstrap(token));
  ipcMain.handle('sync:status', () => repositories.transactionRepository.getStatus());
  ipcMain.handle('products:get', (_event, search?: string) => repositories.productRepository.findAll(search));
  ipcMain.handle('products:barcode', (_event, barcode: string) => repositories.productRepository.findByBarcode(barcode));
  ipcMain.handle('products:save', (_event, products) => {
    repositories.productRepository.upsertMany(products);
    return { saved: products.length };
  });
  ipcMain.handle('cashiers:get', () => repositories.cashierRepository.findAllSafe());
  ipcMain.handle('cashiers:get-by-email', (_event, email: string) => repositories.cashierRepository.findSafeByEmail(email));
  ipcMain.handle('cashiers:save-profile', (_event, cashier) => repositories.cashierRepository.saveProfile(cashier));
  ipcMain.handle('cashiers:set-pin', (_event, { cashierId, pin }) => repositories.cashierRepository.setPin(cashierId, pin));
  ipcMain.handle('cashiers:verify-pin', (_event, { email, pin }) => repositories.cashierRepository.verifyPinSafe(email, pin));
  ipcMain.handle('sessions:open', (_event, session) => repositories.sessionRepository.open(session));
  ipcMain.handle('sessions:close', (_event, { sessionId, closingCash }) => repositories.sessionRepository.close(sessionId, closingCash));
  ipcMain.handle('sessions:current', () => repositories.sessionRepository.getCurrent());
};

const createWindow = async (): Promise<void> => {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devUrl = process.env['ELECTRON_DEV_URL'];
  if (devUrl) {
    await mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'nimako_pos', 'browser', 'index.html'));
};

app.whenReady().then(() => {
  registerIpc();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
