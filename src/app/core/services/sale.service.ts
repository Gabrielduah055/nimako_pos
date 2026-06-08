import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { Sale, SaleRequest } from '../models/cart-item.model';
import { ElectronService } from './electron.service';

@Injectable({ providedIn: 'root' })
export class SaleService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient, private electron: ElectronService) {}

  createSale(saleData: SaleRequest): Observable<Sale> {
    if (this.electron.isElectron) {
      return this.createLocalSale(saleData);
    }

    return this.http.post<any>(`${this.apiUrl}/sales`, saleData).pipe(
      // Unwrap { success: true, data: Sale } envelope
      map(res => res?.data ?? res)
    );
  }

  getTodaySales(): Observable<Sale[]> {
    return this.http.get<any>(`${this.apiUrl}/sales/today`).pipe(
      map(res => res?.data ?? res)
    );
  }

  syncPendingTransactions(token?: string): Observable<any> {
    return this.electron.syncPendingTransactions(token);
  }

  getSyncStatus(): Observable<any> {
    return this.electron.getSyncStatus();
  }

  bootstrap(token?: string): Observable<any> {
    return this.electron.bootstrapSync(token);
  }

  private createLocalSale(saleData: SaleRequest): Observable<Sale> {
    const now = saleData.createdAt ?? new Date().toISOString();
    const localTransactionId = saleData.localTransactionId ?? `LOCAL-${crypto.randomUUID()}`;
    const invoiceNumber = saleData.invoiceNumber ?? this.generateLocalInvoiceNumber();
    const discountAmount = Number(saleData.discount ?? 0);
    const cashReceived = Number(saleData.cashReceived ?? 0);
    const cashChange = Number(saleData.cashChange ?? Math.max(0, cashReceived - saleData.total));

    const transaction = {
      localTransactionId,
      invoiceNumber,
      cashierId: saleData.cashierId,
      cashierName: saleData.cashierName ?? 'Cashier',
      sessionId: saleData.sessionId,
      subtotal: saleData.subtotal,
      discountType: saleData.discountType ?? 'none',
      discountValue: saleData.discountValue ?? discountAmount,
      discountAmount,
      total: saleData.total,
      paymentMethod: saleData.paymentMethod,
      cashReceived,
      cashChange,
      customerName: saleData.customerName ?? 'Walk-in Customer',
      createdAt: now,
      items: saleData.items.map((item: any) => ({
        productId: item.productId,
        productName: item.name ?? item.productName,
        barcode: item.barcode,
        quantity: item.quantity,
        unitType: item.unitType,
        unitPrice: item.unitPrice,
        total: item.total ?? item.unitPrice * item.quantity,
      })),
    };

    return this.electron.saveTransaction(transaction).pipe(
      map(saved => ({
        _id: saved.localTransactionId,
        localTransactionId: saved.localTransactionId,
        invoiceNumber: saved.invoiceNumber,
        items: saleData.items,
        subtotal: saved.subtotal,
        discount: saved.discountAmount,
        total: saved.total,
        paymentMethod: saved.paymentMethod,
        cashierId: saved.cashierId,
        cashierName: saved.cashierName,
        sessionId: saved.sessionId,
        customerName: saved.customerName,
        cashReceived: saved.cashReceived,
        cashChange: saved.cashChange,
        syncStatus: saved.syncStatus,
        createdAt: saved.createdAt,
      }))
    );
  }

  private generateLocalInvoiceNumber(): string {
    const now = new Date();
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('');
    return `LOCAL-${date}-${String(Date.now()).slice(-6)}`;
  }
}
