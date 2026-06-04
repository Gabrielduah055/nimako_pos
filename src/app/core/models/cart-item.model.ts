export interface CartItem {
  productId: string;
  name: string;
  barcode: string;
  quantity: number;
  unitType: 'single' | 'bulk';
  unitPrice: number;
  total: number;
  stock: number;
  // Stored so the cart can switch price when toggling Single/Bulk
  singlePrice?: number;
  bulkPrice?: number;
}

export interface SaleRequest {
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: 'cash' | 'transfer' | 'mixed';
  cashierId: string;
  customerName?: string;
  cashReceived?: number;
  referenceNumber?: string;
}

export interface Product {
  _id: string;
  name: string;
  barcode: string;
  // API returns priceSingle / priceBulk (not singlePrice / bulkPrice)
  priceSingle: number;
  priceBulk: number;
  bulkQuantity: number;
  stock: number;
  lowStockThreshold?: number;
  category?: string;
  unit?: string;
  isActive?: boolean;
  description?: string;
}

export interface User {
  _id: string;
  name: string;
  email: string;
  role: 'cashier' | 'admin' | 'manager';
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Sale {
  _id: string;
  invoiceNumber?: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: 'cash' | 'transfer' | 'mixed';
  cashierId: string;
  cashierName?: string;
  customerName?: string;
  cashReceived?: number;
  cashChange?: number;
  createdAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}
