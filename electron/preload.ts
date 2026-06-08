import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  saveTransaction: (transaction: unknown) => ipcRenderer.invoke('transaction:save', transaction),
  getPendingTransactions: () => ipcRenderer.invoke('transaction:pending'),
  syncPendingTransactions: (token?: string) => ipcRenderer.invoke('sync:pending', token),
  bootstrapSync: (token?: string) => ipcRenderer.invoke('sync:bootstrap', token),
  getProducts: (search?: string) => ipcRenderer.invoke('products:get', search),
  getProductByBarcode: (barcode: string) => ipcRenderer.invoke('products:barcode', barcode),
  saveProducts: (products: unknown[]) => ipcRenderer.invoke('products:save', products),
  getCashiers: () => ipcRenderer.invoke('cashiers:get'),
  getCashierByEmail: (email: string) => ipcRenderer.invoke('cashiers:get-by-email', email),
  saveCashierProfile: (cashier: unknown) => ipcRenderer.invoke('cashiers:save-profile', cashier),
  setCashierPin: (cashierId: string, pin: string) => ipcRenderer.invoke('cashiers:set-pin', { cashierId, pin }),
  verifyCashierPin: (email: string, pin: string) => ipcRenderer.invoke('cashiers:verify-pin', { email, pin }),
  openCashierSession: (session: unknown) => ipcRenderer.invoke('sessions:open', session),
  closeCashierSession: (sessionId: string, closingCash: number) => ipcRenderer.invoke('sessions:close', { sessionId, closingCash }),
  getCurrentSession: () => ipcRenderer.invoke('sessions:current'),
  getSyncStatus: () => ipcRenderer.invoke('sync:status'),
});
