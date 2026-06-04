import {
  Component, OnInit, OnDestroy, ViewChild, HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService, StoredUser } from '../../core/services/auth.service';
import { ProductService } from '../../core/services/product.service';
import { CartItem, Product } from '../../core/models/cart-item.model';
import { BarcodeScannerComponent } from '../../components/barcode-scanner/barcode-scanner.component';
import { ProductSearchComponent } from '../../components/product-search/product-search.component';
import { CartComponent } from '../../components/cart/cart.component';
import { CheckoutModalComponent } from '../../components/checkout-modal/checkout-modal.component';

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [
    CommonModule,
    BarcodeScannerComponent,
    ProductSearchComponent,
    CartComponent,
    CheckoutModalComponent
  ],
  templateUrl: './pos.component.html',
  styleUrl: './pos.component.css'
})
export class PosComponent implements OnInit, OnDestroy {
  @ViewChild(BarcodeScannerComponent) scannerRef!: BarcodeScannerComponent;
  @ViewChild(ProductSearchComponent) searchRef!: ProductSearchComponent;
  @ViewChild(CartComponent) cartRef!: CartComponent;

  currentUser: StoredUser | null = null;
  cartItems: CartItem[] = [];
  showCheckout = false;
  toastMessage = '';
  toastType: 'success' | 'error' | 'info' = 'info';
  private toastTimer: any;
  currentTime = new Date();
  private clockTimer: any;

  // Cart totals passed to checkout modal
  cartSubtotal = 0;
  cartDiscount = 0;
  cartTotal = 0;

  constructor(
    private authService: AuthService,
    private productService: ProductService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getUser();
    this.clockTimer = setInterval(() => { this.currentTime = new Date(); }, 1000);
  }

  // ─── Keyboard Shortcuts ───────────────────────────────────────────────────
  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    // Ignore if typing in an input/textarea
    const tag = (event.target as HTMLElement).tagName.toLowerCase();
    const isEditing = tag === 'input' || tag === 'textarea' || tag === 'select';

    if (event.key === 'F1' || (event.ctrlKey && event.key === 'n')) {
      event.preventDefault();
      this.newSale();
    } else if (event.key === 'F2') {
      event.preventDefault();
      this.scannerRef?.focusManualInput();
    } else if (event.key === 'F3') {
      event.preventDefault();
      this.focusSearch();
    } else if (event.ctrlKey && event.shiftKey && event.key === 'L') {
      event.preventDefault();
      this.logout();
    }
  }

  // ─── Barcode Scan Handler ─────────────────────────────────────────────────
  onBarcodeScanned(barcode: string): void {
    if (!barcode.trim()) return;
    this.productService.getProductByBarcode(barcode.trim()).subscribe({
      next: (product: any) => {
        // Handle various API response shapes
        const p: Product = product?.data || product;
        if (!p || !p._id) {
          this.showToast(`Product not found: "${barcode}"`, 'error');
          return;
        }
        this.addProductToCart(p);
      },
      error: () => {
        this.showToast(`Product not found for barcode: "${barcode}"`, 'error');
      }
    });
  }

  // ─── Product Search Handler ───────────────────────────────────────────────
  onProductSelected(item: CartItem): void {
    this.mergeIntoCart(item);
    this.showToast(`Added: ${item.name}`, 'success');
  }

  // ─── Cart Helpers ──────────────────────────────────────────────────────────
  addProductToCart(product: Product, quantity = 1, unitType: 'single' | 'bulk' = 'single'): void {
    const singlePrice = Number(product.priceSingle) || 0;
    const bulkPrice   = Number(product.priceBulk)   || 0;
    const unitPrice   = unitType === 'bulk' ? bulkPrice : singlePrice;
    const item: CartItem = {
      productId: product._id,
      name: product.name,
      barcode: product.barcode,
      quantity,
      unitType,
      unitPrice,
      total: unitPrice * quantity,
      stock: product.stock,
      singlePrice,
      bulkPrice
    };
    this.mergeIntoCart(item);
    this.showToast(`Added: ${product.name}`, 'success');
  }

  mergeIntoCart(newItem: CartItem): void {
    const existing = this.cartItems.findIndex(
      i => i.productId === newItem.productId && i.unitType === newItem.unitType
    );
    if (existing >= 0) {
      const updated = [...this.cartItems];
      const item = { ...updated[existing] };
      item.quantity += newItem.quantity;
      item.total = item.unitPrice * item.quantity;
      updated[existing] = item;
      this.cartItems = updated;
    } else {
      this.cartItems = [...this.cartItems, newItem];
    }
  }

  onCartUpdated(items: CartItem[]): void {
    this.cartItems = items;
    this.recalcCartTotals();
  }

  recalcCartTotals(): void {
    this.cartSubtotal = this.cartItems.reduce((a, i) => a + i.total, 0);
    if (this.cartRef) {
      this.cartDiscount = this.cartRef.discountAmount;
      this.cartTotal = this.cartRef.total;
    } else {
      this.cartDiscount = 0;
      this.cartTotal = this.cartSubtotal;
    }
  }

  // ─── Checkout ──────────────────────────────────────────────────────────────
  openCheckout(): void {
    this.recalcCartTotals();
    this.showCheckout = true;
  }

  onCheckoutClosed(): void {
    this.showCheckout = false;
  }

  onSaleCompleted(): void {
    this.showCheckout = false;
    this.newSale();
    this.showToast('Sale completed successfully! 🎉', 'success');
  }

  // ─── Quick Actions ─────────────────────────────────────────────────────────
  newSale(): void {
    this.cartItems = [];
    this.showCheckout = false;
    if (this.cartRef) {
      this.cartRef.discountValue = 0;
      this.cartRef.showDiscountPanel = false;
      this.cartRef.recalculate();
    }
    this.showToast('New sale started', 'info');
  }

  logout(): void {
    this.authService.logout();
  }

  focusSearch(): void {
    const input = document.getElementById('product-search-input') as HTMLInputElement;
    input?.focus();
  }

  // ─── Toast ─────────────────────────────────────────────────────────────────
  showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    clearTimeout(this.toastTimer);
    this.toastMessage = message;
    this.toastType = type;
    this.toastTimer = setTimeout(() => { this.toastMessage = ''; }, 3500);
  }

  get greeting(): string {
    const h = this.currentTime.getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  ngOnDestroy(): void {
    clearInterval(this.clockTimer);
    clearTimeout(this.toastTimer);
  }
}
