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
} from "lucide-react";

export default function Reports() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [debtSummaries, setDebtSummaries] = useState<CustomerDebtSummary[]>([]);

  // Selected view: 'all' | 'customer' | 'daily_items'
  const [reportTab, setReportTab] = useState<
    "all" | "customer" | "daily_items"
  >("all");

  // Filters State
  const [filterQuery, setFilterQuery] = useState("");
  const [filterMethod, setFilterMethod] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Selected transaction to reprint or edit or delete
  const [reprintTx, setReprintTx] = useState<Transaction | null>(null);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [confirmDeleteTx, setConfirmDeleteTx] = useState<Transaction | null>(null);

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

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    loadData();
  };

  // Filter logic for general sales report
  const filteredTransactions = transactions
    .filter((tx) => {
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

      return matchesQuery && matchesMethod && matchesDate;
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
        (t) => t.customerId === summary.customerId,
      );
      const totalTransactions = custTxs.length;
      const totalSpent = custTxs.reduce((sum, t) => sum + t.totalAmount, 0);

      return {
        ...summary,
        totalTransactions,
        totalSpent,
      };
    })
    .filter((report) =>
      report.customerName.toLowerCase().includes(filterQuery.toLowerCase()),
    );

  // Compute Daily Item Sales based on filteredTransactions
  const dailyItemSales = (() => {
    const dailyMap = new Map<
      string,
      Map<string, { quantity: number; unit: string; totalAmount: number }>
    >();

    filteredTransactions.forEach((tx) => {
      // Extract date string YYYY-MM-DD for grouping
      const dateStr = new Date(tx.date).toISOString().split("T")[0];

      if (!dailyMap.has(dateStr)) {
        dailyMap.set(dateStr, new Map());
      }

      const itemMap = dailyMap.get(dateStr)!;

      tx.items.forEach((item) => {
        if (!itemMap.has(item.name)) {
          itemMap.set(item.name, {
            quantity: 0,
            unit: item.unit,
            totalAmount: 0,
          });
        }
        const current = itemMap.get(item.name)!;
        current.quantity += item.quantity;
        current.totalAmount += item.subtotal;
      });
    });

    const result: {
      date: string;
      items: {
        name: string;
        quantity: number;
        unit: string;
        totalAmount: number;
      }[];
    }[] = [];

    dailyMap.forEach((itemMap, date) => {
      const items = Array.from(itemMap.entries())
        .map(([name, data]) => ({
          name,
          quantity: data.quantity,
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
      "Metode Pembayaran",
      "Total Belanja (Rp)",
      "Kolektif Bayar (Rp)",
      "Sisa Utang (Rp)",
      "Jumlah Cetak",
      "Catatan",
    ];

    const rows = filteredTransactions.map((tx) => [
      tx.invoiceNumber,
      formatDate(tx.date),
      tx.customerName,
      tx.paymentMethod.toUpperCase(),
      tx.totalAmount.toString(),
      tx.amountPaid.toString(),
      tx.remainingDebt.toString(),
      tx.printCount.toString(),
      tx.notes || "",
    ]);

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
      "Aktivitas Terakhir",
    ];

    const rows = filteredCustomerReports.map((report) => [
      report.customerId,
      report.customerName,
      report.totalSpent.toString(),
      report.totalPaid.toString(),
      report.remainingDebt.toString(),
      report.totalTransactions.toString(),
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
      "Jumlah Terjual",
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
          item.quantity.toString(),
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
          <div className="text-[10px] text-emerald-600 mt-2 flex items-center gap-1 font-bold">
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
          <p className="text-[10px] text-slate-500 font-semibold mt-2">
            Dana masuk cash & transfer
          </p>
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
          <p className="text-[10px] text-red-500 mt-2 flex items-center gap-1 font-bold">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Sisa tagihan utang tempo
          </p>
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
          <p className="text-[10px] text-slate-500 font-semibold mt-2">
            Penjualan berhasil tercatat
          </p>
        </div>
      </div>

      {/* FILTERS & SEARCH */}
      <div className="bg-white rounded-2xl border border-slate-200/50 p-5 shadow-sm space-y-4">
        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-50 pb-2">
          <Filter className="w-4 h-4 text-red-600" /> Filter & Filter Pencarian
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          {/* Query search (invoice or customer) */}
          <div className="md:col-span-3 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              id="report-search-input"
              type="text"
              placeholder={
                reportTab === "all"
                  ? "Cari nomor nota atau nama pelanggan..."
                  : "Cari nama pelanggan..."
              }
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-9 pr-4 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none transition-all duration-200"
            />
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
                    <th className="py-4 px-5 font-bold uppercase tracking-wider text-[10px] text-center">
                      Metode
                    </th>
                    <th className="py-4 px-5 font-bold uppercase tracking-wider text-[10px] text-right">
                      Total Belanja
                    </th>
                    <th className="py-4 px-5 font-bold uppercase tracking-wider text-[10px] text-right">
                      Sisa Utang
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
                  {filteredTransactions.map((tx) => (
                    <tr
                      key={tx.id}
                      className="hover:bg-slate-50/30 transition-all duration-150"
                    >
                      <td className="py-3.5 px-5 font-black text-slate-900 font-mono">
                        {tx.invoiceNumber}
                      </td>
                      <td className="py-3.5 px-5 text-slate-500 whitespace-nowrap font-medium">
                        {formatDate(tx.date, true)}
                      </td>
                      <td className="py-3.5 px-5 font-bold text-slate-800">
                        {tx.customerName}
                      </td>
                      <td className="py-3.5 px-5 text-slate-600 font-semibold max-w-[200px] truncate">
                        {tx.items
                          .map(
                            (item) =>
                              `${item.name} (${item.quantity}${item.unit})`,
                          )
                          .join(", ")}
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        <span
                          className={`inline-flex rounded-lg px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide border ${tx.paymentMethod === "cash"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : tx.paymentMethod === "transfer"
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}
                        >
                          {tx.paymentMethod === "debt"
                            ? "Utang"
                            : tx.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right font-bold text-slate-900 font-mono">
                        {formatRupiah(tx.totalAmount)}
                      </td>
                      <td className="py-3.5 px-5 text-right font-bold text-red-600 font-mono">
                        {tx.remainingDebt > 0
                          ? formatRupiah(tx.remainingDebt)
                          : "-"}
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
                        <div className="flex justify-end gap-1.5">
                          <button
                            id={`reprint-receipt-btn-${tx.id}`}
                            onClick={() => setReprintTx(tx)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-[10px] py-1 px-2.5 shadow-sm transition cursor-pointer"
                            title="Cetak Ulang Struk"
                          >
                            Cetak
                          </button>
                          <button
                            id={`edit-tx-btn-${tx.id}`}
                            onClick={() => setEditTx(tx)}
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[10px] py-1 px-2.5 shadow-sm transition cursor-pointer"
                            title="Edit Transaksi"
                          >
                            <Edit className="w-3 h-3" /> Edit
                          </button>
                          <button
                            id={`delete-tx-btn-${tx.id}`}
                            onClick={() => setConfirmDeleteTx(tx)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-[10px] py-1 px-2.5 shadow-sm transition cursor-pointer"
                            title="Hapus Transaksi"
                          >
                            <Trash2 className="w-3 h-3" /> Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
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
                          Jumlah Terjual
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
                          <td className="py-2.5 px-5 text-right font-bold text-slate-900 font-mono">
                            {item.quantity}{" "}
                            <span className="text-slate-500 font-medium text-[10px]">
                              {item.unit}
                            </span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border-t-4 border-red-500 animate-in zoom-in-95 duration-150">
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
      )}
    </div>
  );
}
