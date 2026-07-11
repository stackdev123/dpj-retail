export interface Item {
  id: string;
  name: string;
  unit: string; // e.g. 'kg', 'ekor', 'pasang', etc.
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  createdAt: string;
}

export type PaymentMethod = 'cash' | 'transfer' | 'debt' | 'mix';

export interface TransactionItem {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  unit: string;
  receivedQuantity?: number;
}

export interface Transaction {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  items: TransactionItem[];
  totalAmount: number;
  paymentMethod: PaymentMethod;
  amountPaid: number;
  remainingDebt: number;
  date: string; // ISO String
  printCount: number; // 0 = not printed yet, 1 = first print, >=2 = reprinted
  notes?: string;
  cashAmount?: number;
  transferAmount?: number;
  usePenerimaan?: boolean;
}

export interface DebtPayment {
  id: string;
  customerId: string;
  transactionId: string;
  invoiceNumber: string;
  date: string;
  amountPaid: number;
  paymentMethod: 'cash' | 'transfer';
  notes?: string;
}

export interface CustomerDebtSummary {
  customerId: string;
  customerName: string;
  totalDebt: number;
  totalPaid: number;
  remainingDebt: number;
  lastActive: string;
  totalPembelian: number;
  totalTransfer: number;
  totalCash: number;
}

export interface PriceMemory {
  [itemId: string]: number; // Memorized last price for each item globally
}

export interface ActivityLog {
  id: string;
  action: 'CREATE' | 'EDIT' | 'DELETE' | 'LOGIN' | 'RESET' | 'HEARTBEAT';
  module: string; // e.g. 'Penjualan', 'Pelanggan', 'Produk', 'Sistem'
  description: string;
  timestamp: string; // ISO string
}

export interface StockInItem {
  itemId: string;
  name: string;
  unit: string;
  quantity: number;
  costPrice?: number; // Optional: purchase/cost price per unit
}

export interface StockIn {
  quantity: any;
  itemId: any;
  pricePerItem: null;
  itemName: any;
  id: string;
  referenceNumber: string; // e.g. "STKIN-260711-001"
  supplier?: string;       // Supplier name (optional)
  date: string;            // ISO string
  items: StockInItem[];
  notes?: string;
  createdAt: string;       // ISO string
}

export interface AppUser {
  id: string;
  username: string;
  password?: string;
  role: 'superadmin' | 'admin' | 'kasir';
  fullname: string;
  createdAt: string;
}

export interface StockIn {
  id: string;
  date: string; // ISO string
  itemId: string;
  itemName: string;
  quantity: number;
  pricePerItem?: number; // optional, can be empty
  supplier?: string; // optional, can be empty
  notes?: string;
}

export interface StockOpname {
  id: string;
  date: string; // ISO string
  itemId: string;
  itemName: string;
  actualQuantity: number;
  previousQuantity: number;
  notes?: string;
}

