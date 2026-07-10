import React, { useState, useEffect, useRef } from "react";
import { Item, Transaction, StockIn, StockOpname } from "../types";
import { db } from "../utils/db";
import {
    Plus,
    Edit,
    Trash2,
    Search,
    Package,
    Layers,
    TrendingDown,
    TrendingUp,
    RefreshCw,
    Scale,
    Calendar,
    Truck,
    ArrowDownCircle,
    AlertCircle,
    CheckCircle2,
    Save,
    ArrowRight,
    ArrowLeft,
    ChevronLeft,
    ChevronRight,
    Sparkles
} from "lucide-react";

export default function StockManager() {
    const [activeTab, setActiveTab] = useState<"current" | "input" | "history_in" | "history_opname">("current");

    // Data States
    const [items, setItems] = useState<Item[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [stockIns, setStockIns] = useState<StockIn[]>([]);
    const [stockOpnames, setStockOpnames] = useState<StockOpname[]>([]);
    const [loading, setLoading] = useState(true);

    // Filter States
    const [searchQuery, setSearchQuery] = useState("");
    const [supplierFilter, setSupplierFilter] = useState("");

    // Input Stock-In Grid State
    const [inputGrid, setInputGrid] = useState<{
        [itemId: string]: {
            quantity: string;
            pricePerItem: string;
            supplier: string;
            notes: string;
        };
    }>({});

    // Opname Modal State
    const [opnameItem, setOpnameItem] = useState<Item | null>(null);
    const [opnameActual, setOpnameActual] = useState("");
    const [opnameNotes, setOpnameNotes] = useState("");
    const [opnamePrevStock, setOpnamePrevStock] = useState(0);

    // Edit Stock-In Modal State
    const [editingStockIn, setEditingStockIn] = useState<StockIn | null>(null);
    const [editQty, setEditQty] = useState("");
    const [editPrice, setEditPrice] = useState("");
    const [editSupplier, setEditSupplier] = useState("");
    const [editNotes, setEditNotes] = useState("");
    const [editDate, setEditDate] = useState("");

    // Toast / Alert States
    const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    useEffect(() => {
        loadAllData();
    }, []);

    const loadAllData = async () => {
        setLoading(true);
        try {
            const [itemsData, txData, stockInData, opnameData] = await Promise.all([
                db.getItems(),
                db.getTransactions(),
                db.getStockIns(),
                db.getStockOpnames()
            ]);
            setItems(itemsData);
            setTransactions(txData);
            setStockIns(stockInData);
            setStockOpnames(opnameData);

            // Initialize empty Input Grid for all items
            const grid: typeof inputGrid = {};
            itemsData.forEach(item => {
                if (isFrozenItem(item)) {
                    grid[item.id] = {
                        quantity: "",
                        pricePerItem: "",
                        supplier: "",
                        notes: ""
                    };
                }
            });
            setInputGrid(grid);
        } catch (e) {
            console.error("Error loading stock data:", e);
        } finally {
            setLoading(false);
        }
    };

    const showNotification = (type: "success" | "error", text: string) => {
        setAlertMsg({ type, text });
        setTimeout(() => {
            setAlertMsg(null);
        }, 4000);
    };

    // Helper to check if item is frozen
    const isFrozenItem = (item: Item) => {
        return item.name.toUpperCase().includes("FROZEN");
    };

    const frozenItems = items.filter(isFrozenItem);

    // Helper to calculate stock
    const calculateCurrentStock = (itemId: string, itemCreatedAt: string) => {
        // 1. Find latest opname
        const itemOpnames = stockOpnames
            .filter(o => o.itemId === itemId)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        let baseStock = 0;
        let baseDate = itemCreatedAt;

        if (itemOpnames.length > 0) {
            baseStock = itemOpnames[0].actualQuantity;
            baseDate = itemOpnames[0].date;
        }

        // 2. Sum Stock In after baseDate
        const insAfter = stockIns
            .filter(s => s.itemId === itemId && new Date(s.date).getTime() > new Date(baseDate).getTime())
            .reduce((sum, s) => sum + s.quantity, 0);

        // 3. Sum Stock Out after baseDate (from transactions)
        let outsAfter = 0;
        transactions
            .filter(tx => new Date(tx.date).getTime() > new Date(baseDate).getTime())
            .forEach(tx => {
                tx.items.forEach(item => {
                    if (item.itemId === itemId) {
                        const qtyOut = tx.usePenerimaan && item.receivedQuantity !== undefined
                            ? item.receivedQuantity
                            : item.quantity;
                        outsAfter += qtyOut;
                    }
                });
            });

        return baseStock + insAfter - outsAfter;
    };

    // Quick seed sample frozen items if none exist
    const handleSeedFrozenItems = async () => {
        try {
            const sampleFrozen = [
                { id: `item-fz-1`, name: "Fillet Dada FROZEN", unit: "kg", createdAt: new Date().toISOString() },
                { id: `item-fz-2`, name: "Sayap Ayam FROZEN", unit: "kg", createdAt: new Date().toISOString() },
                { id: `item-fz-3`, name: "Paha Ayam FROZEN", unit: "kg", createdAt: new Date().toISOString() },
            ];
            for (const item of sampleFrozen) {
                await db.saveItem(item);
            }
            showNotification("success", "Berhasil menambahkan 3 produk frozen contoh!");
            await loadAllData();
        } catch (e) {
            showNotification("error", "Gagal menambahkan produk frozen.");
        }
    };

    // Keyboard navigation inside Stock-In Grid
    const handleKeyDown = (
        e: React.KeyboardEvent<HTMLInputElement>,
        field: "qty" | "price" | "supplier",
        index: number,
        maxIndex: number
    ) => {
        if (e.key === "ArrowDown" || e.key === "Enter") {
            e.preventDefault();
            const nextIndex = index + 1;
            if (nextIndex < maxIndex) {
                const nextInput = document.getElementById(`input-${field}-${nextIndex}`);
                if (nextInput) {
                    nextInput.focus();
                    (nextInput as HTMLInputElement).select();
                }
            }
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            const prevIndex = index - 1;
            if (prevIndex >= 0) {
                const prevInput = document.getElementById(`input-${field}-${prevIndex}`);
                if (prevInput) {
                    prevInput.focus();
                    (prevInput as HTMLInputElement).select();
                }
            }
        }
    };

    // Submit Bulk Stock In
    const handleSubmitStockIn = async () => {
        let savedCount = 0;
        try {
            for (const item of frozenItems) {
                const entry = inputGrid[item.id];
                if (entry && entry.quantity && Number(entry.quantity) > 0) {
                    const qty = Number(entry.quantity);
                    const price = entry.pricePerItem ? Number(entry.pricePerItem) : undefined;
                    const supplier = entry.supplier.trim() || undefined;

                    const newStockIn: StockIn = {
                        id: `stk-in-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        date: new Date().toISOString(),
                        itemId: item.id,
                        itemName: item.name,
                        quantity: qty,
                        pricePerItem: price,
                        supplier: supplier,
                        notes: entry.notes.trim() || undefined
                    };

                    await db.saveStockIn(newStockIn);
                    savedCount++;
                }
            }

            if (savedCount > 0) {
                showNotification("success", `Berhasil menyimpan ${savedCount} transaksi stok masuk!`);
                await loadAllData();
                setActiveTab("history_in");
            } else {
                showNotification("error", "Silakan masukkan jumlah stok masuk (lebih dari 0) pada produk terlebih dahulu.");
            }
        } catch (e) {
            showNotification("error", "Terjadi kesalahan saat menyimpan stok masuk.");
        }
    };

    // Open Opname Modal
    const handleOpenOpname = (item: Item) => {
        const currentStock = calculateCurrentStock(item.id, item.createdAt);
        setOpnameItem(item);
        setOpnamePrevStock(currentStock);
        setOpnameActual(currentStock.toString());
        setOpnameNotes("");
    };

    // Submit Opname
    const handleSubmitOpname = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!opnameItem) return;

        const actualQty = Number(opnameActual);
        if (isNaN(actualQty) || actualQty < 0) {
            showNotification("error", "Jumlah aktual harus berupa angka positif.");
            return;
        }

        try {
            const newOpname: StockOpname = {
                id: `opname-${Date.now()}`,
                date: new Date().toISOString(),
                itemId: opnameItem.id,
                itemName: opnameItem.name,
                actualQuantity: actualQty,
                previousQuantity: opnamePrevStock,
                notes: opnameNotes.trim() || "Stock Opname Aktual"
            };

            await db.saveStockOpname(newOpname);
            showNotification("success", `Stok "${opnameItem.name}" berhasil diopname menjadi ${actualQty} ${opnameItem.unit}`);
            setOpnameItem(null);
            await loadAllData();
        } catch (e) {
            showNotification("error", "Gagal menyimpan stock opname.");
        }
    };

    // Delete Stock In Record
    const handleDeleteStockIn = async (record: StockIn) => {
        if (confirm(`Apakah Anda yakin ingin menghapus transaksi stok masuk "${record.itemName}" sebanyak ${record.quantity} ${items.find(i => i.id === record.itemId)?.unit || 'unit'}?`)) {
            try {
                await db.deleteStockIn(record.id);
                showNotification("success", "Stok masuk berhasil dihapus.");
                await loadAllData();
            } catch (e) {
                showNotification("error", "Gagal menghapus stok masuk.");
            }
        }
    };

    // Open Edit Stock-In Modal
    const handleOpenEditStockIn = (record: StockIn) => {
        setEditingStockIn(record);
        setEditQty(record.quantity.toString());
        setEditPrice(record.pricePerItem ? record.pricePerItem.toString() : "");
        setEditSupplier(record.supplier || "");
        setEditNotes(record.notes || "");
        setEditDate(record.date.substring(0, 16)); // Format YYYY-MM-DDTHH:MM
    };

    // Save Edited Stock-In
    const handleSaveEditStockIn = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingStockIn) return;

        const qty = Number(editQty);
        if (isNaN(qty) || qty <= 0) {
            showNotification("error", "Jumlah masuk harus lebih dari 0.");
            return;
        }

        try {
            const updated: StockIn = {
                ...editingStockIn,
                quantity: qty,
                pricePerItem: editPrice ? Number(editPrice) : undefined,
                supplier: editSupplier.trim() || undefined,
                notes: editNotes.trim() || undefined,
                date: new Date(editDate).toISOString()
            };

            await db.saveStockIn(updated);
            showNotification("success", "Detail stok masuk berhasil diubah.");
            setEditingStockIn(null);
            await loadAllData();
        } catch (e) {
            showNotification("error", "Gagal menyimpan perubahan.");
        }
    };

    // Formatter for Rupiah
    const formatRupiah = (num: number) => {
        return new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(num);
    };

    // Formatter for Dates
    const formatDate = (isoString: string) => {
        const d = new Date(isoString);
        return d.toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    // Filter Stock In History
    const filteredStockInHistory = stockIns
        .filter(record => {
            const itemMatch = record.itemName.toLowerCase().includes(searchQuery.toLowerCase());
            const supplierMatch = record.supplier?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
            const supplierSelectMatch = !supplierFilter || record.supplier === supplierFilter;
            return (itemMatch || supplierMatch) && supplierSelectMatch;
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Distinct list of suppliers for filter dropdown
    const uniqueSuppliers = Array.from(
        new Set(stockIns.map(s => s.supplier).filter((s): s is string => !!s))
    );

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                    <h2 className="text-lg font-extrabold text-slate-900 tracking-tight uppercase flex items-center gap-2">
                        <Package className="w-5 h-5 text-red-600" /> Fitur Stok Frozen
                    </h2>
                    <p className="text-xs text-slate-500 mt-1 font-medium">
                        Kelola persediaan barang masuk, barang keluar dari transaksi kasir, serta opname fisik untuk produk **FROZEN**
                    </p>
                </div>

                {/* Navigation Tabs */}
                <div className="inline-flex rounded-xl bg-slate-100 p-1 self-start flex-wrap gap-1">
                    <button
                        id="tab-stok-sekarang"
                        onClick={() => {
                            setActiveTab("current");
                            setSearchQuery("");
                        }}
                        className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[11px] font-black uppercase tracking-wider transition duration-150 cursor-pointer ${activeTab === "current"
                                ? "bg-red-600 text-white shadow-sm"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                    >
                        <Layers className="w-3.5 h-3.5" /> Stok Saat Ini & Opname
                    </button>
                    <button
                        id="tab-stok-masuk"
                        onClick={() => {
                            setActiveTab("input");
                            setSearchQuery("");
                        }}
                        className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[11px] font-black uppercase tracking-wider transition duration-150 cursor-pointer ${activeTab === "input"
                                ? "bg-red-600 text-white shadow-sm"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                    >
                        <TrendingUp className="w-3.5 h-3.5" /> Input Stok Masuk
                    </button>
                    <button
                        id="tab-laporan-stok-masuk"
                        onClick={() => {
                            setActiveTab("history_in");
                            setSearchQuery("");
                        }}
                        className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[11px] font-black uppercase tracking-wider transition duration-150 cursor-pointer ${activeTab === "history_in"
                                ? "bg-red-600 text-white shadow-sm"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                    >
                        <Calendar className="w-3.5 h-3.5" /> Laporan Stok Masuk
                    </button>
                    <button
                        id="tab-riwayat-opname"
                        onClick={() => {
                            setActiveTab("history_opname");
                            setSearchQuery("");
                        }}
                        className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[11px] font-black uppercase tracking-wider transition duration-150 cursor-pointer ${activeTab === "history_opname"
                                ? "bg-red-600 text-white shadow-sm"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                    >
                        <Scale className="w-3.5 h-3.5" /> Riwayat Opname
                    </button>
                </div>
            </div>

            {/* Floating Alerts */}
            {alertMsg && (
                <div className={`fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3.5 rounded-2xl border shadow-xl transition-all duration-300 animate-in fade-in slide-in-from-top-4 ${alertMsg.type === "success"
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                        : "bg-red-50 border-red-200 text-red-800"
                    }`}>
                    {alertMsg.type === "success" ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertCircle className="w-5 h-5 text-red-600" />}
                    <span className="text-xs font-bold">{alertMsg.text}</span>
                </div>
            )}

            {/* Overview stats cards */}
            {frozenItems.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-slate-50 border border-slate-200/60 p-4.5 rounded-2xl flex items-center justify-between">
                        <div className="min-w-0">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Total Produk Frozen</span>
                            <span className="text-xl font-black text-slate-800 mt-1 block">{frozenItems.length} Produk</span>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600">
                            <Package className="w-5 h-5" />
                        </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200/60 p-4.5 rounded-2xl flex items-center justify-between">
                        <div className="min-w-0">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Total Persediaan</span>
                            <span className="text-xl font-black text-emerald-700 mt-1 block">
                                {frozenItems.reduce((sum, item) => sum + calculateCurrentStock(item.id, item.createdAt), 0).toLocaleString("id-ID")} Unit
                            </span>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                            <Layers className="w-5 h-5" />
                        </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200/60 p-4.5 rounded-2xl flex items-center justify-between">
                        <div className="min-w-0">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Stok Kritis (≤ 0)</span>
                            <span className="text-xl font-black text-red-600 mt-1 block">
                                {frozenItems.filter(item => calculateCurrentStock(item.id, item.createdAt) <= 0).length} Produk
                            </span>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-500">
                            <TrendingDown className="w-5 h-5" />
                        </div>
                    </div>
                </div>
            )}

            {/* If No Frozen Items Exist */}
            {frozenItems.length === 0 && !loading && (
                <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 md:p-8 flex flex-col items-center text-center max-w-xl mx-auto space-y-4">
                    <AlertCircle className="w-12 h-12 text-amber-500" />
                    <div>
                        <h3 className="text-sm font-black text-slate-900 uppercase">Belum Ada Produk Frozen</h3>
                        <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                            Sistem mendeteksi belum ada produk di Database Master yang mengandung nama kata <strong className="text-amber-700">"FROZEN"</strong>.
                            Stok hanya dilacak untuk produk yang mengandung unsur kata "FROZEN".
                        </p>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={handleSeedFrozenItems}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs px-4 py-2.5 shadow transition cursor-pointer"
                        >
                            <Sparkles className="w-3.5 h-3.5" /> Tambahkan Produk Frozen Contoh
                        </button>
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            {frozenItems.length > 0 && (
                <div className="bg-white rounded-3xl border border-slate-100/80 shadow-sm overflow-hidden">

                    {/* TAB 1: CURRENT STOCK & OPNAME */}
                    {activeTab === "current" && (
                        <div className="p-6 space-y-4">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                <div className="relative w-full sm:max-w-xs">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                        <Search className="w-4 h-4" />
                                    </span>
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Cari nama produk frozen..."
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-4 text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none transition-all duration-200"
                                    />
                                </div>
                                <button
                                    onClick={loadAllData}
                                    className="inline-flex items-center gap-1.5 text-xs font-black uppercase text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-200 px-3 py-2 rounded-xl bg-white hover:bg-red-50/20 cursor-pointer transition shadow-sm"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" /> Segarkan Data
                                </button>
                            </div>

                            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 text-slate-600 border-b border-slate-100 text-[10px]">
                                            <th className="py-4 px-5 font-black uppercase tracking-wider">No</th>
                                            <th className="py-4 px-5 font-black uppercase tracking-wider">Nama Produk Frozen</th>
                                            <th className="py-4 px-5 font-black uppercase tracking-wider text-center">Satuan</th>
                                            <th className="py-4 px-5 font-black uppercase tracking-wider text-right text-emerald-700">Total Masuk (In)</th>
                                            <th className="py-4 px-5 font-black uppercase tracking-wider text-right text-red-600">Total Keluar (Out)</th>
                                            <th className="py-4 px-5 font-black uppercase tracking-wider text-right text-blue-700">Stok Saat Ini (Sistem)</th>
                                            <th className="py-4 px-5 font-black uppercase tracking-wider text-center">Status Stok</th>
                                            <th className="py-4 px-5 font-black uppercase tracking-wider text-center">Aksi Opname</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-xs">
                                        {frozenItems
                                            .filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
                                            .map((item, idx) => {
                                                // Gather totals
                                                const opnames = stockOpnames.filter(o => o.itemId === item.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                                                const baseDate = opnames.length > 0 ? opnames[0].date : item.createdAt;
                                                const baseQty = opnames.length > 0 ? opnames[0].actualQuantity : 0;

                                                const totalIn = stockIns
                                                    .filter(s => s.itemId === item.id && new Date(s.date).getTime() > new Date(baseDate).getTime())
                                                    .reduce((sum, s) => sum + s.quantity, 0);

                                                let totalOut = 0;
                                                transactions
                                                    .filter(tx => new Date(tx.date).getTime() > new Date(baseDate).getTime())
                                                    .forEach(tx => {
                                                        tx.items.forEach(it => {
                                                            if (it.itemId === item.id) {
                                                                totalOut += tx.usePenerimaan && it.receivedQuantity !== undefined ? it.receivedQuantity : it.quantity;
                                                            }
                                                        });
                                                    });

                                                const currentStock = baseQty + totalIn - totalOut;

                                                return (
                                                    <tr key={item.id} className="hover:bg-slate-50/50 transition">
                                                        <td className="py-3.5 px-5 font-mono font-bold text-slate-400">{idx + 1}</td>
                                                        <td className="py-3.5 px-5 font-black text-slate-800">{item.name}</td>
                                                        <td className="py-3.5 px-5 text-center text-slate-500 font-bold uppercase">{item.unit}</td>
                                                        <td className="py-3.5 px-5 text-right text-emerald-600 font-bold font-mono">
                                                            {totalIn > 0 ? `+${totalIn.toLocaleString("id-ID")}` : "-"}
                                                            {opnames.length > 0 && <span className="text-[9px] text-slate-400 block font-sans">Sejak Opname</span>}
                                                        </td>
                                                        <td className="py-3.5 px-5 text-right text-red-600 font-bold font-mono">
                                                            {totalOut > 0 ? `-${totalOut.toLocaleString("id-ID")}` : "-"}
                                                            {opnames.length > 0 && <span className="text-[9px] text-slate-400 block font-sans">Sejak Opname</span>}
                                                        </td>
                                                        <td className="py-3.5 px-5 text-right font-black font-mono text-slate-900 text-sm">
                                                            {currentStock.toLocaleString("id-ID")}
                                                            {opnames.length > 0 && <span className="text-[8px] text-indigo-600 font-black uppercase tracking-wider block font-sans">Opname: {baseQty}</span>}
                                                        </td>
                                                        <td className="py-3.5 px-5 text-center">
                                                            {currentStock <= 0 ? (
                                                                <span className="inline-flex rounded-lg bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider">Kosong</span>
                                                            ) : currentStock <= 5 ? (
                                                                <span className="inline-flex rounded-lg bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider">Kritis</span>
                                                            ) : (
                                                                <span className="inline-flex rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider">Aman</span>
                                                            )}
                                                        </td>
                                                        <td className="py-3.5 px-5 text-center">
                                                            <button
                                                                onClick={() => handleOpenOpname(item)}
                                                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-[10px] py-1 px-2.5 shadow-sm transition cursor-pointer"
                                                                title="Lakukan Opname Stok Fisik"
                                                            >
                                                                <Scale className="w-3 h-3 text-indigo-600" /> Opname
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: INPUT STOK MASUK (GRID KEYBOARD-NAVIGABLE) */}
                    {activeTab === "input" && (
                        <div className="p-6 space-y-4">


                            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 text-slate-600 border-b border-slate-100 text-[10px]">
                                            <th className="py-4 px-5 font-black uppercase tracking-wider">Nama Produk Frozen</th>
                                            <th className="py-4 px-5 font-black uppercase tracking-wider text-right">Stok Sistem</th>
                                            <th className="py-4 px-5 font-black uppercase tracking-wider w-36">Jumlah Masuk</th>
                                            <th className="py-4 px-5 font-black uppercase tracking-wider w-48">Harga per Item (Rp)</th>
                                            <th className="py-4 px-5 font-black uppercase tracking-wider w-56">Supplier (Pemasok)</th>
                                            <th className="py-4 px-5 font-black uppercase tracking-wider">Catatan Tambahan</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-xs">
                                        {frozenItems.map((item, index) => {
                                            const currentStock = calculateCurrentStock(item.id, item.createdAt);
                                            const gridRow = inputGrid[item.id] || { quantity: "", pricePerItem: "", supplier: "", notes: "" };

                                            const updateGridField = (field: keyof typeof gridRow, value: string) => {
                                                setInputGrid(prev => ({
                                                    ...prev,
                                                    [item.id]: {
                                                        ...prev[item.id],
                                                        [field]: value
                                                    }
                                                }));
                                            };

                                            return (
                                                <tr key={item.id} className="hover:bg-slate-50/30 transition">
                                                    <td className="py-3 px-5">
                                                        <span className="font-black text-slate-800 block">{item.name}</span>
                                                        <span className="text-[10px] text-slate-400 font-bold block uppercase mt-0.5">{item.unit}</span>
                                                    </td>
                                                    <td className="py-3 px-5 text-right font-bold font-mono text-slate-600">
                                                        {currentStock.toLocaleString("id-ID")}
                                                    </td>
                                                    <td className="py-3 px-5">
                                                        <div className="relative">
                                                            <input
                                                                id={`input-qty-${index}`}
                                                                type="number"
                                                                step="any"
                                                                value={gridRow.quantity}
                                                                onChange={(e) => updateGridField("quantity", e.target.value)}
                                                                onKeyDown={(e) => handleKeyDown(e, "qty", index, frozenItems.length)}
                                                                placeholder="0"
                                                                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-black text-slate-800 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none"
                                                            />
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-5">
                                                        <div className="relative">
                                                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">Rp</span>
                                                            <input
                                                                id={`input-price-${index}`}
                                                                type="number"
                                                                value={gridRow.pricePerItem}
                                                                onChange={(e) => updateGridField("pricePerItem", e.target.value)}
                                                                onKeyDown={(e) => handleKeyDown(e, "price", index, frozenItems.length)}
                                                                placeholder="Kosong"
                                                                className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2 py-1.5 text-xs font-bold text-slate-800 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none"
                                                            />
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-5">
                                                        <input
                                                            id={`input-supplier-${index}`}
                                                            type="text"
                                                            value={gridRow.supplier}
                                                            onChange={(e) => updateGridField("supplier", e.target.value)}
                                                            onKeyDown={(e) => handleKeyDown(e, "supplier", index, frozenItems.length)}
                                                            placeholder="Kosong"
                                                            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none"
                                                        />
                                                    </td>
                                                    <td className="py-3 px-5">
                                                        <input
                                                            type="text"
                                                            value={gridRow.notes}
                                                            onChange={(e) => updateGridField("notes", e.target.value)}
                                                            placeholder="Catatan..."
                                                            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none"
                                                        />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    onClick={() => {
                                        // Reset grid inputs
                                        const resetGrid: typeof inputGrid = {};
                                        items.forEach(item => {
                                            if (isFrozenItem(item)) {
                                                resetGrid[item.id] = { quantity: "", pricePerItem: "", supplier: "", notes: "" };
                                            }
                                        });
                                        setInputGrid(resetGrid);
                                        showNotification("success", "Inputan berhasil dibersihkan.");
                                    }}
                                    className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2.5 text-xs font-bold transition shadow-sm cursor-pointer"
                                >
                                    Bersihkan Form
                                </button>
                                <button
                                    onClick={handleSubmitStockIn}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white px-5 py-2.5 text-xs font-black uppercase tracking-wider transition shadow-md shadow-red-600/10 cursor-pointer"
                                >
                                    <Save className="w-4 h-4" /> Simpan Transaksi Stok Masuk
                                </button>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: REPORT STOCK IN (HISTORY & EDIT) */}
                    {activeTab === "history_in" && (
                        <div className="p-6 space-y-4">
                            {/* Filter controls */}
                            <div className="flex flex-col sm:flex-row justify-between gap-3">
                                <div className="flex flex-col sm:flex-row gap-2 w-full sm:max-w-xl">
                                    <div className="relative w-full sm:w-64">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                            <Search className="w-4 h-4" />
                                        </span>
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Cari produk / supplier..."
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-4 text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none transition-all duration-200"
                                        />
                                    </div>

                                    <select
                                        value={supplierFilter}
                                        onChange={(e) => setSupplierFilter(e.target.value)}
                                        className="rounded-xl border border-slate-200 bg-white py-2 px-3 text-xs font-bold text-slate-700 focus:border-red-500 focus:outline-none"
                                    >
                                        <option value="">Semua Supplier</option>
                                        {uniqueSuppliers.map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="text-xs font-bold text-slate-500">
                                    Total Transaksi: <span className="font-black text-slate-800">{filteredStockInHistory.length}</span>
                                </div>
                            </div>

                            {/* Table list */}
                            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 text-slate-600 border-b border-slate-100 text-[10px]">
                                            <th className="py-4 px-5 font-black uppercase tracking-wider">Tanggal</th>
                                            <th className="py-4 px-5 font-black uppercase tracking-wider">Nama Produk Frozen</th>
                                            <th className="py-4 px-5 font-black uppercase tracking-wider text-right">Jumlah Masuk</th>
                                            <th className="py-4 px-5 font-black uppercase tracking-wider text-right">Harga Satuan</th>
                                            <th className="py-4 px-5 font-black uppercase tracking-wider text-right">Total Biaya</th>
                                            <th className="py-4 px-5 font-black uppercase tracking-wider">Supplier (Pemasok)</th>
                                            <th className="py-4 px-5 font-black uppercase tracking-wider">Catatan</th>
                                            <th className="py-4 px-5 font-black uppercase tracking-wider text-center">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-xs">
                                        {filteredStockInHistory.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} className="py-8 text-center text-slate-400 font-bold">Tidak ada riwayat transaksi stok masuk.</td>
                                            </tr>
                                        ) : (
                                            filteredStockInHistory.map((record) => {
                                                const totalCost = record.pricePerItem ? record.quantity * record.pricePerItem : 0;
                                                const itemSatuan = items.find(i => i.id === record.itemId)?.unit || "unit";
                                                return (
                                                    <tr key={record.id} className="hover:bg-slate-50/30 transition">
                                                        <td className="py-3 px-5 text-slate-500 whitespace-nowrap font-medium">{formatDate(record.date)}</td>
                                                        <td className="py-3 px-5 font-black text-slate-800">{record.itemName}</td>
                                                        <td className="py-3 px-5 text-right font-bold text-emerald-600 font-mono">+{record.quantity.toLocaleString("id-ID")} <span className="text-[9px] uppercase text-slate-400">{itemSatuan}</span></td>
                                                        <td className="py-3 px-5 text-right font-bold text-slate-700 font-mono">{record.pricePerItem ? formatRupiah(record.pricePerItem) : "-"}</td>
                                                        <td className="py-3 px-5 text-right font-black text-slate-900 font-mono">{totalCost > 0 ? formatRupiah(totalCost) : "-"}</td>
                                                        <td className="py-3 px-5">
                                                            {record.supplier ? (
                                                                <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 uppercase"><Truck className="w-2.5 h-2.5" /> {record.supplier}</span>
                                                            ) : "-"}
                                                        </td>
                                                        <td className="py-3 px-5 text-slate-500 font-medium max-w-[150px] truncate" title={record.notes}>{record.notes || "-"}</td>
                                                        <td className="py-3 px-5 text-center whitespace-nowrap">
                                                            <div className="flex items-center justify-center gap-1">
                                                                <button
                                                                    onClick={() => handleOpenEditStockIn(record)}
                                                                    className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 shadow-sm cursor-pointer transition"
                                                                    title="Ubah Transaksi Stok Masuk"
                                                                >
                                                                    <Edit className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteStockIn(record)}
                                                                    className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 shadow-sm cursor-pointer transition"
                                                                    title="Hapus Transaksi"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* TAB 4: OPNAME HISTORY */}
                    {activeTab === "history_opname" && (
                        <div className="p-6 space-y-4">
                            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 text-slate-600 border-b border-slate-100 text-[10px]">
                                            <th className="py-4 px-5 font-black uppercase tracking-wider">Waktu Opname</th>
                                            <th className="py-4 px-5 font-black uppercase tracking-wider">Nama Produk Frozen</th>
                                            <th className="py-4 px-5 font-black uppercase tracking-wider text-right">Stok Sebelumnya</th>
                                            <th className="py-4 px-5 font-black uppercase tracking-wider text-right text-indigo-700">Stok Aktual Fisik</th>
                                            <th className="py-4 px-5 font-black uppercase tracking-wider text-right">Selisih (Adjustment)</th>
                                            <th className="py-4 px-5 font-black uppercase tracking-wider">Alasan / Catatan</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-xs">
                                        {stockOpnames.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="py-8 text-center text-slate-400 font-bold">Belum ada riwayat pelaksanaan Stock Opname.</td>
                                            </tr>
                                        ) : (
                                            stockOpnames
                                                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                                .map((record) => {
                                                    const diff = record.actualQuantity - record.previousQuantity;
                                                    const itemSatuan = items.find(i => i.id === record.itemId)?.unit || "unit";
                                                    return (
                                                        <tr key={record.id} className="hover:bg-slate-50/30 transition">
                                                            <td className="py-3.5 px-5 text-slate-500 font-medium whitespace-nowrap">{formatDate(record.date)}</td>
                                                            <td className="py-3.5 px-5 font-black text-slate-800">{record.itemName}</td>
                                                            <td className="py-3.5 px-5 text-right font-bold text-slate-600 font-mono">{record.previousQuantity.toLocaleString("id-ID")} {itemSatuan}</td>
                                                            <td className="py-3.5 px-5 text-right font-black text-indigo-700 font-mono text-sm">{record.actualQuantity.toLocaleString("id-ID")} {itemSatuan}</td>
                                                            <td className="py-3.5 px-5 text-right font-bold font-mono">
                                                                {diff === 0 ? (
                                                                    <span className="text-slate-400">Cocok</span>
                                                                ) : diff > 0 ? (
                                                                    <span className="text-emerald-600">+{diff.toLocaleString("id-ID")} {itemSatuan}</span>
                                                                ) : (
                                                                    <span className="text-red-600">{diff.toLocaleString("id-ID")} {itemSatuan}</span>
                                                                )}
                                                            </td>
                                                            <td className="py-3.5 px-5 text-slate-600 font-medium">{record.notes || "-"}</td>
                                                        </tr>
                                                    );
                                                })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                </div>
            )}

            {/* STOCK OPNAME MODAL */}
            {opnameItem && (
                <div className="fixed inset-0 z-50 bg-[#070b13]/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="text-sm font-black text-slate-900 uppercase flex items-center gap-2">
                                <Scale className="w-5 h-5 text-indigo-600" /> Stock Opname Fisik
                            </h3>
                            <button
                                onClick={() => setOpnameItem(null)}
                                className="text-slate-400 hover:text-slate-600 transition focus:outline-none"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSubmitOpname} className="space-y-4">
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Produk Terpilih</span>
                                <span className="text-sm font-black text-slate-800 block">{opnameItem.name}</span>
                                <span className="text-[10px] text-slate-500 font-bold block uppercase mt-0.5">Satuan: {opnameItem.unit}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-center">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase block">Stok Sistem</span>
                                    <span className="text-base font-black text-slate-700 block mt-1 font-mono">{opnamePrevStock.toLocaleString("id-ID")}</span>
                                </div>
                                <div className="bg-indigo-50 p-3.5 rounded-xl border border-indigo-100 text-center">
                                    <span className="text-[9px] font-extrabold text-indigo-500 uppercase block">Selisih Hitung</span>
                                    <span className="text-base font-black text-indigo-700 block mt-1 font-mono">
                                        {(() => {
                                            const actual = Number(opnameActual);
                                            if (isNaN(actual)) return "-";
                                            const diff = actual - opnamePrevStock;
                                            return diff === 0 ? "0" : diff > 0 ? `+${diff}` : diff;
                                        })()}
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[11px] font-extrabold uppercase text-slate-700 block">Stok Aktual di Gudang</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="any"
                                        value={opnameActual}
                                        onChange={(e) => setOpnameActual(e.target.value)}
                                        required
                                        placeholder="Masukkan stok nyata..."
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm font-black text-slate-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none"
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 uppercase">{opnameItem.unit}</span>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[11px] font-extrabold uppercase text-slate-700 block">Keterangan / Alasan Perubahan</label>
                                <textarea
                                    value={opnameNotes}
                                    onChange={(e) => setOpnameNotes(e.target.value)}
                                    placeholder="Contoh: Barang susut di freezer, selisih timbangan, dll."
                                    rows={2}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none"
                                />
                            </div>

                            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setOpnameItem(null)}
                                    className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2.5 text-xs font-bold transition cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 text-xs font-black uppercase tracking-wider transition shadow-md shadow-indigo-600/10 cursor-pointer"
                                >
                                    Simpan Hasil Opname
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* EDIT STOCK-IN MODAL */}
            {editingStockIn && (
                <div className="fixed inset-0 z-50 bg-[#070b13]/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="text-sm font-black text-slate-900 uppercase flex items-center gap-2">
                                <Edit className="w-5 h-5 text-blue-600" /> Ubah Transaksi Stok Masuk
                            </h3>
                            <button
                                onClick={() => setEditingStockIn(null)}
                                className="text-slate-400 hover:text-slate-600 transition focus:outline-none"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSaveEditStockIn} className="space-y-4">
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Nama Produk Frozen</span>
                                <span className="text-sm font-black text-slate-800 block mt-0.5">{editingStockIn.itemName}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-extrabold uppercase text-slate-700 block">Jumlah Masuk</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={editQty}
                                        onChange={(e) => setEditQty(e.target.value)}
                                        required
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-xs font-black text-slate-900 focus:border-red-500 focus:outline-none"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-extrabold uppercase text-slate-700 block">Harga per Item (Rp)</label>
                                    <input
                                        type="number"
                                        value={editPrice}
                                        onChange={(e) => setEditPrice(e.target.value)}
                                        placeholder="Kosong"
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[11px] font-extrabold uppercase text-slate-700 block">Waktu Transaksi</label>
                                <input
                                    type="datetime-local"
                                    value={editDate}
                                    onChange={(e) => setEditDate(e.target.value)}
                                    required
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-xs font-bold text-slate-800 focus:border-red-500 focus:outline-none"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[11px] font-extrabold uppercase text-slate-700 block">Supplier (Pemasok)</label>
                                <input
                                    type="text"
                                    value={editSupplier}
                                    onChange={(e) => setEditSupplier(e.target.value)}
                                    placeholder="Kosong"
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[11px] font-extrabold uppercase text-slate-700 block">Catatan</label>
                                <textarea
                                    value={editNotes}
                                    onChange={(e) => setEditNotes(e.target.value)}
                                    placeholder="Catatan..."
                                    rows={2}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-800 focus:border-red-500 focus:outline-none"
                                />
                            </div>

                            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setEditingStockIn(null)}
                                    className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2.5 text-xs font-bold transition cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 text-xs font-black uppercase tracking-wider transition shadow-md shadow-blue-600/10 cursor-pointer"
                                >
                                    Simpan Perubahan
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
}
