import {
  Component, OnInit, OnDestroy, ViewChild, HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, StoredUser } from '../../core/services/auth.service';
import { ProductService } from '../../core/services/product.service';
import { SaleService } from '../../core/services/sale.service';
import { ElectronService } from '../../core/services/electron.service';
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
    FormsModule,
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
  private syncTimer: any;
  isOnline = navigator.onLine;
  isSyncing = false;
  pendingSyncCount = 0;
  failedSyncCount = 0;
  lastSyncAt = '';
  currentSessionId = '';
  currentCashierHasPin = false;
  showPinModal = false;
  pinModalMode: 'setup' | 'update' = 'setup';
  localPin = '';
  confirmLocalPin = '';
  pinError = '';
  showLockOverlay = false;
  unlockPin = '';
  unlockError = '';
  showEndShiftModal = false;
  closingCash: number | null = null;
  endShiftError = '';

  // Cart totals passed to checkout modal
  cartSubtotal = 0;
  cartDiscount = 0;
  cartTotal = 0;

  constructor(
    private authService: AuthService,
    private productService: ProductService,
    private saleService: SaleService,
    private electron: ElectronService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getUser();
    this.clockTimer = setInterval(() => { this.currentTime = new Date(); }, 1000);
    if (this.electron.isElectron) {
      this.ensureCashierSession();
      this.refreshCashierPinState();
      this.refreshSyncStatus();
      this.syncTimer = setInterval(() => this.refreshSyncStatus(), 10000);
      if (this.isOnline && this.authService.getToken() !== 'offline-local-session') {
        this.saleService.bootstrap(this.authService.getToken() ?? undefined).subscribe({
          next: () => this.refreshSyncStatus(),
          error: () => this.showToast('Could not refresh local products. Using last synced data.', 'info')
        });
      }
    }
  }

  @HostListener('window:online')
  onOnline(): void {
    this.isOnline = true;
    this.showToast('Internet connected. You can sync pending sales.', 'success');
    this.refreshSyncStatus();
  }

  @HostListener('window:offline')
  onOffline(): void {
    this.isOnline = false;
    this.showToast('Offline mode active. Sales will be kept locally.', 'info');
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
    if (this.electron.isElectron && !this.currentSessionId) {
      this.showToast('Start an active cashier session before checkout.', 'error');
      this.ensureCashierSession();
      return;
    }

    this.recalcCartTotals();
    this.showCheckout = true;
  }

  onCheckoutClosed(): void {
    this.showCheckout = false;
  }

  onSaleCompleted(): void {
    this.showCheckout = false;
    this.newSale();
    this.refreshSyncStatus();
    this.showToast('Sale saved locally. Receipt is ready.', 'success');
  }

  syncNow(): void {
    if (!this.electron.isElectron || this.isSyncing) return;
    if (!this.isOnline) {
      this.showToast('Connect to the internet before syncing.', 'error');
      return;
    }
    if (this.authService.getToken() === 'offline-local-session') {
      this.showToast('Login online before syncing offline sales.', 'error');
      return;
    }

    this.isSyncing = true;
    this.saleService.syncPendingTransactions(this.authService.getToken() ?? undefined).subscribe({
      next: (result: any) => {
        this.isSyncing = false;
        this.refreshSyncStatus();
        const synced = result?.transactions?.synced ?? 0;
        const failed = result?.transactions?.failed ?? 0;
        this.showToast(
          failed ? `Synced ${synced}; ${failed} failed.` : `Synced ${synced} pending sales.`,
          failed ? 'error' : 'success'
        );
      },
      error: () => {
        this.isSyncing = false;
        this.refreshSyncStatus();
        this.showToast('Sync failed. Pending sales remain available for retry.', 'error');
      }
    });
  }

  openPinModal(mode: 'setup' | 'update' = 'setup'): void {
    this.pinModalMode = mode;
    this.localPin = '';
    this.confirmLocalPin = '';
    this.pinError = '';
    this.showPinModal = true;
  }

  closePinModal(): void {
    this.showPinModal = false;
    this.pinError = '';
  }

  saveLocalPin(): void {
    if (!this.electron.isElectron) return;
    if (!this.currentUser?._id || !this.currentUser?.email) {
      this.pinError = 'Current cashier profile is missing an ID. Please log in online again.';
      return;
    }
    if (!/^\d{4,8}$/.test(this.localPin)) {
      this.pinError = 'PIN must be 4 to 8 digits.';
      return;
    }
    if (this.localPin !== this.confirmLocalPin) {
      this.pinError = 'PIN entries do not match.';
      return;
    }

    this.electron.saveCashierProfile({
      id: this.currentUser._id,
      name: this.currentUser.name,
      email: this.currentUser.email,
      role: this.currentUser.role,
    }).subscribe({
      next: () => {
        this.electron.setCashierPin(this.currentUser!._id, this.localPin).subscribe({
          next: () => {
            this.currentCashierHasPin = true;
            this.closePinModal();
            this.showToast('Local offline PIN saved.', 'success');
          },
          error: (err: any) => {
            this.pinError = err?.message || 'Failed to save local PIN.';
          }
        });
      },
      error: (err: any) => {
        this.pinError = err?.message || 'Failed to save cashier profile locally.';
      }
    });
  }

  lockPos(): void {
    if (!this.electron.isElectron) return;
    if (!this.currentSessionId) {
      this.ensureCashierSession();
      this.showToast('Start an active cashier session before locking the POS.', 'error');
      return;
    }
    if (!this.currentCashierHasPin) {
      this.openPinModal('setup');
      this.showToast('Set a local PIN before locking the POS.', 'info');
      return;
    }

    this.unlockPin = '';
    this.unlockError = '';
    this.showCheckout = false;
    this.showLockOverlay = true;
  }

  unlockPos(): void {
    if (!this.currentUser?.email) return;
    if (!this.unlockPin.trim()) {
      this.unlockError = 'Enter your local PIN.';
      return;
    }

    this.electron.verifyCashierPin(this.currentUser.email, this.unlockPin).subscribe({
      next: cashier => {
        if (!cashier) {
          this.unlockError = 'Invalid local PIN.';
          return;
        }
        this.showLockOverlay = false;
        this.unlockPin = '';
        this.unlockError = '';
        this.showToast('POS unlocked.', 'success');
      },
      error: () => {
        this.unlockError = 'Invalid local PIN.';
      }
    });
  }

  openEndShiftModal(): void {
    if (this.electron.isElectron && !this.currentSessionId) {
      this.ensureCashierSession();
      this.showToast('No active cashier session is ready to close.', 'error');
      return;
    }

    this.closingCash = 0;
    this.endShiftError = '';
    this.showEndShiftModal = true;
  }

  closeEndShiftModal(): void {
    this.showEndShiftModal = false;
    this.endShiftError = '';
  }

  endShift(): void {
    if (!this.electron.isElectron || !this.currentSessionId) {
      this.authService.logout();
      return;
    }
    if (this.closingCash === null || Number(this.closingCash) < 0) {
      this.endShiftError = 'Enter a valid closing cash amount.';
      return;
    }

    this.electron.closeCashierSession(this.currentSessionId, Number(this.closingCash)).subscribe({
      next: () => {
        this.currentSessionId = '';
        this.showEndShiftModal = false;
        this.authService.logout();
      },
      error: (err: any) => {
        this.endShiftError = err?.message || 'Failed to end shift.';
      }
    });
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
    if (this.electron.isElectron && this.currentSessionId) {
      this.openEndShiftModal();
      this.showToast('Close the shift before logging out.', 'info');
      return;
    }

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
    clearInterval(this.syncTimer);
    clearTimeout(this.toastTimer);
  }

  private ensureCashierSession(): void {
    if (!this.currentUser || !this.electron.isElectron) return;

    this.electron.getCurrentSession().subscribe({
      next: session => {
        if (session?.cashierId === this.currentUser?._id) {
          this.currentSessionId = session.id;
          return;
        }

        this.electron.openCashierSession({
          cashierId: this.currentUser?._id,
          cashierName: this.currentUser?.name,
          openingCash: 0,
        }).subscribe(opened => {
          this.currentSessionId = opened?.id ?? '';
          this.refreshSyncStatus();
        }, (err: any) => {
          this.currentSessionId = '';
          this.showToast(err?.message || 'Could not start cashier session.', 'error');
        });
      },
      error: (err: any) => {
        this.currentSessionId = '';
        this.showToast(err?.message || 'Could not start cashier session.', 'error');
      }
    });
  }

  private refreshSyncStatus(): void {
    if (!this.electron.isElectron) return;

    this.electron.getSyncStatus().subscribe({
      next: status => {
        this.pendingSyncCount = Number(status?.pendingCount ?? 0);
        this.failedSyncCount = Number(status?.failedCount ?? 0);
        this.lastSyncAt = status?.lastSyncAt ?? '';
      }
    });
  }

  private refreshCashierPinState(): void {
    if (!this.electron.isElectron || !this.currentUser?.email) return;

    this.electron.getCashierByEmail(this.currentUser.email).subscribe({
      next: cashier => {
        this.currentCashierHasPin = Boolean(cashier?.hasPin);
        if (!this.currentCashierHasPin && this.authService.getToken() !== 'offline-local-session') {
          this.openPinModal('setup');
        }
      }
    });
  }
}
