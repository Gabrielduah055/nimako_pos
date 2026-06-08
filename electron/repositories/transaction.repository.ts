import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { LocalTransaction, LocalTransactionItem, SyncStatusSummary } from '../types';
import { ProductRepository } from './product.repository';

export class TransactionRepository {
  constructor(private db: DatabaseSync, private products: ProductRepository) {}

  save(input: Partial<LocalTransaction> & { items: LocalTransactionItem[] }): LocalTransaction {
    if (!input.sessionId) {
      throw new Error('An active cashier session is required before a transaction can be saved.');
    }

    const createdAt = input.createdAt ?? new Date().toISOString();
    const localTransactionId = input.localTransactionId ?? `LOCAL-${crypto.randomUUID()}`;
    const invoiceNumber = input.invoiceNumber ?? this.generateInvoiceNumber();
    const subtotal = Number(input.subtotal) || this.sum(input.items);
    const discountAmount = Number(input.discountAmount ?? input.discountValue ?? 0) || 0;
    const total = Number(input.total) || Math.max(0, subtotal - discountAmount);
    const cashReceived = Number(input.cashReceived) || 0;
    const cashChange = Number(input.cashChange) || Math.max(0, cashReceived - total);

    let committed = false;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = this.db.prepare(`
        INSERT INTO transactions (
          localTransactionId, invoiceNumber, cashierId, cashierName, sessionId,
          subtotal, discountType, discountValue, discountAmount, total, paymentMethod,
          cashReceived, cashChange, customerName, syncStatus, createdAt
        )
        VALUES (
          @localTransactionId, @invoiceNumber, @cashierId, @cashierName, @sessionId,
          @subtotal, @discountType, @discountValue, @discountAmount, @total, @paymentMethod,
          @cashReceived, @cashChange, @customerName, 'pending', @createdAt
        )
      `).run({
        localTransactionId,
        invoiceNumber,
        cashierId: input.cashierId,
        cashierName: input.cashierName,
        sessionId: input.sessionId ?? null,
        subtotal,
        discountType: input.discountType ?? 'none',
        discountValue: Number(input.discountValue) || 0,
        discountAmount,
        total,
        paymentMethod: input.paymentMethod ?? 'cash',
        cashReceived,
        cashChange,
        customerName: input.customerName ?? 'Walk-in Customer',
        createdAt,
      });

      const transactionId = Number(result.lastInsertRowid);
      const itemStmt = this.db.prepare(`
        INSERT INTO transaction_items (transactionId, productId, productName, barcode, quantity, unitType, unitPrice, total)
        VALUES (@transactionId, @productId, @productName, @barcode, @quantity, @unitType, @unitPrice, @total)
      `);

      for (const item of input.items) {
        const quantity = Number(item.quantity) || 0;
        itemStmt.run({
          transactionId,
          productId: item.productId,
          productName: item.productName,
          barcode: item.barcode,
          quantity,
          unitType: item.unitType,
          unitPrice: Number(item.unitPrice) || 0,
          total: Number(item.total) || quantity * Number(item.unitPrice || 0),
        });
        this.products.reduceStock(item.productId, quantity);
      }

      this.db.exec('COMMIT');
      committed = true;
      const saved = this.findById(transactionId);
      if (!saved) throw new Error('Local transaction save failed.');
      this.log('transactions', 'pending', `Saved local transaction ${localTransactionId}.`);
      console.info(`[sqlite] Transaction saved locally: ${localTransactionId}`);
      return saved;
    } catch (error) {
      if (!committed) this.db.exec('ROLLBACK');
      console.error('[sqlite] Local transaction save failed:', error);
      throw error;
    }

  }

  getPending(): LocalTransaction[] {
    return this.db.prepare(`
      SELECT * FROM transactions
      WHERE syncStatus IN ('pending', 'failed')
      ORDER BY createdAt ASC
    `).all().map(row => this.withItems(row));
  }

  markSyncing(localTransactionId: string): void {
    this.db.prepare("UPDATE transactions SET syncStatus = 'syncing' WHERE localTransactionId = ?").run(localTransactionId);
  }

  markSynced(localTransactionId: string): void {
    this.db.prepare("UPDATE transactions SET syncStatus = 'synced', syncedAt = ? WHERE localTransactionId = ?")
      .run(new Date().toISOString(), localTransactionId);
  }

  markFailed(localTransactionId: string): void {
    this.db.prepare("UPDATE transactions SET syncStatus = 'failed' WHERE localTransactionId = ?").run(localTransactionId);
  }

  resetSyncingToPending(): void {
    const result = this.db.prepare("UPDATE transactions SET syncStatus = 'pending' WHERE syncStatus = 'syncing'").run();
    if (Number(result.changes) > 0) {
      console.info(`[sqlite] Reset ${String(result.changes)} interrupted syncing transaction(s) to pending.`);
    }
  }

  getStatus(): SyncStatusSummary {
    const pendingRow = this.db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE syncStatus = 'pending'").get() as { count: number };
    const failedRow = this.db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE syncStatus = 'failed'").get() as { count: number };
    const syncingRow = this.db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE syncStatus = 'syncing'").get() as { count: number };
    const pendingCount = Number(pendingRow.count) || 0;
    const failedCount = Number(failedRow.count) || 0;
    const syncingCount = Number(syncingRow.count) || 0;
    const lastLog = this.db.prepare('SELECT * FROM sync_logs ORDER BY createdAt DESC LIMIT 1').get() as any;

    return {
      pendingCount,
      failedCount,
      syncingCount,
      lastSyncAt: lastLog?.createdAt,
      lastMessage: lastLog?.message,
    };
  }

  log(syncType: string, status: string, message: string): void {
    this.db.prepare('INSERT INTO sync_logs (syncType, status, message, createdAt) VALUES (?, ?, ?, ?)')
      .run(syncType, status, message, new Date().toISOString());
  }

  private findById(id: number): LocalTransaction | null {
    const row = this.db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    return row ? this.withItems(row) : null;
  }

  private withItems(row: any): LocalTransaction {
    const items = this.db.prepare('SELECT * FROM transaction_items WHERE transactionId = ? ORDER BY id ASC')
      .all(row.id)
      .map((item: any) => ({
        id: item.id,
        transactionId: item.transactionId,
        productId: item.productId,
        productName: item.productName,
        barcode: item.barcode,
        quantity: Number(item.quantity) || 0,
        unitType: item.unitType,
        unitPrice: Number(item.unitPrice) || 0,
        total: Number(item.total) || 0,
      }));

    return {
      id: row.id,
      localTransactionId: row.localTransactionId,
      invoiceNumber: row.invoiceNumber,
      cashierId: row.cashierId,
      cashierName: row.cashierName,
      sessionId: row.sessionId ?? undefined,
      subtotal: Number(row.subtotal) || 0,
      discountType: row.discountType,
      discountValue: Number(row.discountValue) || 0,
      discountAmount: Number(row.discountAmount) || 0,
      total: Number(row.total) || 0,
      paymentMethod: row.paymentMethod,
      cashReceived: Number(row.cashReceived) || 0,
      cashChange: Number(row.cashChange) || 0,
      customerName: row.customerName ?? undefined,
      syncStatus: row.syncStatus,
      createdAt: row.createdAt,
      syncedAt: row.syncedAt ?? undefined,
      items,
    };
  }

  private generateInvoiceNumber(): string {
    const now = new Date();
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('');
    const suffix = String(Date.now()).slice(-6);
    return `LOCAL-${date}-${suffix}`;
  }

  private sum(items: LocalTransactionItem[]): number {
    return Number(items.reduce((total, item) => total + Number(item.total || 0), 0).toFixed(2));
  }
}
