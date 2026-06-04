import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Product } from '../models/cart-item.model';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getProducts(search?: string, page: number = 1, limit: number = 20): Observable<any> {
    let params = new HttpParams().set('page', page).set('limit', limit);
    if (search && search.trim()) {
      params = params.set('search', search.trim());
    }
    return this.http.get<any>(`${this.apiUrl}/products`, { params });
  }

  getProductByBarcode(barcode: string): Observable<Product> {
    return this.http.get<Product>(`${this.apiUrl}/products/barcode/${barcode}`);
  }

  getProductById(id: string): Observable<Product> {
    return this.http.get<Product>(`${this.apiUrl}/products/${id}`);
  }
}
