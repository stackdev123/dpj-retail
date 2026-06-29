import React, { useState, useEffect, useRef } from "react";
import {
  Item,
  Customer,
  TransactionItem,
  Transaction,
  PaymentMethod,
} from "../types";
import { db } from "../utils/db";
import { formatRupiah, generateInvoiceNumber } from "../utils/format";
import ReceiptModal from "./ReceiptModal";
import {
  ShoppingCart,
  Plus,
  Trash2,
  User,
  Landmark,
  DollarSign,
  Wallet,
  FileText,
  CheckCircle2,
  UserPlus,
  ChevronDown,
  Search,
  Shuffle,
} from "lucide-react";

export default function Cashier() {
  // Master Lists
  const [items, setItems] = useState<Item[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  // Pre-populated rows of items for POS
  interface TableItemRow {
    id: string;
    name: string;
    unit: string;
    price: number | "";
    quantity: number | "";
  }

  const [tableItems, setTableItems] = useState<TableItemRow[]>([]);
  const [filterQuery, setFilterQuery] = useState("");

  // Checkout Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState("cust-1"); // Default Pelanggan Umum
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amountPaid, setAmountPaid] = useState<number | "">("");
  const [transactionNotes, setTransactionNotes] = useState("");

  // States for mix payment
  const [mixCashAmount, setMixCashAmount] = useState<number | "">("");
  const [mixTransferAmount, setMixTransferAmount] = useState<number | "">("");

  // Quick Customer Add Modal within Cashier
  const [quickCustOpen, setQuickCustOpen] = useState(false);
  const [quickCustName, setQuickCustName] = useState("");
  const [quickCustPhone, setQuickCustPhone] = useState("");

  // Receipt Modal trigger
  const [activeReceipt, setActiveReceipt] = useState<Transaction | null>(null);

  // Load master data on mount
  useEffect(() => {
    const loadData = async () => {
      const [itemsData, customersData, memories] = await Promise.all([
        db.getItems(),
        db.getCustomers(),
        db.getPriceMemories(),
      ]);
      setItems(itemsData);
      setCustomers(customersData);

      // Pre-populate tableItems
      const initialRows = itemsData.map((item) => {
        const memorizedPrice = memories[item.id];
        return {
          id: item.id,
          name: item.name,
          unit: item.unit,
          price: memorizedPrice !== undefined ? memorizedPrice : "",
          quantity: "" as number | "",
        };
      });
      setTableItems(initialRows);

      if (customersData.length > 0) {
        // Set default to "Pelanggan Umum" if exists, else the first customer
        const umum = customersData.find(
          (c) => c.name.toLowerCase() === "pelanggan umum",
        );
        if (umum) {
          setSelectedCustomerId(umum.id);
        } else {
          setSelectedCustomerId(customersData[0].id);
        }
      } else {
        setSelectedCustomerId("");
      }
    };
    loadData();
  }, []);

  // Filtered rows for fast typing/searching
  const visibleRows = tableItems.map((row, index) => ({ ...row, originalIndex: index }))
    .filter((row) =>
      row.name.toLowerCase().includes(filterQuery.toLowerCase())
    );

  // Calculate cartTotal
  const cartTotal = tableItems.reduce((sum, row) => {
    const price = Number(row.price) || 0;
    const qty = Number(row.quantity) || 0;
    return sum + (price * qty);
  }, 0);

  // Items to submit (with quantity > 0)
  const itemsToSubmit: TransactionItem[] = tableItems
    .filter((row) => {
      const qty = Number(row.quantity) || 0;
      return qty > 0;
    })
    .map((row) => {
      const price = Number(row.price) || 0;
      const qty = Number(row.quantity) || 0;
      return {
        itemId: row.id,
        name: row.name,
        price,
        quantity: qty,
        subtotal: Math.round(price * qty),
        unit: row.unit,
      };
    });

  // Auto-set amount paid or mix values depending on paymentMethod
  useEffect(() => {
    if (paymentMethod === "cash" || paymentMethod === "transfer") {
      setAmountPaid(cartTotal);
    } else if (paymentMethod === "debt") {
      setAmountPaid(0);
    } else if (paymentMethod === "mix") {
      setMixCashAmount(Math.round(cartTotal * 0.5));
      setMixTransferAmount(Math.round(cartTotal * 0.5));
    }
  }, [paymentMethod, cartTotal]);

  const handleMixCashChange = (val: string) => {
    if (val === "") {
      setMixCashAmount("");
      setMixTransferAmount(cartTotal);
    } else {
      const num = Number(val);
      setMixCashAmount(num);
      setMixTransferAmount(Math.max(0, cartTotal - num));
    }
  };

  const handleMixTransferChange = (val: string) => {
    if (val === "") {
      setMixTransferAmount("");
      setMixCashAmount(cartTotal);
    } else {
      const num = Number(val);
      setMixTransferAmount(num);
      setMixCashAmount(Math.max(0, cartTotal - num));
    }
  };

  const handleRowChange = (
    originalIndex: number,
    field: "price" | "quantity",
    value: string,
  ) => {
    const updated = [...tableItems];
    if (value === "") {
      updated[originalIndex] = {
        ...updated[originalIndex],
        [field]: "",
      };
    } else {
      updated[originalIndex] = {
        ...updated[originalIndex],
        [field]: Number(value),
      };
    }
    setTableItems(updated);
  };

  const handleClearRow = (originalIndex: number) => {
    const updated = [...tableItems];
    updated[originalIndex].quantity = "";
    setTableItems(updated);
  };

  const handleClearAllRows = () => {
    setTableItems(prev => prev.map(item => ({ ...item, quantity: "" })));
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    visibleIndex: number,
    col: "price" | "quantity"
  ) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevRowInput = document.querySelector<HTMLInputElement>(
        `[data-row="${visibleIndex - 1}"][data-col="${col}"]`
      );
      if (prevRowInput) {
        prevRowInput.focus();
        prevRowInput.select();
      }
    } else if (e.key === "ArrowDown" || e.key === "Enter") {
      e.preventDefault();
      const nextRowInput = document.querySelector<HTMLInputElement>(
        `[data-row="${visibleIndex + 1}"][data-col="${col}"]`
      );
      if (nextRowInput) {
        nextRowInput.focus();
        nextRowInput.select();
      } else if (e.key === "Enter" && col === "price") {
        // shift to quantity column on the first row
        const firstQtyInput = document.querySelector<HTMLInputElement>(
          `[data-row="0"][data-col="quantity"]`
        );
        if (firstQtyInput) {
          firstQtyInput.focus();
          firstQtyInput.select();
        }
      }
    } else if (e.key === "ArrowRight") {
      if (col === "price") {
        e.preventDefault();
        const qtyInput = document.querySelector<HTMLInputElement>(
          `[data-row="${visibleIndex}"][data-col="quantity"]`
        );
        if (qtyInput) {
          qtyInput.focus();
          qtyInput.select();
        }
      }
    } else if (e.key === "ArrowLeft") {
      if (col === "quantity") {
        e.preventDefault();
        const priceInput = document.querySelector<HTMLInputElement>(
          `[data-row="${visibleIndex}"][data-col="price"]`
        );
        if (priceInput) {
          priceInput.focus();
          priceInput.select();
        }
      }
    }
  };

  // Add quick customer
  const handleQuickAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCustName.trim()) return;

    const newCust: Customer = {
      id: `cust-${Date.now()}`,
      name: quickCustName.trim(),
      phone: quickCustPhone.trim() || "-",
      address: "-",
      createdAt: new Date().toISOString(),
    };

    await db.saveCustomer(newCust);
    setCustomers(await db.getCustomers());
    setSelectedCustomerId(newCust.id);
    setQuickCustOpen(false);
    setQuickCustName("");
    setQuickCustPhone("");
  };

  // Process checkout
  const handleCheckout = async () => {
    if (itemsToSubmit.length === 0) {
      alert("Belum ada produk dengan kuantitas > 0 untuk transaksi.");
      return;
    }

    const customer = customers.find((c) => c.id === selectedCustomerId);
    if (!customer) {
      alert("Pelanggan tidak valid.");
      return;
    }

    // Debt validation
    if (
      paymentMethod === "debt" &&
      customer.name.toLowerCase() === "pelanggan umum"
    ) {
      alert(
        "PENTING: Untuk pembayaran UTANG (tempo), Anda harus memilih nama pelanggan resmi / terdaftar. Pelanggan Umum tidak diperbolehkan memiliki catatan utang.",
      );
      return;
    }

    let paid = Number(amountPaid) || 0;
    let cashAmt: number | undefined = undefined;
    let transAmt: number | undefined = undefined;

    if (paymentMethod === "mix") {
      cashAmt = Number(mixCashAmount) || 0;
      transAmt = Number(mixTransferAmount) || 0;
      paid = cashAmt + transAmt;
      if (paid < cartTotal) {
        alert(
          `Total pembayaran campuran (${formatRupiah(paid)}) kurang dari total belanja (${formatRupiah(cartTotal)}).`,
        );
        return;
      }
    } else if (paymentMethod !== "debt" && paid < cartTotal) {
      alert(
        `Jumlah bayar (${formatRupiah(paid)}) kurang dari total belanja (${formatRupiah(cartTotal)}).`,
      );
      return;
    }

    const remainingDebt =
      paymentMethod === "debt" ? Math.max(0, cartTotal - paid) : 0;
    const txs = await db.getTransactions();
    const invoiceCount = txs.length;
    const invoiceNumber = generateInvoiceNumber(invoiceCount);

    const transaction: Transaction = {
      id: `tx-${Date.now()}`,
      invoiceNumber,
      customerId: customer.id,
      customerName: customer.name,
      items: itemsToSubmit,
      totalAmount: cartTotal,
      paymentMethod,
      amountPaid: paid,
      remainingDebt,
      date: new Date().toISOString(),
      printCount: 0,
      notes:
        transactionNotes.trim() ||
        (paymentMethod === "debt" ? "Utang Toko" : "Lunas"),
      cashAmount: cashAmt,
      transferAmount: transAmt,
    };

    // Save transaction and trigger receipt
    await db.saveTransaction(transaction);
    setActiveReceipt(transaction);

    // Reset cashier state - clear quantity input for all table rows
    setTableItems(prev => prev.map(item => ({ ...item, quantity: "" })));
    const defaultCust = customers.find(
      (c) => c.name.toLowerCase() === "pelanggan umum",
    );
    setSelectedCustomerId(
      defaultCust
        ? defaultCust.id
        : customers.length > 0
          ? customers[0].id
          : "",
    );
    setPaymentMethod("cash");
    setAmountPaid("");
    setTransactionNotes("");
    setMixCashAmount("");
    setMixTransferAmount("");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
      {/* LEFT COLUMN: PRODUCTS INPUT TABLE (8 Cols) */}
      <div className="lg:col-span-7 xl:col-span-8 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200/50 shadow-sm overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-red-500 to-red-600 rounded-t-2xl"></div>

          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/40">
            <div>
              <h3 className="text-sm font-black text-slate-800 tracking-wider uppercase flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-red-600" /> Input Kuantitas Transaksi
              </h3>
              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                Gunakan tombol ↑ ↓ ← → atau Enter untuk navigasi input dengan cepat
              </p>
            </div>
            <div className="flex items-center gap-2">
              {tableItems.some(r => (Number(r.quantity) || 0) > 0) && (
                <button
                  type="button"
                  onClick={handleClearAllRows}
                  className="rounded-xl px-3 py-1.5 text-[10px] font-extrabold text-slate-500 hover:text-red-600 border border-slate-200 bg-white hover:bg-red-50/20 transition cursor-pointer"
                >
                  Reset Jumlah
                </button>
              )}
              <span className="rounded-full bg-red-50 px-3 py-1 text-[10px] font-extrabold text-red-600 border border-red-100/60 whitespace-nowrap">
                {itemsToSubmit.length} Produk Dipilih
              </span>
            </div>
          </div>

          {/* Quick Filter Bar */}
          <div className="px-5 py-3 border-b border-slate-100 bg-white relative">
            <Search className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Cari produk dengan cepat..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/30 py-2 pl-9 pr-4 text-xs font-semibold text-slate-900 placeholder-slate-400 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none transition-all duration-200"
            />
            {filterQuery && (
              <button
                type="button"
                onClick={() => setFilterQuery("")}
                className="absolute right-8 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/50 bg-slate-50/30">
                  <th className="py-3 px-5 font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                    Nama Produk
                  </th>
                  <th className="py-3 px-5 font-bold text-slate-400 uppercase tracking-wider text-[10px] text-right">
                    Harga Satuan
                  </th>
                  <th className="py-3 px-5 font-bold text-slate-400 uppercase tracking-wider text-[10px] text-center w-36">
                    Kuantitas / Berat
                  </th>
                  <th className="py-3 px-5 font-bold text-slate-400 uppercase tracking-wider text-[10px] text-right">
                    Subtotal
                  </th>
                  <th className="py-3 px-5 font-bold text-slate-400 uppercase tracking-wider text-[10px] text-center w-12">
                    Batal
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-400 italic font-medium">
                      Tidak ada produk yang cocok dengan pencarian "{filterQuery}"
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row, visibleIndex) => {
                    const isSelected = (Number(row.quantity) || 0) > 0;
                    return (
                      <tr
                        key={row.id}
                        className={`transition duration-150 ${isSelected ? "bg-red-50/10 hover:bg-red-50/20" : "hover:bg-slate-50/30"
                          }`}
                      >
                        {/* Name */}
                        <td className="py-3 px-5 font-bold text-slate-800">
                          <div className="flex flex-col">
                            <span>{row.name}</span>
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                              Satuan: {row.unit}
                            </span>
                          </div>
                        </td>

                        {/* Price Input */}
                        <td className="py-2 px-5 text-right">
                          <div className="relative inline-block">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400">
                              Rp
                            </span>
                            <input
                              data-row={visibleIndex}
                              data-col="price"
                              type="number"
                              value={row.price}
                              placeholder="0"
                              onChange={(e) =>
                                handleRowChange(row.originalIndex, "price", e.target.value)
                              }
                              onKeyDown={(e) => handleKeyDown(e, visibleIndex, "price")}
                              className="w-28 px-2 py-1.5 pl-7 text-right font-mono font-bold text-slate-700 bg-white border border-slate-200 rounded-lg focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-all duration-200"
                            />
                          </div>
                        </td>

                        {/* Quantity Input */}
                        <td className="py-2 px-5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <input
                              data-row={visibleIndex}
                              data-col="quantity"
                              type="number"
                              step="any"
                              value={row.quantity}
                              placeholder="0"
                              onChange={(e) =>
                                handleRowChange(row.originalIndex, "quantity", e.target.value)
                              }
                              onKeyDown={(e) => handleKeyDown(e, visibleIndex, "quantity")}
                              className={`w-20 px-2 py-1.5 text-center font-mono font-extrabold rounded-lg border outline-none transition-all duration-200 ${isSelected
                                  ? "text-red-700 border-red-300 bg-red-50/20 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                                  : "text-slate-800 border-slate-200 bg-white focus:border-red-500 focus:ring-1 focus:ring-red-500"
                                }`}
                            />
                            <span className="text-[10px] text-slate-400 font-bold uppercase">
                              {row.unit}
                            </span>
                          </div>
                        </td>

                        {/* Subtotal */}
                        <td className="py-3 px-5 text-right font-mono font-black text-red-600">
                          {formatRupiah((Number(row.price) || 0) * (Number(row.quantity) || 0))}
                        </td>

                        {/* Actions (Clear single row) */}
                        <td className="py-3 px-5 text-center">
                          {isSelected ? (
                            <button
                              type="button"
                              onClick={() => handleClearRow(row.originalIndex)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition duration-200 cursor-pointer"
                              title="Hapus Kuantitas"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="text-slate-200">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Grand Total Indicator */}
          {cartTotal > 0 && (
            <div className="p-5 border-t border-slate-150 bg-red-50/5 flex justify-between items-center">
              <span className="text-xs font-black text-slate-500 uppercase tracking-wider">
                Total Tagihan:
              </span>
              <span className="text-xl font-black text-red-600 font-mono">
                {formatRupiah(cartTotal)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: CHECKOUT PANEL (4-5 Cols) */}
      <div className="lg:col-span-5 xl:col-span-4 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200/50 p-5 sm:p-6 shadow-sm space-y-5 relative">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-900 flex items-center gap-2 pb-3 border-b border-slate-100">
            <CheckCircle2 className="w-4 h-4 text-red-600" /> Selesaikan
            Transaksi
          </h3>

          {/* Customer Selection */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Pilih Pelanggan <span className="text-red-500">*</span>
              </label>

              {/* Quick Add Customer Trigger */}
              <button
                onClick={() => setQuickCustOpen(true)}
                className="text-[10px] text-red-600 font-bold flex items-center gap-0.5 hover:underline focus:outline-none cursor-pointer"
              >
                <UserPlus className="w-3 h-3" /> Tambah Pelanggan
              </button>
            </div>

            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <select
                id="cashier-customer-select"
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-9 pr-3 text-xs font-bold text-slate-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none transition-all duration-200"
              >
                {customers.map((cust) => (
                  <option key={cust.id} value={cust.id}>
                    {cust.name}{" "}
                    {cust.phone && cust.phone !== "-" ? `(${cust.phone})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Metode Pembayaran
            </label>
            <div className="grid grid-cols-4 gap-1 sm:gap-2">
              <button
                id="pay-cash-btn"
                type="button"
                onClick={() => setPaymentMethod("cash")}
                className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all duration-200 cursor-pointer ${paymentMethod === "cash"
                    ? "border-red-500 bg-red-500/5 text-red-600 font-bold shadow-sm shadow-red-500/5"
                    : "border-slate-100 bg-slate-50/50 hover:bg-slate-100/50 hover:border-slate-200 text-slate-600"
                  }`}
              >
                <DollarSign className="w-3.5 h-3.5 mb-1" />
                <span className="text-[9px] font-bold tracking-wide uppercase">
                  Cash
                </span>
              </button>

              <button
                id="pay-transfer-btn"
                type="button"
                onClick={() => setPaymentMethod("transfer")}
                className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all duration-200 cursor-pointer ${paymentMethod === "transfer"
                    ? "border-red-500 bg-red-500/5 text-red-600 font-bold shadow-sm shadow-red-500/5"
                    : "border-slate-100 bg-slate-50/50 hover:bg-slate-100/50 hover:border-slate-200 text-slate-600"
                  }`}
              >
                <Landmark className="w-3.5 h-3.5 mb-1" />
                <span className="text-[9px] font-bold tracking-wide uppercase">
                  Transfer
                </span>
              </button>

              <button
                id="pay-mix-btn"
                type="button"
                onClick={() => setPaymentMethod("mix")}
                className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all duration-200 cursor-pointer ${paymentMethod === "mix"
                    ? "border-red-500 bg-red-500/5 text-red-600 font-bold shadow-sm shadow-red-500/5"
                    : "border-slate-100 bg-slate-50/50 hover:bg-slate-100/50 hover:border-slate-200 text-slate-600"
                  }`}
              >
                <Shuffle className="w-3.5 h-3.5 mb-1 animate-pulse" />
                <span className="text-[9px] font-bold tracking-wide uppercase">
                  Mix
                </span>
              </button>

              <button
                id="pay-debt-btn"
                type="button"
                onClick={() => setPaymentMethod("debt")}
                className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all duration-200 cursor-pointer ${paymentMethod === "debt"
                    ? "border-red-500 bg-red-500/5 text-red-600 font-bold shadow-sm shadow-red-500/5"
                    : "border-slate-100 bg-slate-50/50 hover:bg-slate-100/50 hover:border-slate-200 text-slate-600"
                  }`}
              >
                <Wallet className="w-3.5 h-3.5 mb-1" />
                <span className="text-[9px] font-bold tracking-wide uppercase">
                  Utang
                </span>
              </button>
            </div>
          </div>

          {/* Conditional Cash/Transfer Paid Input */}
          {paymentMethod === "mix" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Tunai / Cash (Rp)
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                    Rp
                  </span>
                  <input
                    id="mix-cash-input"
                    type="number"
                    placeholder="0"
                    value={mixCashAmount}
                    onChange={(e) => handleMixCashChange(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-7 pr-2 text-xs font-black text-slate-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none transition-all duration-200"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Transfer (Rp)
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                    Rp
                  </span>
                  <input
                    id="mix-transfer-input"
                    type="number"
                    placeholder="0"
                    value={mixTransferAmount}
                    onChange={(e) => handleMixTransferChange(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-7 pr-2 text-xs font-black text-slate-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none transition-all duration-200"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {paymentMethod === "debt"
                  ? "Uang Muka / DP (Rp)"
                  : "Jumlah Uang Diterima (Rp)"}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                  Rp
                </span>
                <input
                  id="cashier-pay-input"
                  type="number"
                  placeholder={
                    paymentMethod === "debt" ? "0" : "Masukkan jumlah bayar"
                  }
                  value={amountPaid}
                  onChange={(e) =>
                    setAmountPaid(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-8 pr-3 text-xs font-black text-slate-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none transition-all duration-200"
                />
              </div>
            </div>
          )}

          {/* Calculations Indicator */}
          {itemsToSubmit.length > 0 && (
            <div className="bg-slate-50 border border-slate-150 rounded-xl p-4 text-xs space-y-2 font-semibold text-slate-600">
              <div className="flex justify-between">
                <span>Total Belanja:</span>
                <span className="font-bold text-slate-900 font-mono">
                  {formatRupiah(cartTotal)}
                </span>
              </div>
              {paymentMethod === "mix" ? (
                <>
                  <div className="flex justify-between text-slate-500 font-medium">
                    <span>Bayar Cash:</span>
                    <span className="font-mono font-bold text-slate-700">
                      {formatRupiah(Number(mixCashAmount) || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500 font-medium">
                    <span>Bayar Transfer:</span>
                    <span className="font-mono font-bold text-slate-700">
                      {formatRupiah(Number(mixTransferAmount) || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between text-emerald-600 font-bold pt-1.5 border-t border-dashed border-slate-200">
                    <span>Total Bayar (Lunas):</span>
                    <span className="font-black font-mono">
                      {formatRupiah((Number(mixCashAmount) || 0) + (Number(mixTransferAmount) || 0))}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span>Uang Diterima:</span>
                    <span className="font-bold text-slate-900 font-mono">
                      {formatRupiah(Number(amountPaid) || 0)}
                    </span>
                  </div>

                  {paymentMethod !== "debt" ? (
                    <div className="flex justify-between text-emerald-600 font-bold pt-1.5 border-t border-dashed border-slate-200">
                      <span>Uang Kembali:</span>
                      <span className="font-black font-mono">
                        {formatRupiah(
                          Math.max(0, (Number(amountPaid) || 0) - cartTotal),
                        )}
                      </span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-red-600 font-bold pt-1.5 border-t border-dashed border-slate-200">
                      <span>Sisa Jadi Utang:</span>
                      <span className="font-black font-mono">
                        {formatRupiah(
                          Math.max(0, cartTotal - (Number(amountPaid) || 0)),
                        )}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Transaction Notes */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Catatan Transaksi (Opsional)
            </label>
            <div className="relative">
              <FileText className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
              <textarea
                id="cashier-notes-input"
                placeholder="Contoh: Titipan, Tempo 3 hari, dll."
                value={transactionNotes}
                onChange={(e) => setTransactionNotes(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-xs text-slate-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none resize-none transition-all duration-200"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            id="checkout-submit-btn"
            onClick={handleCheckout}
            disabled={itemsToSubmit.length === 0}
            className={`w-full py-3.5 px-4 rounded-xl font-bold text-xs tracking-wider uppercase shadow-md transition duration-200 flex items-center justify-center gap-1.5 cursor-pointer ${itemsToSubmit.length === 0
                ? "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none"
                : "bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white hover:shadow-lg hover:shadow-red-600/10"
              }`}
          >
            Selesaikan & Cetak Struk
          </button>
        </div>
      </div>

      {/* QUICK CUSTOMER ADD MODAL */}
      {quickCustOpen && (
        <div
          id="quick-cust-modal-container"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl relative border-t-4 border-red-500 animate-in zoom-in-95 duration-150">
            <h4 className="font-black text-slate-900 text-sm mb-4 tracking-tight uppercase">
              Registrasi Pelanggan Baru
            </h4>

            <form onSubmit={handleQuickAddCustomer} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Nama Lengkap / Toko <span className="text-red-500">*</span>
                </label>
                <input
                  id="quick-customer-name-input"
                  type="text"
                  required
                  placeholder="Nama Pelanggan"
                  value={quickCustName}
                  onChange={(e) => setQuickCustName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-900 focus:border-red-500 focus:outline-none bg-slate-50/50"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  No. Telepon
                </label>
                <input
                  id="quick-customer-phone-input"
                  type="text"
                  placeholder="0812xxxx"
                  value={quickCustPhone}
                  onChange={(e) => setQuickCustPhone(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-900 focus:border-red-500 focus:outline-none bg-slate-50/50"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setQuickCustOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 text-xs font-bold transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  id="quick-customer-submit-btn"
                  type="submit"
                  className="rounded-xl bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white px-4 py-2 text-xs font-bold shadow-md shadow-red-600/10 transition cursor-pointer"
                >
                  Tambah Pelanggan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ACTIVE RECEIPT MODAL */}
      {activeReceipt && (
        <ReceiptModal
          transaction={activeReceipt}
          onClose={() => setActiveReceipt(null)}
        />
      )}
    </div>
  );
}
