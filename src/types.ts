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

export type PaymentMethod = 'cash' | 'transfer' | 'debt';

export interface TransactionItem {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  unit: string;
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
}

export interface PriceMemory {
  [itemId: string]: number; // Memorized last price for each item globally
}
