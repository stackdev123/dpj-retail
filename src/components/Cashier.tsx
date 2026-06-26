import React, { useState, useEffect } from "react";
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
} from "lucide-react";

export default function Cashier() {
  // Master Lists
  const [items, setItems] = useState<Item[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  // Cart Items State
  const [cartItems, setCartItems] = useState<TransactionItem[]>([]);

  // Cart Form State
  const [selectedItemId, setSelectedItemId] = useState("");
  const [inputPrice, setInputPrice] = useState<number | "">("");
  const [inputQuantity, setInputQuantity] = useState<number | "">("");

  // Checkout Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState("cust-1"); // Default Pelanggan Umum
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amountPaid, setAmountPaid] = useState<number | "">("");
  const [transactionNotes, setTransactionNotes] = useState("");

  // Quick Customer Add Modal within Cashier
  const [quickCustOpen, setQuickCustOpen] = useState(false);
  const [quickCustName, setQuickCustName] = useState("");
  const [quickCustPhone, setQuickCustPhone] = useState("");

  // Receipt Modal trigger
  const [activeReceipt, setActiveReceipt] = useState<Transaction | null>(null);

  // Load master data on mount
  useEffect(() => {
    const loadData = async () => {
      const itemsData = await db.getItems();
      const customersData = await db.getCustomers();
      setItems(itemsData);
      setCustomers(customersData);

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

  // Sync default price when item selection changes (Memorized price feature)
  useEffect(() => {
    const loadPrice = async () => {
      if (selectedItemId) {
        const memories = await db.getPriceMemories();
        const memorizedPrice = memories[selectedItemId];
        if (memorizedPrice !== undefined) {
          setInputPrice(memorizedPrice);
        } else {
          setInputPrice("");
        }
      } else {
        setInputPrice("");
      }
    };
    loadPrice();
  }, [selectedItemId]);

  const cartTotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0);

  // Auto-set amount paid if cash/transfer is selected (to make the flow faster)
  useEffect(() => {
    if (paymentMethod === "cash" || paymentMethod === "transfer") {
      setAmountPaid(cartTotal);
    } else if (paymentMethod === "debt") {
      setAmountPaid(0); // For debt, default amount paid is 0 or customizable deposit
    }
  }, [paymentMethod, cartTotal]);

  // Handle adding an item to the shopping cart
  const handleAddToCart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId) {
      alert("Silakan pilih produk terlebih dahulu.");
      return;
    }
    if (!inputPrice || Number(inputPrice) <= 0) {
      alert("Silakan masukkan harga produk yang valid.");
      return;
    }
    if (!inputQuantity || Number(inputQuantity) <= 0) {
      alert("Silakan masukkan jumlah kuantitas yang valid.");
      return;
    }

    const matchedItem = items.find((i) => i.id === selectedItemId);
    if (!matchedItem) return;

    // Check if item already exists in cart. If so, replace/merge.
    const price = Number(inputPrice);
    const quantity = Number(inputQuantity);
    const subtotal = Math.round(price * quantity);

    const existingIdx = cartItems.findIndex(
      (item) => item.itemId === selectedItemId,
    );
    if (existingIdx >= 0) {
      // Ask user to merge or replace
      const updated = [...cartItems];
      updated[existingIdx] = {
        ...updated[existingIdx],
        price, // Update to the newly typed price
        quantity: updated[existingIdx].quantity + quantity,
        subtotal: Math.round(
          price * (updated[existingIdx].quantity + quantity),
        ),
      };
      setCartItems(updated);
    } else {
      const newItem: TransactionItem = {
        itemId: matchedItem.id,
        name: matchedItem.name,
        price,
        quantity,
        subtotal,
        unit: matchedItem.unit,
      };
      setCartItems([...cartItems, newItem]);
    }

    // Reset Form
    setSelectedItemId("");
    setInputPrice("");
    setInputQuantity("");
  };

  const handleUpdateCartItem = (
    index: number,
    field: "price" | "quantity",
    value: string,
  ) => {
    const updated = [...cartItems];
    const numericValue = value === "" ? 0 : Number(value);
    const newPrice = field === "price" ? numericValue : updated[index].price;
    const newQuantity =
      field === "quantity" ? numericValue : updated[index].quantity;

    updated[index] = {
      ...updated[index],
      [field]: value === "" ? "" : numericValue, // Allow empty temporarily while typing
      subtotal: Math.round(newPrice * newQuantity),
    };
    setCartItems(updated);
  };

  const handleRemoveFromCart = (index: number) => {
    const updated = cartItems.filter((_, idx) => idx !== index);
    setCartItems(updated);
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
    setSelectedCustomerId(newCust.id); // auto-select the newly added customer
    setQuickCustOpen(false);
    setQuickCustName("");
    setQuickCustPhone("");
  };

  // Process checkout
  const handleCheckout = async () => {
    if (cartItems.length === 0) {
      alert("Keranjang belanja masih kosong.");
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

    const paid = Number(amountPaid) || 0;
    if (paymentMethod !== "debt" && paid < cartTotal) {
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
      items: cartItems,
      totalAmount: cartTotal,
      paymentMethod,
      amountPaid: paid,
      remainingDebt,
      date: new Date().toISOString(),
      printCount: 0,
      notes:
        transactionNotes.trim() ||
        (paymentMethod === "debt" ? "Utang Toko" : "Lunas"),
    };

    // Save transaction and trigger receipt
    await db.saveTransaction(transaction);
    setActiveReceipt(transaction);

    // Reset cashier state
    setCartItems([]);
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
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
      {/* LEFT COLUMN: PRODUCT PICKER & CART (8 Cols) */}
      <div className="lg:col-span-7 xl:col-span-8 space-y-6 sm:space-y-8">
        {/* Item Picker Card */}
        <div className="bg-white rounded-2xl border border-slate-200/50 p-5 sm:p-6 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-red-500 to-red-600"></div>
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-900 mb-4 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-red-600" /> Pilih Produk &
            Harga
          </h3>

          <form
            onSubmit={handleAddToCart}
            className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end"
          >
            {/* Item Dropdown */}
            <div className="sm:col-span-5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Pilih Produk Ayam
              </label>
              <select
                id="cashier-item-select"
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-xs text-slate-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none transition-all duration-200"
              >
                <option value="">-- Pilih Produk --</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.unit})
                  </option>
                ))}
              </select>
            </div>

            {/* Price Input */}
            <div className="sm:col-span-3">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Harga Satuan (Rp)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                  Rp
                </span>
                <input
                  id="cashier-price-input"
                  type="number"
                  placeholder="Manual"
                  value={inputPrice}
                  onChange={(e) =>
                    setInputPrice(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-8 pr-3 text-xs font-bold text-slate-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none transition-all duration-200"
                />
              </div>
            </div>

            {/* Quantity Input */}
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Kuantitas (
                {selectedItemId
                  ? items.find((i) => i.id === selectedItemId)?.unit
                  : "Qty"}
                )
              </label>
              <input
                id="cashier-qty-input"
                type="number"
                step="any"
                placeholder="0"
                value={inputQuantity}
                onChange={(e) =>
                  setInputQuantity(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    e.preventDefault();
                  }
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-xs font-bold text-slate-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none transition-all duration-200"
              />
            </div>

            {/* Add to Cart Button */}
            <div className="sm:col-span-2">
              <button
                id="add-to-cart-btn"
                type="submit"
                className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white font-bold text-xs py-2.5 shadow-md shadow-red-600/10 hover:shadow-lg transition duration-200 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Tambah
              </button>
            </div>
          </form>

          {selectedItemId && db.getPriceMemories()[selectedItemId] && (
            <p className="text-[10px] text-slate-400 mt-2 italic font-medium flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
              * Terisi otomatis dari transaksi terakhir pelanggan (
              {formatRupiah(db.getPriceMemories()[selectedItemId])}).
            </p>
          )}
        </div>

        {/* Cart Contents Table */}
        <div className="bg-white rounded-2xl border border-slate-200/50 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/40">
            <h3 className="text-xs font-black text-slate-800 tracking-wider uppercase">
              Keranjang Belanja
            </h3>
            <span className="rounded-full bg-red-50 px-3 py-0.5 text-[10px] font-extrabold text-red-600 border border-red-100/60">
              {cartItems.length} Jenis Produk
            </span>
          </div>

          {cartItems.length === 0 ? (
            <div className="p-16 text-center text-slate-400 text-xs font-medium max-w-md mx-auto space-y-2">
              <div className="text-3xl">🐔</div>
              <p>
                Keranjang masih kosong. Pilih produk dan masukkan harga di atas
                untuk memulai penjualan ayam.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200/50 bg-slate-50/50">
                    <th className="py-3 px-5 font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                      Produk
                    </th>
                    <th className="py-3 px-5 font-bold text-slate-400 uppercase tracking-wider text-[10px] text-right">
                      Harga Satuan
                    </th>
                    <th className="py-3 px-5 font-bold text-slate-400 uppercase tracking-wider text-[10px] text-center">
                      Kuantitas
                    </th>
                    <th className="py-3 px-5 font-bold text-slate-400 uppercase tracking-wider text-[10px] text-right">
                      Subtotal
                    </th>
                    <th className="py-3 px-5 font-bold text-slate-400 uppercase tracking-wider text-[10px] text-center">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cartItems.map((item, index) => (
                    <tr
                      key={index}
                      className="hover:bg-slate-50/30 transition duration-150"
                    >
                      <td className="py-3.5 px-5 font-bold text-slate-800">
                        {item.name}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <input
                          type="number"
                          value={item.price || ""}
                          onChange={(e) =>
                            handleUpdateCartItem(index, "price", e.target.value)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp" || e.key === "ArrowDown")
                              e.preventDefault();
                          }}
                          className="w-24 px-2 py-1 text-right font-mono font-medium text-slate-700 bg-white border border-slate-200 rounded focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-all duration-200"
                        />
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <input
                            type="number"
                            step="any"
                            value={item.quantity || ""}
                            onChange={(e) =>
                              handleUpdateCartItem(
                                index,
                                "quantity",
                                e.target.value,
                              )
                            }
                            onKeyDown={(e) => {
                              if (e.key === "ArrowUp" || e.key === "ArrowDown")
                                e.preventDefault();
                            }}
                            className="w-16 px-2 py-1 text-center font-mono font-extrabold text-slate-800 bg-white border border-slate-200 rounded focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-all duration-200"
                          />
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                            {item.unit}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-5 text-right font-mono font-black text-red-600">
                        {formatRupiah(item.subtotal)}
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        <button
                          onClick={() => handleRemoveFromCart(index)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition duration-200 cursor-pointer"
                          title="Hapus"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Cart Grand Total Indicator */}
          {cartItems.length > 0 && (
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
            <div className="grid grid-cols-3 gap-2">
              <button
                id="pay-cash-btn"
                type="button"
                onClick={() => setPaymentMethod("cash")}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all duration-200 cursor-pointer ${
                  paymentMethod === "cash"
                    ? "border-red-500 bg-red-500/5 text-red-600 font-bold shadow-sm shadow-red-500/5"
                    : "border-slate-100 bg-slate-50/50 hover:bg-slate-100/50 hover:border-slate-200 text-slate-600"
                }`}
              >
                <DollarSign className="w-4 h-4 mb-1" />
                <span className="text-[10px] font-bold tracking-wide uppercase">
                  Cash
                </span>
              </button>

              <button
                id="pay-transfer-btn"
                type="button"
                onClick={() => setPaymentMethod("transfer")}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all duration-200 cursor-pointer ${
                  paymentMethod === "transfer"
                    ? "border-red-500 bg-red-500/5 text-red-600 font-bold shadow-sm shadow-red-500/5"
                    : "border-slate-100 bg-slate-50/50 hover:bg-slate-100/50 hover:border-slate-200 text-slate-600"
                }`}
              >
                <Landmark className="w-4 h-4 mb-1" />
                <span className="text-[10px] font-bold tracking-wide uppercase">
                  Transfer
                </span>
              </button>

              <button
                id="pay-debt-btn"
                type="button"
                onClick={() => setPaymentMethod("debt")}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all duration-200 cursor-pointer ${
                  paymentMethod === "debt"
                    ? "border-red-500 bg-red-500/5 text-red-600 font-bold shadow-sm shadow-red-500/5"
                    : "border-slate-100 bg-slate-50/50 hover:bg-slate-100/50 hover:border-slate-200 text-slate-600"
                }`}
              >
                <Wallet className="w-4 h-4 mb-1" />
                <span className="text-[10px] font-bold tracking-wide uppercase">
                  Utang
                </span>
              </button>
            </div>
          </div>

          {/* Cash Paid Input */}
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

          {/* Calculations Indicator */}
          {cartItems.length > 0 && (
            <div className="bg-slate-50 border border-slate-150 rounded-xl p-4 text-xs space-y-2 font-semibold text-slate-600">
              <div className="flex justify-between">
                <span>Total Belanja:</span>
                <span className="font-bold text-slate-900 font-mono">
                  {formatRupiah(cartTotal)}
                </span>
              </div>
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
            disabled={cartItems.length === 0}
            className={`w-full py-3.5 px-4 rounded-xl font-bold text-xs tracking-wider uppercase shadow-md transition duration-200 flex items-center justify-center gap-1.5 cursor-pointer ${
              cartItems.length === 0
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
