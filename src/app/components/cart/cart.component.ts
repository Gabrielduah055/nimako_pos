import {
  Component, Input, Output, EventEmitter, OnChanges, SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CartItem } from '../../core/models/cart-item.model';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cart.component.html',
  styleUrl: './cart.component.css'
})
export class CartComponent implements OnChanges {
  @Input() items: CartItem[] = [];
  @Output() itemsChange = new EventEmitter<CartItem[]>();
  @Output() checkoutRequested = new EventEmitter<void>();
  @Output() cartCleared = new EventEmitter<void>();

  discountType: 'percent' | 'fixed' = 'percent';
  discountValue = 0;
  showDiscountPanel = false;

  subtotal = 0;
  discountAmount = 0;
  total = 0;

  ngOnChanges(_changes: SimpleChanges): void {
    this.recalculate();
  }

  recalculate(): void {
    this.subtotal = this.items.reduce((acc, item) => acc + item.total, 0);
    if (this.discountType === 'percent') {
      this.discountAmount = this.subtotal * (this.discountValue / 100);
    } else {
      this.discountAmount = Math.min(this.discountValue, this.subtotal);
    }
    this.total = Math.max(0, this.subtotal - this.discountAmount);
  }

  updateItem(index: number, changes: Partial<CartItem>): void {
    const item = { ...this.items[index], ...changes };
    item.total = item.unitPrice * item.quantity;
    const updated = [...this.items];
    updated[index] = item;
    this.itemsChange.emit(updated);
  }

  incrementQty(index: number): void {
    const item = this.items[index];
    this.updateItem(index, { quantity: item.quantity + 1 });
  }

  decrementQty(index: number): void {
    const item = this.items[index];
    if (item.quantity > 1) {
      this.updateItem(index, { quantity: item.quantity - 1 });
    }
  }

  setUnitType(index: number, unitType: 'single' | 'bulk'): void {
    const item = this.items[index];
    const unitPrice = unitType === 'bulk'
      ? (item.bulkPrice ?? item.unitPrice)
      : (item.singlePrice ?? item.unitPrice);
    this.updateItem(index, { unitType, unitPrice });
  }

  removeItem(index: number): void {
    const updated = this.items.filter((_, i) => i !== index);
    this.itemsChange.emit(updated);
  }

  clearCart(): void {
    this.discountValue = 0;
    this.showDiscountPanel = false;
    this.itemsChange.emit([]);
    this.cartCleared.emit();
  }

  applyDiscount(): void {
    this.recalculate();
    this.showDiscountPanel = false;
  }

  toggleDiscountPanel(): void {
    this.showDiscountPanel = !this.showDiscountPanel;
  }

  onDiscountChange(): void {
    this.recalculate();
  }

  checkout(): void {
    if (this.items.length > 0) {
      this.checkoutRequested.emit();
    }
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  get itemCount(): number {
    return this.items.reduce((acc, i) => acc + i.quantity, 0);
  }
}
