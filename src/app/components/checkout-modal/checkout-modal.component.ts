import {
  Component, Input, Output, EventEmitter, OnChanges, SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SaleService } from '../../core/services/sale.service';
import { AuthService, StoredUser } from '../../core/services/auth.service';
import { CartItem, SaleRequest, Sale } from '../../core/models/cart-item.model';

@Component({
  selector: 'app-checkout-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './checkout-modal.component.html',
  styleUrl: './checkout-modal.component.css'
})
export class CheckoutModalComponent implements OnChanges {
  @Input() items: CartItem[] = [];
  @Input() subtotal = 0;
  @Input() discountAmount = 0;
  @Input() total = 0;
  @Output() closed = new EventEmitter<void>();
  @Output() saleCompleted = new EventEmitter<Sale>();

  paymentMethod: 'cash' | 'transfer' | 'mixed' = 'cash';
  cashReceived = 0;
  cashChange = 0;
  referenceNumber = '';
  customerName = '';

  isLoading = false;
  errorMessage = '';
  successSale: Sale | null = null;
  cashierName = '';

  constructor(private saleService: SaleService, private authService: AuthService) {
    this.cashierName = this.authService.getUser()?.name || 'Cashier';
  }

  ngOnChanges(_: SimpleChanges): void {
    if (this.total > 0) {
      this.cashReceived = this.total;
      this.calculateChange();
    }
  }

  onCashReceivedChange(): void {
    this.calculateChange();
  }

  calculateChange(): void {
    this.cashChange = Math.max(0, this.cashReceived - this.total);
  }

  setPaymentMethod(method: 'cash' | 'transfer' | 'mixed'): void {
    this.paymentMethod = method;
    if (method !== 'cash' && method !== 'mixed') {
      this.cashReceived = 0;
      this.cashChange = 0;
    } else {
      this.cashReceived = this.total;
      this.calculateChange();
    }
  }

  canSubmit(): boolean {
    if (this.items.length === 0) return false;
    if (this.isLoading) return false;
    if (this.paymentMethod === 'cash' && this.cashReceived < this.total) return false;
    if (this.paymentMethod === 'mixed' && this.cashReceived <= 0) return false;
    return true;
  }

  // Frozen snapshot of the cart at the moment "Complete Sale" is pressed.
  // Used for the receipt so items display correctly even after cart is cleared.
  snapshotItems: CartItem[] = [];
  snapshotSubtotal = 0;
  snapshotDiscount = 0;
  snapshotTotal = 0;
  snapshotCashReceived = 0;
  snapshotPaymentMethod: 'cash' | 'transfer' | 'mixed' = 'cash';

  async submitSale(): Promise<void> {
    if (!this.canSubmit()) return;
    this.isLoading = true;
    this.errorMessage = '';

    // ── Snapshot the cart before sending so the receipt always shows items ──
    this.snapshotItems        = [...this.items];
    this.snapshotSubtotal     = this.subtotal;
    this.snapshotDiscount     = this.discountAmount;
    this.snapshotTotal        = this.total;
    this.snapshotCashReceived = this.cashReceived;
    this.snapshotPaymentMethod = this.paymentMethod;

    const user = this.authService.getUser();
    // Strip to only the fields the backend requires per item
    const mappedItems = this.items.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      unitType: item.unitType,
      unitPrice: item.unitPrice
    }));

    const saleData: SaleRequest = {
      items: mappedItems as any,
      subtotal: this.subtotal,
      discount: this.discountAmount,
      total: this.total,
      paymentMethod: this.paymentMethod,
      cashierId: user?._id || '',
      cashReceived: this.paymentMethod !== 'transfer' ? this.cashReceived : undefined,
      referenceNumber: this.referenceNumber.trim() || undefined
    };

    this.saleService.createSale(saleData).subscribe({
      next: (sale: Sale) => {
        this.isLoading = false;
        this.successSale = sale;
        // Do NOT emit saleCompleted yet — wait for user to click "New Sale"
        // so the receipt stays visible.
      },
      error: (err: any) => {
        this.isLoading = false;
        this.errorMessage = err?.error?.message || err?.message || 'Failed to create sale. Please try again.';
      }
    });
  }

  startNewSale(): void {
    // Emit both events: parent resets the cart, then modal closes
    if (this.successSale) {
      this.saleCompleted.emit(this.successSale);
    }
    this.successSale = null;
    this.closed.emit();
  }

  printReceipt(): void {
    if (!this.successSale) return;

    const invoice = this.successSale.invoiceNumber
      || ('TXN-' + (this.successSale._id || '').slice(-8).toUpperCase());

    const saleDate = new Date(this.successSale.createdAt || Date.now());
    const dateStr  = saleDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr  = saleDate.toLocaleTimeString('en-GB');
    const cashier  = this.successSale.cashierName || this.cashierName;

    const payLabel: Record<string, string> = {
      cash: '&#128181; Cash',
      transfer: '&#128241; Transfer',
      mixed: '&#128256; Mixed'
    };
    const payText = payLabel[this.snapshotPaymentMethod] || this.snapshotPaymentMethod;

    const itemRows = this.snapshotItems.map(item => `
      <tr>
        <td class="item-name">${this.esc(item.name)}<br><small>${item.unitType.toUpperCase()}</small></td>
        <td class="center">${item.quantity}</td>
        <td class="right">GH&#8373;${item.unitPrice.toFixed(2)}</td>
        <td class="right bold">GH&#8373;${item.total.toFixed(2)}</td>
      </tr>`).join('');

    const discountRow = this.snapshotDiscount > 0 ? `
      <tr class="discount-row">
        <td colspan="3">Discount</td>
        <td class="right">&minus;GH&#8373;${this.snapshotDiscount.toFixed(2)}</td>
      </tr>` : '';

    const cashRows = (this.snapshotPaymentMethod !== 'transfer' && this.snapshotCashReceived > 0) ? `
      <tr>
        <td colspan="3">Cash Received</td>
        <td class="right">GH&#8373;${this.snapshotCashReceived.toFixed(2)}</td>
      </tr>
      <tr>
        <td colspan="3">Change</td>
        <td class="right">GH&#8373;${(this.snapshotCashReceived - this.snapshotTotal).toFixed(2)}</td>
      </tr>` : '';

    // Decorative barcode HTML
    const barcodeHtml = this.generateBarcodeHtml(this.successSale._id || invoice);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Receipt &#8212; ${invoice}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      line-height: 1.6;
      background: #fff;
      color: #000;
      width: 80mm;
      margin: 0 auto;
      padding: 8px 0 16px;
    }

    /* ── Store Header ── */
    .receipt-header {
      text-align: center;
      padding: 12px 12px 10px;
      border-bottom: 2px dashed #bbb;
      margin-bottom: 10px;
    }
    .logo-emoji { font-size: 2rem; line-height: 1; margin-bottom: 4px; }
    .store-name {
      font-size: 18px; font-weight: 900;
      letter-spacing: 0.15em; color: #000;
      text-transform: uppercase;
    }
    .store-sub {
      font-size: 9px; color: #666;
      letter-spacing: 0.12em; text-transform: uppercase; margin-top: 3px;
    }

    /* ── Meta ── */
    .meta { padding: 4px 12px 8px; border-bottom: 1px dashed #bbb; margin-bottom: 8px; }
    .meta-row {
      display: flex; justify-content: space-between;
      font-size: 10.5px; padding: 2px 0;
    }
    .meta-key { color: #666; font-size: 9.5px; font-weight: 700; text-transform: uppercase; }
    .meta-val { font-weight: 600; color: #000; }
    .pay-pill {
      background: #000; color: #fff;
      padding: 1px 7px; border-radius: 4px;
      font-size: 9.5px; font-weight: 700;
    }

    /* ── Items table ── */
    .col-header { padding: 2px 12px; border-bottom: 1px solid #ccc; margin-bottom: 4px; }
    .col-header table { width: 100%; border-collapse: collapse; }
    .col-header th {
      font-size: 9px; font-weight: 800;
      text-transform: uppercase; letter-spacing: 0.08em;
      color: #555; padding: 3px 0; text-align: left;
    }
    th.center { text-align: center; }
    th.right  { text-align: right; }

    .items-body { padding: 4px 12px; border-bottom: 1px dashed #bbb; margin-bottom: 8px; }
    .items-body table { width: 100%; border-collapse: collapse; }
    .items-body td { padding: 4px 2px; font-size: 11.5px; vertical-align: top; color: #000; }
    .item-name { font-weight: 700; color: #000; }
    .item-name small { display: block; font-size: 9px; color: #777; font-weight: 500; letter-spacing: 0.06em; }
    td.center { text-align: center; }
    td.right  { text-align: right; }
    td.bold   { font-weight: 800; color: #000; }
    tr + tr td { border-top: 1px dotted #eee; }

    /* ── Totals ── */
    .totals { padding: 4px 12px 6px; }
    .totals table { width: 100%; border-collapse: collapse; }
    .totals td { font-size: 11px; padding: 2px 0; color: #000; }
    .totals td:last-child { text-align: right; }
    .grand-total td {
      font-size: 14px; font-weight: 900;
      padding: 5px 0;
      border-top: 1px solid #000;
      border-bottom: 1px solid #000;
      color: #000;
    }
    .discount-row td { color: #16a34a; font-weight: 600; }
    .divider { border-top: 1px dashed #bbb; margin: 5px 0; }

    /* ── Footer ── */
    .receipt-footer {
      text-align: center;
      padding: 10px 12px 4px;
      border-top: 2px dashed #bbb;
      margin-top: 8px;
    }
    .thank-you { font-size: 12px; font-weight: 800; color: #000; }
    .come-back { font-size: 10px; color: #666; margin-top: 2px; }

    /* ── Barcode ── */
    .barcode-area { margin-top: 10px; text-align: center; }
    .barcode-bars {
      display: flex; justify-content: center;
      align-items: stretch; height: 38px; gap: 1.5px;
    }
    .bar { background: #000; border-radius: 1px; }
    .barcode-num { font-size: 8.5px; letter-spacing: 0.12em; color: #444; margin-top: 5px; }

    @media print {
      body { width: 80mm !important; }
    }
  </style>
</head>
<body>

  <div class="receipt-header">
    <div class="logo-emoji">&#129532;</div>
    <div class="store-name">NIMAKO POS</div>
    <div class="store-sub">Point of Sale Terminal</div>
  </div>

  <div class="meta">
    <div class="meta-row"><span class="meta-key">Invoice</span><span class="meta-val">${invoice}</span></div>
    <div class="meta-row"><span class="meta-key">Date</span><span class="meta-val">${dateStr}</span></div>
    <div class="meta-row"><span class="meta-key">Time</span><span class="meta-val">${timeStr}</span></div>
    <div class="meta-row"><span class="meta-key">Cashier</span><span class="meta-val">${this.esc(cashier)}</span></div>
    <div class="meta-row">
      <span class="meta-key">Payment</span>
      <span class="meta-val"><span class="pay-pill">${payText}</span></span>
    </div>
  </div>

  <div class="col-header">
    <table>
      <tr>
        <th style="width:44%">Item</th>
        <th class="center" style="width:10%">Qty</th>
        <th class="right" style="width:23%">Price</th>
        <th class="right" style="width:23%">Total</th>
      </tr>
    </table>
  </div>

  <div class="items-body">
    <table>${itemRows}</table>
  </div>

  <div class="totals">
    <table>
      <tr><td colspan="3">Subtotal</td><td>GH&#8373;${this.snapshotSubtotal.toFixed(2)}</td></tr>
      ${discountRow}
    </table>
    <div class="divider"></div>
    <table>
      <tr class="grand-total">
        <td colspan="3">TOTAL</td>
        <td>GH&#8373;${this.snapshotTotal.toFixed(2)}</td>
      </tr>
    </table>
    ${cashRows ? `<div class="divider"></div><table>${cashRows}</table>` : ''}
  </div>

  <div class="receipt-footer">
    <div class="thank-you">Thank you for shopping!</div>
    <div class="come-back">Come back soon &#128591;</div>
    <div class="barcode-area">
      <div class="barcode-bars">${barcodeHtml}</div>
      <div class="barcode-num">${invoice}</div>
    </div>
  </div>

  <script>
    window.addEventListener('load', function() {
      setTimeout(function() { window.print(); }, 400);
    });
  </script>
</body>
</html>`;

    const pw = window.open('', '_blank', 'width=440,height=920,scrollbars=yes,resizable=yes');
    if (!pw) { alert('Please allow popups to print receipts.'); return; }
    pw.document.open();
    pw.document.write(html);
    pw.document.close();
  }

  /** HTML-escape helper so product names don't break the print window */
  private esc(s: string): string {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Generates inline bar divs for the decorative barcode */
  private generateBarcodeHtml(seed: string): string {
    let html = '';
    for (let i = 0; i < 48; i++) {
      const w = (seed.charCodeAt(i % seed.length) + i) % 3 + 1;
      const h = 60 + ((seed.charCodeAt((i * 3) % seed.length) + i) % 40);
      html += `<div class="bar" style="width:${w}px;height:${h}%"></div>`;
    }
    return html;
  }


  close(): void {
    if (!this.isLoading) {
      this.closed.emit();
    }
  }
}
