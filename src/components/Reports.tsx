import React, { useState, useEffect } from "react";
import { Transaction, Customer, CustomerDebtSummary } from "../types";
import { db } from "../utils/db";
import { formatRupiah, formatDate, downloadCSV, downloadXLSX } from "../utils/format";
import ReceiptModal from "./ReceiptModal";
import EditTransactionModal from "./EditTransactionModal";
import {
  BarChart3,
  Search,
  Calendar,
  Filter,
  Copy,
  Download,
  RefreshCw,
  Layers,
  Users,
  TrendingUp,
  AlertTriangle,
  Edit,
  Trash2,
  ChevronDown,
  Printer,
  Scale,
  RotateCcw,
} from "lucide-react";

export default function Reports() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [debtSummaries, setDebtSummaries] = useState<CustomerDebtSummary[]>([]);
  const [showDeleted, setShowDeleted] = useState(false);

  // Selected view: 'all' | 'customer' | 'daily_items'
  const [reportTab, setReportTab] = useState<
    "all" | "customer" | "daily_items"
  >("all");

  // Filters State
  const [filterQuery, setFilterQuery] = useState("");
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [filterMethod, setFilterMethod] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const filteredCustomersForSearch = customers.filter((cust) =>
    cust.name.toLowerCase().includes(filterQuery.toLowerCase())
  );

  // Selected transaction to reprint or edit or delete
  const [reprintTx, setReprintTx] = useState<Transaction | null>(null);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [confirmDeleteTx, setConfirmDeleteTx] = useState<Transaction | null>(null);
  const [penerimaanTx, setPenerimaanTx] = useState<Transaction | null>(null);
  const [editingPenerimaan, setEditingPenerimaan] = useState<Transaction | null>(null);

  useEffect(() => {
    if (penerimaanTx) {
      const copy = JSON.parse(JSON.stringify(penerimaanTx));
      copy.usePenerimaan = true;
      copy.items = copy.items.map((item: any) => {
        const qtyTerima = item.receivedQuantity !== undefined && item.receivedQuantity !== null
          ? item.receivedQuantity
          : item.quantity;
        return {
          ...item,
          receivedQuantity: qtyTerima,
          subtotal: qtyTerima * item.price,
        };
      });
      const newTotal = copy.items.reduce((sum: number, item: any) => sum + item.subtotal, 0);
      copy.totalAmount = newTotal;
      if (copy.remainingDebt > 0 || copy.paymentMethod === "debt") {
        copy.remainingDebt = Math.max(0, newTotal - copy.amountPaid);
      }
      setEditingPenerimaan(copy);
    } else {
      setEditingPenerimaan(null);
    }
  }, [penerimaanTx]);

  const loadData = async () => {
    const [txs, custs, summaries] = await Promise.all([
      db.getTransactions(),
      db.getCustomers(),
      db.getCustomerDebtSummaries(),
    ]);
    setTransactions(txs);
    setCustomers(custs);
    setDebtSummaries(summaries);
  };

  const handleDeleteTx = async (txId: string) => {
    try {
      await db.deleteTransaction(txId);
      loadData();
      setConfirmDeleteTx(null);
    } catch (e) {
      alert("Gagal menghapus transaksi.");
    }
  };

  const handleRestoreTx = async (txId: string) => {
    try {
      await db.restoreTransaction(txId);
      loadData();
    } catch (e) {
      alert("Gagal memulihkan transaksi.");
    }
  };

  const handleSavePenerimaan = async () => {
    if (!editingPenerimaan) return;
    try {
      await db.editTransaction(editingPenerimaan);
      setPenerimaanTx(null);
      setEditingPenerimaan(null);
      loadData();
    } catch (e) {
      alert("Gagal menyimpan perubahan penerimaan.");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    loadData();
  };

  // Filter logic for general sales report
  const filteredTransactions = transactions
    .filter((tx) => {
      // Soft deletion status filter
      const matchesDeletedStatus = showDeleted ? tx.isDeleted === true : !tx.isDeleted;

      // Search query filter (customer name or invoice number)
      const matchesQuery =
        tx.customerName.toLowerCase().includes(filterQuery.toLowerCase()) ||
        tx.invoiceNumber.toLowerCase().includes(filterQuery.toLowerCase());

      // Payment method filter
      const matchesMethod =
        filterMethod === "all" || tx.paymentMethod === filterMethod;

      // Date range filter
      let matchesDate = true;
      const txTime = new Date(tx.date).getTime();
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        matchesDate = matchesDate && txTime >= start.getTime();
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchesDate = matchesDate && txTime <= end.getTime();
      }

      return matchesDeletedStatus && matchesQuery && matchesMethod && matchesDate;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Sort newest first

  // Financial aggregates calculated from filtered list
  const totalSalesVal = filteredTransactions.reduce(
    (sum, tx) => sum + tx.totalAmount,
    0,
  );
  const totalPaidVal = filteredTransactions.reduce(
    (sum, tx) => sum + tx.amountPaid,
    0,
  );
  const totalDebtVal = filteredTransactions.reduce(
    (sum, tx) => sum + tx.remainingDebt,
    0,
  );
  const salesCount = filteredTransactions.length;

  // Filter logic for customer reports
  const filteredCustomerReports = debtSummaries
    .map((summary) => {
      const custTxs = transactions.filter(
        (t) => t.customerId === summary.customerId && !t.isDeleted,
      );
      const totalTransactions = custTxs.length;
      const totalSpent = custTxs.reduce((sum, t) => sum + t.totalAmount, 0);

      const qtyKirimMap = new Map<string, number>();
      const qtyTerimaMap = new Map<string, number>();

      custTxs.forEach((t) => {
        t.items.forEach((item) => {
          const qtyKirim = item.quantity;
          const qtyTerima =
            item.receivedQuantity !== undefined && item.receivedQuantity !== null
              ? item.receivedQuantity
              : item.quantity;
          const unit = item.unit || "Kg";

          qtyKirimMap.set(unit, (qtyKirimMap.get(unit) || 0) + qtyKirim);
          qtyTerimaMap.set(unit, (qtyTerimaMap.get(unit) || 0) + qtyTerima);
        });
      });

      const qtyKirimStr = Array.from(qtyKirimMap.entries())
        .map(([unit, qty]) => `${qty.toFixed(2)} ${unit}`)
        .join(", ") || "-";

      const qtyTerimaStr = Array.from(qtyTerimaMap.entries())
        .map(([unit, qty]) => `${qty.toFixed(2)} ${unit}`)
        .join(", ") || "-";

      return {
        ...summary,
        totalTransactions,
        totalSpent,
        qtyKirimStr,
        qtyTerimaStr,
      };
    })
    .filter((report) =>
      report.customerName.toLowerCase().includes(filterQuery.toLowerCase()),
    );

  // Compute Daily Item Sales based on filteredTransactions
  const dailyItemSales = (() => {
    const dailyMap = new Map<
      string,
      Map<
        string,
        {
          qtyKirim: number;
          qtyTerima: number;
          susut: number;
          unit: string;
          totalAmount: number;
        }
      >
    >();

    filteredTransactions.forEach((tx) => {
      // Extract date string YYYY-MM-DD for grouping
      const dateStr = new Date(tx.date).toISOString().split("T")[0];

      if (!dailyMap.has(dateStr)) {
        dailyMap.set(dateStr, new Map());
      }

      const itemMap = dailyMap.get(dateStr)!;

      tx.items.forEach((item) => {
        const qtyKirim = item.quantity;
        const qtyTerima =
          item.receivedQuantity !== undefined && item.receivedQuantity !== null
            ? item.receivedQuantity
            : item.quantity;
        const susut = Math.max(0, qtyKirim - qtyTerima);

        if (!itemMap.has(item.name)) {
          itemMap.set(item.name, {
            qtyKirim: 0,
            qtyTerima: 0,
            susut: 0,
            unit: item.unit,
            totalAmount: 0,
          });
        }
        const current = itemMap.get(item.name)!;
        current.qtyKirim += qtyKirim;
        current.qtyTerima += qtyTerima;
        current.susut += susut;
        current.totalAmount += item.subtotal;
      });
    });

    const result: {
      date: string;
      items: {
        name: string;
        qtyKirim: number;
        qtyTerima: number;
        susut: number;
        unit: string;
        totalAmount: number;
      }[];
    }[] = [];

    dailyMap.forEach((itemMap, date) => {
      const items = Array.from(itemMap.entries())
        .map(([name, data]) => ({
          name,
          qtyKirim: data.qtyKirim,
          qtyTerima: data.qtyTerima,
          susut: data.susut,
          unit: data.unit,
          totalAmount: data.totalAmount,
        }))
        .sort((a, b) => b.totalAmount - a.totalAmount);
      result.push({ date, items });
    });

    // Sort descending by date
    return result.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  })();

  // Download All Sales Report XLSX
  const handleDownloadAllReportXLSX = () => {
    const headers = [
      "No. Nota",
      "Tanggal",
      "Nama Pelanggan",
      "Total Belanja (Rp)",
      "Transfer (Rp)",
      "Cash / Tunai (Rp)",
      "Utang (Rp)",
      "Jumlah Cetak",
      "Catatan",
    ];

    const rows = filteredTransactions.map((tx) => {
      let trfVal = 0;
      let cashVal = 0;
      let debtVal = tx.remainingDebt || 0;

      if (tx.paymentMethod === "cash") {
        cashVal = tx.amountPaid;
      } else if (tx.paymentMethod === "transfer") {
        trfVal = tx.amountPaid;
      } else if (tx.paymentMethod === "mix") {
        cashVal = tx.cashAmount || 0;
        trfVal = tx.transferAmount || 0;
      } else if (tx.paymentMethod === "debt") {
        if (tx.cashAmount !== undefined || tx.transferAmount !== undefined) {
          cashVal = tx.cashAmount || 0;
          trfVal = tx.transferAmount || 0;
        } else {
          cashVal = tx.amountPaid || 0;
        }
      }

      return [
        tx.invoiceNumber,
        formatDate(tx.date),
        tx.customerName,
        tx.totalAmount.toString(),
        trfVal.toString(),
        cashVal.toString(),
        debtVal.toString(),
        tx.printCount.toString(),
        tx.notes || "",
      ];
    });

    downloadXLSX(
      headers,
      rows,
      `Laporan_Penjualan_DPJ_Berkah_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  // Download Customer Report XLSX
  const handleDownloadCustomerReportXLSX = () => {
    const headers = [
      "ID Pelanggan",
      "Nama Pelanggan",
      "Total Pembelian (Rp)",
      "Total Terbayar (Rp)",
      "Sisa Utang (Rp)",
      "Jumlah Transaksi",
      "Qty Kirim",
      "Qty Terima",
      "Aktivitas Terakhir",
    ];

    const rows = filteredCustomerReports.map((report) => [
      report.customerId,
      report.customerName,
      report.totalSpent.toString(),
      report.totalPaid.toString(),
      report.remainingDebt.toString(),
      report.totalTransactions.toString(),
      report.qtyKirimStr,
      report.qtyTerimaStr,
      formatDate(report.lastActive),
    ]);

    downloadXLSX(
      headers,
      rows,
      `Laporan_Pelanggan_DPJ_Berkah_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  // Download Daily Items Report XLSX
  const handleDownloadDailyItemsXLSX = () => {
    const headers = [
      "Tanggal",
      "Nama Item",
      "Qty Kirim",
      "Qty Terima",
      "Susut",
      "Satuan",
      "Total Nilai (Rp)",
    ];
    const rows: string[][] = [];

    dailyItemSales.forEach((day) => {
      const dateFormatted = formatDate(day.date, false);
      day.items.forEach((item) => {
        rows.push([
          dateFormatted,
          item.name,
          item.qtyKirim.toString(),
          item.qtyTerima.toString(),
          item.susut.toString(),
          item.unit,
          item.totalAmount.toString(),
        ]);
      });
    });

    downloadXLSX(
      headers,
      rows,
      `Laporan_Item_Harian_DPJ_Berkah_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 tracking-tight uppercase">
            Laporan Penjualan & Kinerja
          </h2>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Pantau statistik keuangan, omset, dan piutang pelanggan
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="inline-flex rounded-xl bg-slate-100 p-1 self-start flex-wrap">
          <button
            id="tab-all-sales-btn"
            onClick={() => {
              setReportTab("all");
              setFilterQuery("");
            }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition duration-150 cursor-pointer ${reportTab === "all"
                ? "bg-red-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
              }`}
          >
            <Layers className="w-3.5 h-3.5" /> Riwayat Transaksi All / Detail
          </button>
          <button
            id="tab-cust-sales-btn"
            onClick={() => {
              setReportTab("customer");
              setFilterQuery("");
            }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition duration-150 cursor-pointer ${reportTab === "customer"
                ? "bg-red-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
              }`}
          >
            <Users className="w-3.5 h-3.5" /> Laporan per Pelanggan
          </button>
          <button
            id="tab-daily-items-btn"
            onClick={() => {
              setReportTab("daily_items");
              setFilterQuery("");
            }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition duration-150 cursor-pointer ${reportTab === "daily_items"
                ? "bg-red-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
              }`}
          >
            <BarChart3 className="w-3.5 h-3.5" /> Laporan Item Harian
          </button>
        </div>
      </div>

      {/* 1. AGGREGATE SUMMARY CARDS (Visible for both tabs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/50 p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[120px]">
          <div>
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
              Total Omset Penjualan
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <h3 className="text-xl font-black text-slate-950 font-mono">
                {formatRupiah(totalSalesVal)}
              </h3>
            </div>
          </div>
          <div className="text-[10px] text-emerald-600 mt-2 flex items-center justify-start gap-1 font-bold w-full">
            <TrendingUp className="w-3.5 h-3.5 shrink-0" /> Total nilai seluruh transaksi
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/50 p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[120px]">
          <div>
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
              Kas Diterima (Real Terbayar)
            </span>
            <h3 className="text-xl font-black text-emerald-600 mt-1 font-mono">
              {formatRupiah(totalPaidVal)}
            </h3>
          </div>
          <div className="text-[10px] text-slate-500 font-semibold mt-2 text-left w-full justify-start">
            Dana masuk cash & transfer
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/50 p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[120px]">
          <div>
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
              Piutang Mengambang
            </span>
            <h3 className="text-xl font-black text-red-600 mt-1 font-mono">
              {formatRupiah(totalDebtVal)}
            </h3>
          </div>
          <div className="text-[10px] text-red-500 mt-2 flex items-center justify-start gap-1 font-bold w-full">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Sisa tagihan utang tempo
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/50 p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[120px]">
          <div>
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
              Volume Transaksi
            </span>
            <h3 className="text-xl font-black text-slate-950 mt-1 font-mono">
              {salesCount} Nota
            </h3>
          </div>
          <div className="text-[10px] text-slate-500 font-semibold mt-2 text-left w-full justify-start">
            Penjualan berhasil tercatat
          </div>
        </div>
      </div>

      {/* FILTERS & SEARCH */}
      <div className="bg-white rounded-2xl border border-slate-200/50 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-50 pb-2 flex-wrap gap-2">
          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-red-600" /> Filter & Filter Pencarian
          </h4>

          {reportTab === "all" && (
            <div className="inline-flex rounded-xl bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setShowDeleted(false)}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase transition cursor-pointer ${!showDeleted
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-slate-600 hover:text-slate-950"
                  }`}
              >
                Transaksi Aktif
              </button>
              <button
                type="button"
                onClick={() => setShowDeleted(true)}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase transition flex items-center gap-1 cursor-pointer ${showDeleted
                    ? "bg-red-50 text-red-700 shadow-sm"
                    : "text-slate-600 hover:text-red-700"
                  }`}
              >
                <Trash2 className="w-3.5 h-3.5" /> Sampah / Terhapus
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          {/* Query search (invoice or customer) */}
          <div className="md:col-span-3 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
            <input
              id="report-search-input"
              type="text"
              placeholder={
                reportTab === "all"
                  ? "Cari nomor nota atau nama pelanggan..."
                  : "Cari nama pelanggan..."
              }
              value={filterQuery}
              onChange={(e) => {
                setFilterQuery(e.target.value);
                setIsSearchDropdownOpen(true);
              }}
              onFocus={() => setIsSearchDropdownOpen(true)}
              onBlur={() => {
                setTimeout(() => setIsSearchDropdownOpen(false), 150);
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-9 pr-8 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none transition-all duration-200"
            />
            <button
              type="button"
              onClick={() => setIsSearchDropdownOpen(!isSearchDropdownOpen)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
            >
              <ChevronDown className="w-4 h-4" />
            </button>

            {isSearchDropdownOpen && (
              <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg z-50">
                {filteredCustomersForSearch.length > 0 ? (
                  filteredCustomersForSearch.map((cust) => (
                    <button
                      key={cust.id}
                      type="button"
                      onMouseDown={() => {
                        setFilterQuery(cust.name);
                        setIsSearchDropdownOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
                    >
                      {cust.name} {cust.phone ? `(${cust.phone})` : ""}
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-2 text-xs text-slate-400 font-bold">
                    Tidak ada pelanggan cocok
                  </div>
                )}
                {filterQuery && (
                  <button
                    type="button"
                    onMouseDown={() => {
                      setFilterQuery("");
                      setIsSearchDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 text-xs font-black text-red-600 border-t border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    Reset Pencarian
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Payment Method Filter (only for 'all' tab) */}
          <div className="md:col-span-2">
            <select
              id="report-payment-method-select"
              disabled={reportTab === "customer"}
              value={filterMethod}
              onChange={(e) => setFilterMethod(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none disabled:opacity-50 transition-all duration-200"
            >
              <option value="all">Semua Metode</option>
              <option value="cash">Cash (Tunai)</option>
              <option value="transfer">Transfer Bank</option>
              <option value="mix">Campuran (Mix)</option>
              <option value="debt">Utang (Tempo)</option>
            </select>
          </div>

          {/* Date range inputs */}
          <div className="md:col-span-4 flex items-center gap-2">
            <div className="relative flex-1">
              <input
                id="report-start-date"
                type="date"
                disabled={reportTab === "customer"}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 px-2.5 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none disabled:opacity-50 transition-all duration-200"
              />
            </div>
            <span className="text-slate-400 text-xs font-bold">s/d</span>
            <div className="relative flex-1">
              <input
                id="report-end-date"
                type="date"
                disabled={reportTab === "customer"}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 px-2.5 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none disabled:opacity-50 transition-all duration-200"
              />
            </div>
          </div>

          {/* Download & Refresh Action Buttons */}
          <div className="md:col-span-3 flex gap-2">
            <button
              onClick={handleRefresh}
              className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-sm transition-all duration-200 cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              id="download-xlsx-btn"
              onClick={
                reportTab === "all"
                  ? handleDownloadAllReportXLSX
                  : reportTab === "customer"
                    ? handleDownloadCustomerReportXLSX
                    : handleDownloadDailyItemsXLSX
              }
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white font-bold text-xs py-2.5 px-3 shadow-md shadow-red-600/10 transition-all duration-200 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" /> Download XLSX
            </button>
          </div>
        </div>
      </div>

      {/* 2. MAIN TABLE DISPLAY AREA */}
      <div className="bg-white rounded-2xl border border-slate-200/50 shadow-sm overflow-hidden">
        {reportTab === "all" ? (
          /* TAB 1: ALL TRANSACTION DETAILS */
          filteredTransactions.length === 0 ? (
            <div className="p-16 text-center text-slate-400 text-xs font-semibold">
              Tidak ada data transaksi penjualan yang memenuhi filter pencarian
              Anda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-400">
                    <th className="py-4 px-5 font-bold uppercase tracking-wider text-[10px]">
                      No. Nota
                    </th>
                    <th className="py-4 px-5 font-bold uppercase tracking-wider text-[10px]">
                      Tanggal
                    </th>
                    <th className="py-4 px-5 font-bold uppercase tracking-wider text-[10px]">
                      Pelanggan
                    </th>
                    <th className="py-4 px-5 font-bold uppercase tracking-wider text-[10px]">
                      Detail Item
                    </th>
                    <th className="py-4 px-5 font-bold uppercase tracking-wider text-[10px] text-right">
                      Total Belanja
                    </th>
                    <th className="py-4 px-5 font-bold uppercase tracking-wider text-[10px] text-right text-indigo-700">
                      Transfer
                    </th>
                    <th className="py-4 px-5 font-bold uppercase tracking-wider text-[10px] text-right text-emerald-700">
                      Cash / Tunai
                    </th>
                    <th className="py-4 px-5 font-bold uppercase tracking-wider text-[10px] text-right text-red-600">
                      Utang
                    </th>
                    <th className="py-4 px-5 font-bold uppercase tracking-wider text-[10px] text-center">
                      Cetak
                    </th>
                    <th className="py-4 px-5 font-bold uppercase tracking-wider text-[10px] text-right">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTransactions.map((tx) => {
                    let trfVal = 0;
                    let cashVal = 0;
                    let debtVal = tx.remainingDebt || 0;

                    if (tx.paymentMethod === "cash") {
                      cashVal = tx.amountPaid;
                    } else if (tx.paymentMethod === "transfer") {
                      trfVal = tx.amountPaid;
                    } else if (tx.paymentMethod === "mix") {
                      cashVal = tx.cashAmount || 0;
                      trfVal = tx.transferAmount || 0;
                    } else if (tx.paymentMethod === "debt") {
                      if (tx.cashAmount !== undefined || tx.transferAmount !== undefined) {
                        cashVal = tx.cashAmount || 0;
                        trfVal = tx.transferAmount || 0;
                      } else {
                        cashVal = tx.amountPaid || 0;
                      }
                    }

                    return (
                      <tr
                        key={tx.id}
                        className="hover:bg-slate-50/30 transition-all duration-150"
                      >
                        <td className="py-3.5 px-5 font-black text-slate-900 font-mono">
                          <div className="flex items-center gap-1.5">
                            <span>{tx.invoiceNumber}</span>
                            {tx.isDeleted && (
                              <span className="inline-flex items-center rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-red-700 tracking-wider">
                                Terhapus
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-5 text-slate-500 whitespace-nowrap font-medium">
                          {formatDate(tx.date, true)}
                        </td>
                        <td className="py-3.5 px-5 font-bold text-slate-800">
                          {tx.customerName}
                        </td>
                        <td className="py-3.5 px-5 text-slate-600 font-semibold max-w-[280px]">
                          {tx.usePenerimaan ? (
                            <div className="space-y-1">
                              {tx.items.map((item) => {
                                const qtyTerima =
                                  item.receivedQuantity !== undefined &&
                                    item.receivedQuantity !== null
                                    ? item.receivedQuantity
                                    : item.quantity;
                                const susut = Math.max(0, item.quantity - qtyTerima);
                                return (
                                  <div
                                    key={item.itemId}
                                    className="text-[10px] leading-tight border-b border-slate-100/50 pb-0.5 last:border-0"
                                  >
                                    <div className="font-bold text-slate-800">
                                      {item.name}
                                    </div>
                                    <div className="text-[9px] text-slate-500 flex flex-wrap gap-x-1 font-mono">
                                      <span>
                                        Kirim: {item.quantity} {item.unit}
                                      </span>
                                      <span>|</span>
                                      <span className="text-emerald-700 font-bold">
                                        Terima: {qtyTerima} {item.unit}
                                      </span>
                                      {susut > 0 && (
                                        <>
                                          <span>|</span>
                                          <span className="text-red-600 font-bold">
                                            Susut: {susut.toFixed(2)} {item.unit}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div
                              className="truncate max-w-[200px]"
                              title={tx.items
                                .map(
                                  (item) =>
                                    `${item.name} (${item.quantity}${item.unit})`,
                                )
                                .join(", ")}
                            >
                              {tx.items
                                .map(
                                  (item) =>
                                    `${item.name} (${item.quantity}${item.unit})`,
                                )
                                .join(", ")}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-right font-bold text-slate-900 font-mono">
                          {formatRupiah(tx.totalAmount)}
                        </td>
                        <td className="py-3.5 px-5 text-right font-bold text-indigo-600 font-mono">
                          {trfVal > 0 ? formatRupiah(trfVal) : "-"}
                        </td>
                        <td className="py-3.5 px-5 text-right font-bold text-emerald-600 font-mono">
                          {cashVal > 0 ? formatRupiah(cashVal) : "-"}
                        </td>
                        <td className="py-3.5 px-5 text-right font-bold text-red-600 font-mono">
                          {debtVal > 0 ? formatRupiah(debtVal) : "-"}
                        </td>
                        <td className="py-3.5 px-5 text-center">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${tx.printCount >= 1
                                ? "bg-red-50 text-red-700 font-black"
                                : "bg-slate-100 text-slate-500"
                              }`}
                            title={
                              tx.printCount >= 1
                                ? `Sudah dicetak ${tx.printCount} kali`
                                : "Belum dicetak"
                            }
                          >
                            {tx.printCount}x {tx.printCount >= 1 && "📋"}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-right whitespace-nowrap">
                          <div className="flex justify-end gap-1 font-sans">
                            {tx.isDeleted ? (
                              <button
                                onClick={() => handleRestoreTx(tx.id)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 shadow-sm transition cursor-pointer"
                                title="Pulihkan Transaksi"
                              >
                                <RotateCcw className="w-3.5 h-3.5" /> Pulihkan
                              </button>
                            ) : (
                              <>
                                <button
                                  id={`penerimaan-tx-btn-${tx.id}`}
                                  onClick={() => setPenerimaanTx(tx)}
                                  className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border shadow-sm transition cursor-pointer ${tx.usePenerimaan
                                      ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                    }`}
                                  title={tx.usePenerimaan ? "Hitung Susut: Ya" : "Atur Penerimaan & Hitung Susut"}
                                >
                                  <Scale className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  id={`reprint-receipt-btn-${tx.id}`}
                                  onClick={() => setReprintTx(tx)}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm transition cursor-pointer"
                                  title="Cetak Ulang Struk"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  id={`edit-tx-btn-${tx.id}`}
                                  onClick={() => setEditTx(tx)}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 shadow-sm transition cursor-pointer"
                                  title="Edit Transaksi"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  id={`delete-tx-btn-${tx.id}`}
                                  onClick={() => setConfirmDeleteTx(tx)}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 shadow-sm transition cursor-pointer"
                                  title="Hapus Transaksi"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : reportTab === "customer" ? (
          /* TAB 2: SALES PER CUSTOMER REPORT */
          filteredCustomerReports.length === 0 ? (
            <div className="p-16 text-center text-slate-400 text-xs font-semibold">
              Tidak ada data laporan pelanggan terdaftar yang cocok dengan
              pencarian Anda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-400">
                    <th className="py-4 px-6 font-bold uppercase tracking-wider text-[10px]">
                      Nama Pelanggan
                    </th>
                    <th className="py-4 px-6 font-bold uppercase tracking-wider text-[10px] text-center">
                      Jumlah Transaksi
                    </th>
                    <th className="py-4 px-6 font-bold uppercase tracking-wider text-[10px] text-right">
                      Qty Kirim
                    </th>
                    <th className="py-4 px-6 font-bold uppercase tracking-wider text-[10px] text-right">
                      Qty Terima
                    </th>
                    <th className="py-4 px-6 font-bold uppercase tracking-wider text-[10px] text-right">
                      Total Akumulasi Pembelian
                    </th>
                    <th className="py-4 px-6 font-bold uppercase tracking-wider text-[10px] text-right">
                      Total Sudah Dibayar
                    </th>
                    <th className="py-4 px-6 font-bold uppercase tracking-wider text-[10px] text-right">
                      Sisa Tunggakan Utang
                    </th>
                    <th className="py-4 px-6 font-bold uppercase tracking-wider text-[10px]">
                      Aktivitas Terakhir
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCustomerReports.map((report) => (
                    <tr
                      key={report.customerId}
                      className="hover:bg-slate-50/30 transition-all duration-150"
                    >
                      <td className="py-3.5 px-6 font-bold text-slate-900">
                        {report.customerName}
                      </td>
                      <td className="py-3.5 px-6 text-center font-bold text-slate-500">
                        {report.totalTransactions} Transaksi
                      </td>
                      <td className="py-3.5 px-6 text-right font-bold text-slate-700 font-mono whitespace-nowrap">
                        {report.qtyKirimStr}
                      </td>
                      <td className="py-3.5 px-6 text-right font-bold text-emerald-700 font-mono whitespace-nowrap">
                        {report.qtyTerimaStr}
                      </td>
                      <td className="py-3.5 px-6 text-right font-bold text-slate-900 font-mono">
                        {formatRupiah(report.totalSpent)}
                      </td>
                      <td className="py-3.5 px-6 text-right font-bold text-emerald-600 font-mono">
                        {formatRupiah(report.totalPaid)}
                      </td>
                      <td className="py-3.5 px-6 text-right font-black text-red-600 font-mono">
                        {report.remainingDebt > 0
                          ? formatRupiah(report.remainingDebt)
                          : "Lunas (Rp. 0)"}
                      </td>
                      <td className="py-3.5 px-6 text-slate-500 font-semibold whitespace-nowrap">
                        {report.lastActive
                          ? formatDate(report.lastActive, false)
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : /* TAB 3: DAILY ITEMS REPORT */
          dailyItemSales.length === 0 ? (
            <div className="p-16 text-center text-slate-400 text-xs font-semibold">
              Tidak ada data penjualan item pada rentang waktu ini.
            </div>
          ) : (
            <div className="overflow-x-auto p-4 space-y-6">
              {dailyItemSales.map((day) => (
                <div
                  key={day.date}
                  className="border border-slate-200 rounded-xl overflow-hidden"
                >
                  <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 font-bold text-slate-800 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-red-600" />
                    {formatDate(day.date, false)}
                  </div>
                  <table className="w-full text-left border-collapse text-xs bg-white">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400">
                        <th className="py-3 px-5 font-bold uppercase tracking-wider text-[10px]">
                          Nama Item
                        </th>
                        <th className="py-3 px-5 font-bold uppercase tracking-wider text-[10px] text-right">
                          Qty Kirim
                        </th>
                        <th className="py-3 px-5 font-bold uppercase tracking-wider text-[10px] text-right">
                          Qty Terima
                        </th>
                        <th className="py-3 px-5 font-bold uppercase tracking-wider text-[10px] text-right text-red-500">
                          Susut
                        </th>
                        <th className="py-3 px-5 font-bold uppercase tracking-wider text-[10px] text-right">
                          Total Nilai
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {day.items.map((item, idx) => (
                        <tr
                          key={`${day.date}-${idx}`}
                          className="hover:bg-slate-50/50 transition-all"
                        >
                          <td className="py-2.5 px-5 font-semibold text-slate-800">
                            {item.name}
                          </td>
                          <td className="py-2.5 px-5 text-right font-bold text-slate-700 font-mono">
                            {item.qtyKirim.toFixed(2)}{" "}
                            <span className="text-slate-400 font-medium text-[9px]">
                              {item.unit}
                            </span>
                          </td>
                          <td className="py-2.5 px-5 text-right font-bold text-emerald-700 font-mono">
                            {item.qtyTerima.toFixed(2)}{" "}
                            <span className="text-emerald-400 font-medium text-[9px]">
                              {item.unit}
                            </span>
                          </td>
                          <td className="py-2.5 px-5 text-right font-bold text-red-600 font-mono">
                            {item.susut > 0 ? (
                              <>
                                {item.susut.toFixed(2)}{" "}
                                <span className="text-red-400 font-medium text-[9px]">
                                  {item.unit}
                                </span>
                              </>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="py-2.5 px-5 text-right font-bold text-emerald-600 font-mono">
                            {formatRupiah(item.totalAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* ACTIVE REPRINT MODAL POPUP */}
      {reprintTx && (
        <ReceiptModal
          transaction={reprintTx}
          onClose={() => setReprintTx(null)}
          onPrintSuccess={loadData} // Trigger reloading data to update printCount indicators instantly
        />
      )}

      {/* EDIT TRANSACTION MODAL */}
      {editTx && (
        <EditTransactionModal
          transaction={editTx}
          onClose={() => setEditTx(null)}
          onSaveSuccess={() => {
            setEditTx(null);
            loadData();
          }}
        />
      )}

      {/* CONFIRM DELETE MODAL */}
      {confirmDeleteTx && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="flex min-h-full items-center justify-center">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border-t-4 border-red-500 animate-in zoom-in-95 duration-150 my-8">
              <h4 className="font-black text-slate-900 text-sm mb-2 tracking-tight uppercase">
                Hapus Transaksi Penjualan?
              </h4>
              <p className="text-xs text-slate-500 mb-4 font-medium leading-relaxed">
                Apakah Anda yakin ingin menghapus transaksi <span className="font-bold text-slate-800 font-mono">{confirmDeleteTx.invoiceNumber}</span> ({confirmDeleteTx.customerName}) senilai <span className="font-bold text-slate-800 font-mono">{formatRupiah(confirmDeleteTx.totalAmount)}</span>?
                <br />
                <span className="text-red-500 font-bold mt-1 block">Tindakan ini permanen dan akan menghapus semua sisa piutang atau cicilan terkait.</span>
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmDeleteTx(null)}
                  className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 text-xs font-bold transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  id="confirm-delete-tx-btn"
                  onClick={() => handleDeleteTx(confirmDeleteTx.id)}
                  className="rounded-xl bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-xs font-bold shadow-md shadow-red-600/10 transition cursor-pointer"
                >
                  Hapus
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PENERIMAAN / SUSUT MODAL */}
      {penerimaanTx && editingPenerimaan && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="flex min-h-full items-center justify-center">
            <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border-t-4 border-emerald-500 animate-in zoom-in-95 duration-150 my-8">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-black text-slate-900 text-sm tracking-tight uppercase flex items-center gap-2">
                  ⚖️ Atur Penerimaan & Hitung Susut
                </h4>
                <span className="font-mono text-xs font-bold bg-slate-100 px-2.5 py-1 rounded-lg text-slate-600">
                  {penerimaanTx.invoiceNumber}
                </span>
              </div>

              <div className="mb-4 bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span>Pelanggan:</span>
                  <span className="font-bold text-slate-800">{penerimaanTx.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tanggal Nota:</span>
                  <span>{formatDate(penerimaanTx.date, true)}</span>
                </div>
              </div>

              {/* LIST OF ITEMS TO ADJUST */}
              <div className="space-y-3 mb-4 max-h-[250px] overflow-y-auto pr-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                  Detail Item Timbangan Terima
                </div>
                {editingPenerimaan.items.map((item, index) => {
                  const qtyKirim = item.quantity;
                  const qtyTerima = item.receivedQuantity !== undefined ? item.receivedQuantity : qtyKirim;
                  const susut = Math.max(0, qtyKirim - qtyTerima);
                  return (
                    <div
                      key={item.itemId}
                      className="p-3 bg-white border border-slate-100 rounded-xl flex items-center justify-between gap-4 shadow-sm"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-800 truncate">
                          {item.name}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 font-semibold">
                          Harga Satuan: {formatRupiah(item.price)}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block font-semibold">
                            Qty Kirim
                          </span>
                          <span className="text-xs font-bold text-slate-600 font-mono">
                            {qtyKirim} {item.unit}
                          </span>
                        </div>

                        <div className="text-right">
                          <label className="text-[10px] text-slate-500 block font-bold">
                            Qty Terima
                          </label>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <input
                              type="number"
                              step="any"
                              id={`penerimaan-qty-input-${index}`}
                              value={qtyTerima === 0 ? "" : qtyTerima}
                              placeholder="0"
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                const updatedItems = editingPenerimaan.items.map((it) => {
                                  if (it.itemId === item.itemId) {
                                    return {
                                      ...it,
                                      receivedQuantity: val,
                                      subtotal: val * it.price,
                                    };
                                  }
                                  return it;
                                });
                                const newTotal = updatedItems.reduce((sum, it) => sum + it.subtotal, 0);
                                const updated = {
                                  ...editingPenerimaan,
                                  items: updatedItems,
                                  totalAmount: newTotal,
                                };
                                if (updated.remainingDebt > 0 || updated.paymentMethod === "debt") {
                                  updated.remainingDebt = Math.max(0, newTotal - updated.amountPaid);
                                }
                                setEditingPenerimaan(updated);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "ArrowDown" || e.key === "Enter") {
                                  e.preventDefault();
                                  const nextInput = document.getElementById(`penerimaan-qty-input-${index + 1}`);
                                  if (nextInput) {
                                    (nextInput as HTMLInputElement).focus();
                                    (nextInput as HTMLInputElement).select();
                                  }
                                } else if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  const prevInput = document.getElementById(`penerimaan-qty-input-${index - 1}`);
                                  if (prevInput) {
                                    (prevInput as HTMLInputElement).focus();
                                    (prevInput as HTMLInputElement).select();
                                  }
                                }
                              }}
                              className="w-20 text-right rounded-lg border border-slate-200 py-1 px-2 font-mono font-bold text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <span className="text-[10px] text-slate-500 font-semibold">{item.unit}</span>
                          </div>
                        </div>

                        <div className="text-right w-16">
                          <span className="text-[10px] text-red-400 block font-semibold">
                            Susut
                          </span>
                          <span className="text-xs font-bold text-red-600 font-mono">
                            {susut.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* PRICING REVIEW SUMMARY */}
              <div className="mt-4 p-4 bg-slate-50 rounded-xl space-y-2 border border-slate-100 text-xs">
                <div className="flex justify-between text-slate-500 font-medium">
                  <span>Total Belanja Semula:</span>
                  <span className="font-mono">{formatRupiah(penerimaanTx.totalAmount)}</span>
                </div>
                <div className="flex justify-between font-black text-slate-800 text-sm">
                  <span>Total Setelah Penerimaan:</span>
                  <span className="font-mono text-emerald-600">{formatRupiah(editingPenerimaan.totalAmount)}</span>
                </div>
                {editingPenerimaan.paymentMethod === "debt" && (
                  <div className="flex justify-between text-red-600 font-bold border-t border-slate-200/65 pt-1.5">
                    <span>Piutang / Sisa Utang Baru:</span>
                    <span className="font-mono">{formatRupiah(editingPenerimaan.remainingDebt)}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setPenerimaanTx(null)}
                  className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 text-xs font-bold transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  id="save-penerimaan-tx-btn"
                  onClick={handleSavePenerimaan}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold shadow-md shadow-emerald-600/10 transition cursor-pointer"
                >
                  Simpan Penerimaan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
