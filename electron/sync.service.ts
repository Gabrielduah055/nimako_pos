import { LocalCashier, LocalProduct, LocalSession, LocalTransaction } from './types';
import { ProductRepository } from './repositories/product.repository';
import { CashierRepository } from './repositories/cashier.repository';
import { SessionRepository } from './repositories/session.repository';
import { TransactionRepository } from './repositories/transaction.repository';

const DEFAULT_API_URL = 'https://nimako-backend.onrender.com/api';

export class SyncService {
  constructor(
    private products: ProductRepository,
    private cashiers: CashierRepository,
    private sessions: SessionRepository,
    private transactions: TransactionRepository,
    private apiUrl = process.env['NIMAKO_API_URL'] || DEFAULT_API_URL
  ) {}

  async bootstrap(token?: string): Promise<{ products: number; cashiers: number }> {
    console.info('[sync] Bootstrap started.');
    const response = await fetch(`${this.apiUrl}/sync/bootstrap`, {
      headers: this.authHeaders(token),
    });

    if (!response.ok) {
      if (response.status === 404) {
        const message = 'Bootstrap endpoint was not found on the backend. Skipping initial product/cashier sync.';
        this.transactions.log('bootstrap', 'skipped', message);
        console.warn(`[sync] ${message}`);
        return { products: 0, cashiers: 0 };
      }

      throw new Error(`Bootstrap failed with HTTP ${response.status}.`);
    }

    const body = await response.json();
    const data = body?.data ?? body;
    const syncedAt = new Date().toISOString();

    const products: LocalProduct[] = (data.products ?? []).map((product: any) => ({
      id: String(product.id ?? product._id),
      name: product.name,
      barcode: product.barcode,
      price: Number(product.priceSingle ?? product.price ?? 0),
      priceSingle: Number(product.priceSingle ?? product.price ?? 0),
      priceBulk: Number(product.priceBulk ?? product.priceSingle ?? product.price ?? 0),
      quantity: Number(product.stock ?? product.quantity ?? 0),
      category: product.category ?? '',
      unitType: product.unit ?? product.unitType ?? 'piece',
      isActive: product.isActive !== false,
      lastSyncedAt: syncedAt,
    }));

    const cashiers: LocalCashier[] = (data.cashiers ?? []).map((cashier: any) => ({
      id: String(cashier.id ?? cashier._id),
      name: cashier.name,
      email: cashier.email,
      role: cashier.role,
      pinHash: cashier.pinHash,
      isActive: cashier.isActive !== false,
      lastSyncedAt: syncedAt,
    }));

    this.products.upsertMany(products);
    this.cashiers.upsertMany(cashiers);
    this.transactions.log('bootstrap', 'success', `Bootstrapped ${products.length} products and ${cashiers.length} cashiers.`);
    console.info(`[sync] Bootstrap success: ${products.length} products, ${cashiers.length} cashiers.`);

    return { products: products.length, cashiers: cashiers.length };
  }

  async syncPendingTransactions(token?: string): Promise<{ synced: number; failed: number; total: number }> {
    const pending = this.transactions.getPending();
    console.info(`[sync] Transaction sync started. Pending count: ${pending.length}.`);
    let synced = 0;
    let failed = 0;

    for (const transaction of pending) {
      this.transactions.markSyncing(transaction.localTransactionId);
      try {
        const response = await fetch(`${this.apiUrl}/transactions/sync`, {
          method: 'POST',
          headers: this.authHeaders(token),
          body: JSON.stringify({ transaction: this.toSyncPayload(transaction) }),
        });

        if (!response.ok) {
          throw new Error(`Transaction sync failed with HTTP ${response.status}.`);
        }

        const result = await response.json();
        if (result?.success === false) {
          throw new Error(result.message || 'Transaction sync failed.');
        }

        this.transactions.markSynced(transaction.localTransactionId);
        console.info(`[sync] Transaction synced: ${transaction.localTransactionId}.`);
        synced++;
      } catch (error: any) {
        this.transactions.markFailed(transaction.localTransactionId);
        this.transactions.log('transactions', 'failed', error.message || 'Transaction sync failed.');
        console.error(`[sync] Transaction sync failed: ${transaction.localTransactionId}.`, error);
        failed++;
      }
    }

    this.transactions.log('transactions', failed ? 'partial' : 'success', `Synced ${synced} of ${pending.length} local transactions.`);
    console.info(`[sync] Transaction sync complete. Synced: ${synced}, failed: ${failed}, total: ${pending.length}.`);
    return { synced, failed, total: pending.length };
  }

  async syncPendingSessions(token?: string): Promise<{ synced: number; failed: number; total: number }> {
    const pending = this.sessions.getPending();
    let synced = 0;
    let failed = 0;

    for (const session of pending) {
      try {
        const response = await fetch(`${this.apiUrl}/cashier-sessions/sync`, {
          method: 'POST',
          headers: this.authHeaders(token),
          body: JSON.stringify({ session }),
        });

        if (!response.ok) {
          throw new Error(`Session sync failed with HTTP ${response.status}.`);
        }

        const result = await response.json();
        if (result?.success === false) {
          throw new Error(result.message || 'Session sync failed.');
        }

        this.sessions.markSynced(session.id);
        synced++;
      } catch (error: any) {
        this.sessions.markFailed(session.id);
        this.transactions.log('cashier-sessions', 'failed', error.message || 'Session sync failed.');
        failed++;
      }
    }

    return { synced, failed, total: pending.length };
  }

  async syncAll(token?: string): Promise<{ transactions: { synced: number; failed: number; total: number }; sessions: { synced: number; failed: number; total: number } }> {
    const sessions = await this.syncPendingSessions(token);
    const transactions = await this.syncPendingTransactions(token);
    return { sessions, transactions };
  }

  private toSyncPayload(transaction: LocalTransaction): any {
    return {
      localTransactionId: transaction.localTransactionId,
      invoiceNumber: transaction.invoiceNumber,
      sessionId: transaction.sessionId,
      cashierId: transaction.cashierId,
      cashierName: transaction.cashierName,
      subtotal: transaction.subtotal,
      discountType: transaction.discountType,
      discountValue: transaction.discountValue,
      discountAmount: transaction.discountAmount,
      total: transaction.total,
      paymentMethod: transaction.paymentMethod,
      cashReceived: transaction.cashReceived,
      cashChange: transaction.cashChange,
      customerName: transaction.customerName ?? 'Walk-in Customer',
      createdAt: transaction.createdAt,
      items: transaction.items.map(item => ({
        productId: item.productId,
        productName: item.productName,
        barcode: item.barcode,
        quantity: item.quantity,
        unitType: item.unitType,
        unitPrice: item.unitPrice,
        total: item.total,
      })),
    };
  }

  private authHeaders(token?: string): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }
}
