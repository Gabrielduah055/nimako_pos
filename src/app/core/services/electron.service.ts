import { Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';

export interface ElectronApi {
  saveTransaction(transaction: unknown): Promise<any>;
  getPendingTransactions(): Promise<any[]>;
  syncPendingTransactions(token?: string): Promise<any>;
  bootstrapSync(token?: string): Promise<any>;
  getProducts(search?: string): Promise<any[]>;
  getProductByBarcode(barcode: string): Promise<any | null>;
  saveProducts(products: unknown[]): Promise<any>;
  getCashiers(): Promise<any[]>;
  getCashierByEmail(email: string): Promise<any | null>;
  saveCashierProfile(cashier: unknown): Promise<any>;
  setCashierPin(cashierId: string, pin: string): Promise<any>;
  verifyCashierPin(email: string, pin: string): Promise<any | null>;
  openCashierSession(session: unknown): Promise<any>;
  closeCashierSession(sessionId: string, closingCash: number): Promise<any>;
  getCurrentSession(): Promise<any | null>;
  getSyncStatus(): Promise<any>;
}

declare global {
  interface Window {
    electronAPI?: ElectronApi;
  }
}

@Injectable({ providedIn: 'root' })
export class ElectronService {
  get isElectron(): boolean {
    return !!window.electronAPI;
  }

  saveTransaction(transaction: unknown): Observable<any> {
    return from(this.requireApi().saveTransaction(transaction));
  }

  getPendingTransactions(): Observable<any[]> {
    return from(this.requireApi().getPendingTransactions());
  }

  syncPendingTransactions(token?: string): Observable<any> {
    return from(this.requireApi().syncPendingTransactions(token));
  }

  bootstrapSync(token?: string): Observable<any> {
    return from(this.requireApi().bootstrapSync(token));
  }

  getProducts(search?: string): Observable<any[]> {
    return from(this.requireApi().getProducts(search));
  }

  getProductByBarcode(barcode: string): Observable<any | null> {
    return from(this.requireApi().getProductByBarcode(barcode));
  }

  getCashiers(): Observable<any[]> {
    return from(this.requireApi().getCashiers());
  }

  getCashierByEmail(email: string): Observable<any | null> {
    return from(this.requireApi().getCashierByEmail(email));
  }

  saveCashierProfile(cashier: unknown): Observable<any> {
    return from(this.requireApi().saveCashierProfile(cashier));
  }

  setCashierPin(cashierId: string, pin: string): Observable<any> {
    return from(this.requireApi().setCashierPin(cashierId, pin));
  }

  verifyCashierPin(email: string, pin: string): Observable<any | null> {
    return from(this.requireApi().verifyCashierPin(email, pin));
  }

  openCashierSession(session: unknown): Observable<any> {
    return from(this.requireApi().openCashierSession(session));
  }

  closeCashierSession(sessionId: string, closingCash: number): Observable<any> {
    return from(this.requireApi().closeCashierSession(sessionId, closingCash));
  }

  getCurrentSession(): Observable<any | null> {
    return from(this.requireApi().getCurrentSession());
  }

  getSyncStatus(): Observable<any> {
    return from(this.requireApi().getSyncStatus());
  }

  private requireApi(): ElectronApi {
    if (!window.electronAPI) {
      throw new Error('Electron API is not available in this browser session.');
    }
    return window.electronAPI;
  }
}
