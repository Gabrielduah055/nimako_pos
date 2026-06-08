export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface LocalProduct {
  id: string;
  name: string;
  barcode: string;
  price: number;
  priceSingle?: number;
  priceBulk?: number;
  quantity: number;
  category?: string;
  unitType?: string;
  isActive: boolean;
  lastSyncedAt?: string;
}

export interface LocalCashier {
  id: string;
  name: string;
  email: string;
  role: string;
  pinHash?: string;
  offlinePinSetAt?: string;
  isActive: boolean;
  lastSyncedAt?: string;
}

export interface LocalSession {
  id: string;
  cashierId: string;
  cashierName: string;
  openedAt: string;
  closedAt?: string;
  openingCash: number;
  closingCash?: number;
  status: 'open' | 'closed';
  syncStatus: SyncStatus;
  syncedAt?: string;
}

export interface LocalTransactionItem {
  id?: number;
  transactionId?: number;
  productId: string;
  productName: string;
  barcode: string;
  quantity: number;
  unitType: 'single' | 'bulk';
  unitPrice: number;
  total: number;
}

export interface LocalTransaction {
  id?: number;
  localTransactionId: string;
  invoiceNumber: string;
  cashierId: string;
  cashierName: string;
  sessionId?: string;
  subtotal: number;
  discountType: 'percentage' | 'fixed' | 'none';
  discountValue: number;
  discountAmount: number;
  total: number;
  paymentMethod: 'cash' | 'transfer' | 'mixed';
  cashReceived: number;
  cashChange: number;
  customerName?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  syncedAt?: string;
  items: LocalTransactionItem[];
}

export interface SyncStatusSummary {
  pendingCount: number;
  failedCount: number;
  syncingCount: number;
  lastSyncAt?: string;
  lastMessage?: string;
}
