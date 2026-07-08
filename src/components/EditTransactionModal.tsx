import React, { useState, useEffect } from "react";
import {
    Transaction,
    Item,
    Customer,
    TransactionItem,
    PaymentMethod,
} from "../types";
import { db } from "../utils/db";
import { formatRupiah } from "../utils/format";
import {
    X,
    ShoppingCart,
    Plus,
    Trash2,
    User,
    Landmark,
    DollarSign,
    Wallet,
    FileText,
    Save,
    Shuffle,
} from "lucide-react";

interface EditTransactionModalProps {
    transaction: Transaction;
    onClose: () => void;
    onSaveSuccess: () => void;
}

export default function EditTransactionModal({
    transaction,
    onClose,
    onSaveSuccess,
}: EditTransactionModalProps) {
    // Master lists
    const [items, setItems] = useState<Item[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);

    // Editing state - preloaded from transaction
    const [cartItems, setCartItems] = useState<TransactionItem[]>([
        ...transaction.items,
    ]);
    const [selectedCustomerId, setSelectedCustomerId] = useState(
        transaction.customerId,
    );
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
        transaction.paymentMethod,
    );
    const [amountPaid, setAmountPaid] = useState<number | "">(
        transaction.amountPaid,
    );
    const [transactionNotes, setTransactionNotes] = useState(
        transaction.notes || "",
    );

    // States for mix payment
    const [mixCashAmount, setMixCashAmount] = useState<number | "">(
        transaction.paymentMethod === "mix" ? (transaction.cashAmount || 0) : ""
    );
    const [mixTransferAmount, setMixTransferAmount] = useState<number | "">(
        transaction.paymentMethod === "mix" ? (transaction.transferAmount || 0) : ""
    );

    // Cart Form State
    const [selectedItemId, setSelectedItemId] = useState("");
    const [inputPrice, setInputPrice] = useState<number | "">("");
    const [inputQuantity, setInputQuantity] = useState<number | "">("");

    // Load items & customers
    useEffect(() => {
        const loadData = async () => {
            const [itemsData, customersData] = await Promise.all([
                db.getItems(),
                db.getCustomers(),
            ]);
            setItems(itemsData);
            setCustomers(customersData);
        };
        loadData();
    }, []);

    // Sync price when selected product changes in modal
    useEffect(() => {
        if (selectedItemId) {
            const matched = items.find((i) => i.id === selectedItemId);
            if (matched) {
                // Look up memorized or default price if possible
                const memories = db.getPriceMemories();
                const memorized = memories[selectedItemId];
                if (memorized !== undefined) {
                    setInputPrice(memorized);
                } else {
                    setInputPrice("");
                }
            }
        } else {
            setInputPrice("");
        }
    }, [selectedItemId, items]);

    const cartTotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0);

    // Sync amount paid when payment method changes
    useEffect(() => {
        if (paymentMethod === "cash" || paymentMethod === "transfer") {
            setAmountPaid(cartTotal);
        } else if (paymentMethod === "debt") {
            // Keep or let user manage
        } else if (paymentMethod === "mix") {
            if (mixCashAmount === "" && mixTransferAmount === "") {
                setMixCashAmount(Math.round(cartTotal * 0.5));
                setMixTransferAmount(Math.round(cartTotal * 0.5));
            }
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

        const price = Number(inputPrice);
        const quantity = Number(inputQuantity);
        const subtotal = Math.round(price * quantity);

        const existingIdx = cartItems.findIndex(
            (item) => item.itemId === selectedItemId,
        );
        if (existingIdx >= 0) {
            const updated = [...cartItems];
            updated[existingIdx] = {
                ...updated[existingIdx],
                price,
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
            [field]: value === "" ? "" : numericValue,
            subtotal: Math.round(newPrice * newQuantity),
        };
        setCartItems(updated);
    };

    const handleRemoveFromCart = (index: number) => {
        setCartItems(cartItems.filter((_, idx) => idx !== index));
    };

    const handleSave = async () => {
        if (cartItems.length === 0) {
            alert("Keranjang belanja tidak boleh kosong.");
            return;
        }

        const customer = customers.find((c) => c.id === selectedCustomerId);
        if (!customer) {
            alert("Pelanggan tidak valid.");
            return;
        }

        // Validation for debt
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

        const updatedTx: Transaction = {
            ...transaction,
            customerId: customer.id,
            customerName: customer.name,
            usePenerimaan: transaction.usePenerimaan,
            items: cartItems.map((item) => ({
                itemId: item.itemId,
                name: item.name,
                price: Number(item.price) || 0,
                quantity: Number(item.quantity) || 0,
                subtotal: Number(item.subtotal) || 0,
                unit: item.unit,
                receivedQuantity: item.receivedQuantity,
            })),
            totalAmount: cartTotal,
            paymentMethod,
            amountPaid: paid,
            remainingDebt,
            notes:
                transactionNotes.trim() ||
                (paymentMethod === "debt" ? "Utang Toko" : "Lunas"),
            cashAmount: cashAmt,
            transferAmount: transAmt,
        };

        try {
            await db.editTransaction(updatedTx);
            onSaveSuccess();
        } catch (e) {
            alert("Gagal menyimpan perubahan transaksi.");
        }
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="flex min-h-full items-center justify-center">
                <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl relative border-t-4 border-red-500 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150 my-8">
                    {/* Header */}
                    <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
                        <div>
                            <h3 className="font-black text-slate-900 text-sm tracking-tight uppercase flex items-center gap-2">
                                <ShoppingCart className="w-4 h-4 text-red-600" /> Edit Transaksi Penjualan
                            </h3>
                            <p className="text-[10px] text-slate-500 font-bold mt-0.5 font-mono">
                                NOTA: {transaction.invoiceNumber} • Tanggal:{" "}
                                {new Date(transaction.date).toLocaleDateString("id-ID", {
                                    day: "numeric",
                                    month: "long",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                })}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Modal Body (Scrollable) */}
                    <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Left: Product Picker & Shopping Cart (8 Cols) */}
                        <div className="lg:col-span-7 xl:col-span-8 space-y-6">
                            {/* Item selector form */}
                            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                                <span className="text-[10px] font-black uppercase text-slate-500 block">
                                    Tambah / Sesuaikan Item Belanja
                                </span>
                                <form
                                    onSubmit={handleAddToCart}
                                    className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
                                >
                                    <div className="sm:col-span-5">
                                        <select
                                            value={selectedItemId}
                                            onChange={(e) => setSelectedItemId(e.target.value)}
                                            className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs text-slate-900 focus:border-red-500 focus:outline-none"
                                        >
                                            <option value="">-- Pilih Produk --</option>
                                            {items.map((item) => (
                                                <option key={item.id} value={item.id}>
                                                    {item.name} ({item.unit})
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="sm:col-span-3">
                                        <div className="relative">
                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                                                Rp
                                            </span>
                                            <input
                                                type="number"
                                                placeholder="Harga"
                                                value={inputPrice}
                                                onChange={(e) =>
                                                    setInputPrice(
                                                        e.target.value === "" ? "" : Number(e.target.value),
                                                    )
                                                }
                                                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-7 pr-2 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="sm:col-span-2">
                                        <input
                                            type="number"
                                            step="any"
                                            placeholder="Qty"
                                            value={inputQuantity}
                                            onChange={(e) =>
                                                setInputQuantity(
                                                    e.target.value === "" ? "" : Number(e.target.value),
                                                )
                                            }
                                            className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none"
                                        />
                                    </div>

                                    <div className="sm:col-span-2">
                                        <button
                                            type="submit"
                                            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-2 shadow-sm transition cursor-pointer"
                                        >
                                            Tambah
                                        </button>
                                    </div>
                                </form>
                            </div>

                            {/* Cart list */}
                            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-100 bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[9px]">
                                            <th className="py-3 px-4">Produk</th>
                                            <th className="py-3 px-4 text-right">Harga Satuan</th>
                                            <th className="py-3 px-4 text-center">Kuantitas</th>
                                            <th className="py-3 px-4 text-right">Subtotal</th>
                                            <th className="py-3 px-4 text-center">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {cartItems.map((item, index) => (
                                            <tr key={index} className="hover:bg-slate-50/50">
                                                <td className="py-3 px-4 font-bold text-slate-800">
                                                    {item.name}
                                                </td>
                                                <td className="py-2 px-3 text-right">
                                                    <input
                                                        type="number"
                                                        value={item.price || ""}
                                                        onChange={(e) =>
                                                            handleUpdateCartItem(index, "price", e.target.value)
                                                        }
                                                        className="w-20 px-1.5 py-1 text-right font-mono text-slate-700 bg-white border border-slate-200 rounded focus:border-red-500 outline-none"
                                                    />
                                                </td>
                                                <td className="py-2 px-3 text-center">
                                                    <div className="flex items-center justify-center gap-1">
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
                                                            className="w-16 px-1.5 py-1 text-center font-mono font-bold text-slate-800 bg-white border border-slate-200 rounded focus:border-red-500 outline-none"
                                                        />
                                                        <span className="text-[9px] text-slate-400 font-bold uppercase">
                                                            {item.unit}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-right font-mono font-bold text-red-600">
                                                    {formatRupiah(item.subtotal)}
                                                </td>
                                                <td className="py-3 px-4 text-center">
                                                    <button
                                                        onClick={() => handleRemoveFromCart(index)}
                                                        className="text-slate-400 hover:text-red-600 p-1 rounded-lg transition hover:bg-red-50 cursor-pointer"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                <div className="p-4 border-t border-slate-100 bg-slate-50/30 flex justify-between items-center text-xs">
                                    <span className="font-black text-slate-500 uppercase tracking-wider">
                                        Total Tagihan Baru:
                                    </span>
                                    <span className="text-base font-black text-red-600 font-mono">
                                        {formatRupiah(cartTotal)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Right: Checkout Controls (4-5 Cols) */}
                        <div className="lg:col-span-5 xl:col-span-4 space-y-5">
                            {/* Customer Picker */}
                            <div className="space-y-1.5">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    Pelanggan
                                </label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                                    <select
                                        value={selectedCustomerId}
                                        onChange={(e) => setSelectedCustomerId(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-9 pr-3 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none transition-all"
                                    >
                                        {customers.map((cust) => (
                                            <option key={cust.id} value={cust.id}>
                                                {cust.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Payment Method */}
                            <div className="space-y-1.5">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    Metode Pembayaran
                                </label>
                                <div className="grid grid-cols-4 gap-1 sm:gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setPaymentMethod("cash")}
                                        className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl border text-center transition cursor-pointer ${paymentMethod === "cash"
                                                ? "border-red-500 bg-red-500/5 text-red-600 font-bold"
                                                : "border-slate-150 bg-slate-50/50 text-slate-600 hover:bg-slate-100/50"
                                            }`}
                                    >
                                        <DollarSign className="w-3.5 h-3.5 mb-1" />
                                        <span className="text-[9px] font-bold uppercase">Cash</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setPaymentMethod("transfer")}
                                        className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl border text-center transition cursor-pointer ${paymentMethod === "transfer"
                                                ? "border-red-500 bg-red-500/5 text-red-600 font-bold"
                                                : "border-slate-150 bg-slate-50/50 text-slate-600 hover:bg-slate-100/50"
                                            }`}
                                    >
                                        <Landmark className="w-3.5 h-3.5 mb-1" />
                                        <span className="text-[9px] font-bold uppercase">Transfer</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setPaymentMethod("mix")}
                                        className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl border text-center transition cursor-pointer ${paymentMethod === "mix"
                                                ? "border-red-500 bg-red-500/5 text-red-600 font-bold"
                                                : "border-slate-150 bg-slate-50/50 text-slate-600 hover:bg-slate-100/50"
                                            }`}
                                    >
                                        <Shuffle className="w-3.5 h-3.5 mb-1" />
                                        <span className="text-[9px] font-bold uppercase">Mix</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setPaymentMethod("debt")}
                                        className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl border text-center transition cursor-pointer ${paymentMethod === "debt"
                                                ? "border-red-500 bg-red-500/5 text-red-600 font-bold"
                                                : "border-slate-150 bg-slate-50/50 text-slate-600 hover:bg-slate-100/50"
                                            }`}
                                    >
                                        <Wallet className="w-3.5 h-3.5 mb-1" />
                                        <span className="text-[9px] font-bold uppercase">Utang</span>
                                    </button>
                                </div>
                            </div>

                            {/* Amount Paid / Mix Inputs */}
                            {paymentMethod === "mix" ? (
                                <div className="grid grid-cols-2 gap-2.5">
                                    <div className="space-y-1.5">
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                            Tunai / Cash (Rp)
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                                                Rp
                                            </span>
                                            <input
                                                type="number"
                                                value={mixCashAmount}
                                                onChange={(e) => handleMixCashChange(e.target.value)}
                                                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-7 pr-2 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none"
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
                                                type="number"
                                                value={mixTransferAmount}
                                                onChange={(e) => handleMixTransferChange(e.target.value)}
                                                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-7 pr-2 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none"
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
                                            type="number"
                                            value={amountPaid}
                                            onChange={(e) =>
                                                setAmountPaid(
                                                    e.target.value === "" ? "" : Number(e.target.value),
                                                )
                                            }
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-8 pr-3 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Calculations Panel */}
                            <div className="bg-slate-50 border border-slate-150 rounded-xl p-3.5 text-xs space-y-2 font-semibold text-slate-600">
                                <div className="flex justify-between">
                                    <span>Total Belanja:</span>
                                    <span className="font-bold text-slate-900 font-mono">
                                        {formatRupiah(cartTotal)}
                                    </span>
                                </div>
                                {paymentMethod === "mix" ? (
                                    <>
                                        <div className="flex justify-between text-slate-500">
                                            <span>Bayar Cash:</span>
                                            <span className="font-bold font-mono">
                                                {formatRupiah(Number(mixCashAmount) || 0)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-slate-500">
                                            <span>Bayar Transfer:</span>
                                            <span className="font-bold font-mono">
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

                            {/* Transaction Notes */}
                            <div className="space-y-1.5">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    Catatan Transaksi
                                </label>
                                <div className="relative">
                                    <FileText className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
                                    <textarea
                                        placeholder="Titipan, tempo, dll."
                                        value={transactionNotes}
                                        onChange={(e) => setTransactionNotes(e.target.value)}
                                        rows={2}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-xs text-slate-900 focus:border-red-500 focus:outline-none resize-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Modal Footer */}
                    <div className="p-4 border-t border-slate-150 bg-slate-50 flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 px-5 py-2.5 text-xs font-bold transition cursor-pointer"
                        >
                            Batal
                        </button>
                        <button
                            id="edit-transaction-save-btn"
                            onClick={handleSave}
                            disabled={cartItems.length === 0}
                            className="rounded-xl bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white px-5 py-2.5 text-xs font-bold shadow-md shadow-red-600/10 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" /> Simpan Perubahan
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
