import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { Sale, SaleRequest } from '../models/cart-item.model';

@Injectable({ providedIn: 'root' })
export class SaleService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  createSale(saleData: SaleRequest): Observable<Sale> {
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
}
