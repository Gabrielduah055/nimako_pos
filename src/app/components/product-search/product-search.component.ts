import {
  Component, Output, EventEmitter, OnInit, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, of } from 'rxjs';
import { ProductService } from '../../core/services/product.service';
import { Product, CartItem } from '../../core/models/cart-item.model';

@Component({
  selector: 'app-product-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './product-search.component.html',
  styleUrl: './product-search.component.css'
})
export class ProductSearchComponent implements OnInit, OnDestroy {
  @Output() productSelected = new EventEmitter<CartItem>();

  searchQuery = '';
  products: Product[] = [];
  isLoading = false;
  errorMessage = '';
  hasSearched = false;

  // Unit selector modal
  selectedProduct: Product | null = null;
  pendingQuantity = 1;
  pendingUnitType: 'single' | 'bulk' = 'single';

  private searchSubject = new Subject<string>();
  private sub!: Subscription;

  constructor(private productService: ProductService) {}

  ngOnInit(): void {
    this.sub = this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(query => {
        if (!query.trim()) {
          this.products = [];
          this.hasSearched = false;
          this.isLoading = false;
          return of(null);
        }
        this.isLoading = true;
        this.errorMessage = '';
        return this.productService.getProducts(query).pipe(
          catchError(() => {
            this.errorMessage = 'Failed to search products.';
            return of(null);
          })
        );
      })
    ).subscribe(res => {
      this.isLoading = false;
      this.hasSearched = true;
      if (res === null) return;
      // Handle various API response shapes
      if (Array.isArray(res)) {
        this.products = res;
      } else if (res?.data && Array.isArray(res.data)) {
        this.products = res.data;
      } else if (res?.products && Array.isArray(res.products)) {
        this.products = res.products;
      } else {
        this.products = [];
      }
    });
  }

  onSearchInput(): void {
    this.searchSubject.next(this.searchQuery);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.products = [];
    this.hasSearched = false;
    this.errorMessage = '';
  }

  openUnitSelector(product: Product): void {
    this.selectedProduct = product;
    this.pendingQuantity = 1;
    this.pendingUnitType = 'single';
  }

  closeUnitSelector(): void {
    this.selectedProduct = null;
  }

  confirmAddToCart(): void {
    if (!this.selectedProduct) return;
    const singlePrice = Number(this.selectedProduct.priceSingle) || 0;
    const bulkPrice   = Number(this.selectedProduct.priceBulk)   || 0;
    const unitPrice   = this.pendingUnitType === 'bulk' ? bulkPrice : singlePrice;

    const item: CartItem = {
      productId: this.selectedProduct._id,
      name: this.selectedProduct.name,
      barcode: this.selectedProduct.barcode,
      quantity: this.pendingQuantity,
      unitType: this.pendingUnitType,
      unitPrice,
      total: unitPrice * this.pendingQuantity,
      stock: this.selectedProduct.stock,
      singlePrice,
      bulkPrice
    };
    this.productSelected.emit(item);
    this.closeUnitSelector();
    this.clearSearch();
  }

  incrementQty(): void {
    this.pendingQuantity++;
  }

  decrementQty(): void {
    if (this.pendingQuantity > 1) this.pendingQuantity--;
  }

  getStockClass(product: Product): string {
    if (product.stock <= 0) return 'out-of-stock';
    if (product.stock < 10) return 'low-stock';
    return 'in-stock';
  }

  getStockLabel(product: Product): string {
    if (product.stock <= 0) return 'Out of Stock';
    if (product.stock < 10) return `Low: ${product.stock}`;
    return `In Stock: ${product.stock}`;
  }

  getPendingPrice(): number {
    if (!this.selectedProduct) return 0;
    return this.pendingUnitType === 'bulk'
      ? Number(this.selectedProduct.priceBulk) || 0
      : Number(this.selectedProduct.priceSingle) || 0;
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
