import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { Product } from '../models/cart-item.model';
import { ElectronService } from './electron.service';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient, private electron: ElectronService) {}

  getProducts(search?: string, page: number = 1, limit: number = 20): Observable<any> {
    if (this.electron.isElectron) {
      return this.electron.getProducts(search).pipe(
        map(products => ({ data: products.map(product => this.fromLocalProduct(product)) }))
      );
    }

    let params = new HttpParams().set('page', page).set('limit', limit);
    if (search && search.trim()) {
      params = params.set('search', search.trim());
    }
    return this.http.get<any>(`${this.apiUrl}/products`, { params });
  }

  getProductByBarcode(barcode: string): Observable<Product> {
    if (this.electron.isElectron) {
      return this.electron.getProductByBarcode(barcode).pipe(
        map(product => {
          if (!product) throw new Error('Product not found.');
          return this.fromLocalProduct(product);
        })
      );
    }

    return this.http.get<Product>(`${this.apiUrl}/products/barcode/${barcode}`);
  }

  getProductById(id: string): Observable<Product> {
    return this.http.get<Product>(`${this.apiUrl}/products/${id}`);
  }

  private fromLocalProduct(product: any): Product {
    return {
      _id: product.id,
      name: product.name,
      barcode: product.barcode,
      priceSingle: Number(product.priceSingle ?? product.price ?? 0),
      priceBulk: Number(product.priceBulk ?? product.price ?? 0),
      bulkQuantity: 1,
      stock: Number(product.quantity ?? product.stock ?? 0),
      category: product.category,
      unit: product.unitType,
      isActive: product.isActive,
    };
  }
}
