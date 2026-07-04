import React, { useState, useEffect } from "react";
import { db } from "../utils/db";
import { Transaction, CustomerDebtSummary, DebtPayment } from "../types";
import { formatRupiah, formatDate } from "../utils/format";
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  CreditCard,
  Activity,
  Calendar,
  BarChart3,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from "recharts";

export default function Dashboard() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [debtPayments, setDebtPayments] = useState<DebtPayment[]>([]);
  const [customers, setCustomers] = useState([]);

  const [dateFilter, setDateFilter] = useState<
    "today" | "week" | "month" | "all" | "custom"
  >("today");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const loadData = async () => {
    const [txs, payments, custs] = await Promise.all([
      db.getTransactions(),
      db.getDebtPayments(),
      db.getCustomers(),
    ]);
    setTransactions(txs);
    setDebtPayments(payments);
    setCustomers(custs);
  };

  useEffect(() => {
    loadData();
  }, []);

  const getFilteredDates = () => {
    const now = new Date();
    let start = new Date();
    let end = new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (dateFilter === "today") {
      // already set
    } else if (dateFilter === "week") {
      const day = now.getDay() || 7; // Get current day number, converting Sun. to 7
      if (day !== 1) start.setHours(-24 * (day - 1)); // start of week (Monday)
    } else if (dateFilter === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (dateFilter === "all") {
      start = new Date(0); // Very far in the past
    } else if (dateFilter === "custom") {
      if (startDate) {
        start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
      } else {
        start = new Date(0);
      }
      if (endDate) {
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
      }
    }

    return { start: start.getTime(), end: end.getTime() };
  };

  const { start, end } = getFilteredDates();

  const filteredTransactions = transactions.filter((tx) => {
    const txTime = new Date(tx.date).getTime();
    return txTime >= start && txTime <= end;
  });

  const filteredPayments = debtPayments.filter((dp) => {
    const dpTime = new Date(dp.date).getTime();
    return dpTime >= start && dpTime <= end;
  });

  // Calculate Metrics
  const totalOmset = filteredTransactions.reduce(
    (sum, tx) => sum + tx.totalAmount,
    0,
  );
  const totalPemasukanTunai =
    filteredTransactions.reduce((sum, tx) => sum + tx.amountPaid, 0) +
    filteredPayments.reduce((sum, dp) => sum + dp.amountPaid, 0);
  const piutangBaru = filteredTransactions.reduce(
    (sum, tx) => sum + (tx.totalAmount - tx.amountPaid),
    0,
  );

  const txCount = filteredTransactions.length;

  // Real-time Overall / Today's Metrics for Admin Highlight Cards
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const todayTransactions = transactions.filter((tx) => {
    const txTime = new Date(tx.date).getTime();
    return txTime >= todayStart.getTime() && txTime <= todayEnd.getTime();
  });

  const totalSalesToday = todayTransactions.reduce(
    (sum, tx) => sum + tx.totalAmount,
    0,
  );

  const activeRemainingDebt = transactions.reduce(
    (sum, tx) => sum + tx.remainingDebt,
    0,
  );

  // Calculate daily data for chart
  const dailyDataMap = new Map();

  filteredTransactions.forEach((tx) => {
    const dateStr = new Date(tx.date).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
    });
    if (!dailyDataMap.has(dateStr)) {
      dailyDataMap.set(dateStr, {
        name: dateStr,
        omset: 0,
        pemasukan: 0,
        piutang: 0,
      });
    }
    const dayData = dailyDataMap.get(dateStr);
    dayData.omset += tx.totalAmount;
    dayData.pemasukan += tx.amountPaid;
    dayData.piutang += tx.totalAmount - tx.amountPaid;
  });

  filteredPayments.forEach((dp) => {
    const dateStr = new Date(dp.date).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
    });
    if (!dailyDataMap.has(dateStr)) {
      dailyDataMap.set(dateStr, {
        name: dateStr,
        omset: 0,
        pemasukan: 0,
        piutang: 0,
      });
    }
    const dayData = dailyDataMap.get(dateStr);
    dayData.pemasukan += dp.amountPaid;
  });

  // Sort chronologically based on raw date, but since they're just strings, we might need a better sort if spanning multiple months
  // For simplicity, we just convert map to array
  const dailyData = Array.from(dailyDataMap.values());

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20">
            <LayoutDashboard className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-slate-900 tracking-tight uppercase">
              Dashboard Ringkasan
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Pantau performa bisnis dan arus kas
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50 p-1">
            <button
              onClick={() => setDateFilter("today")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${dateFilter === "today" ? "bg-white shadow-sm text-emerald-600 border border-slate-200/60" : "text-slate-500 hover:text-slate-700"}`}
            >
              Hari Ini
            </button>
            <button
              onClick={() => setDateFilter("week")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${dateFilter === "week" ? "bg-white shadow-sm text-emerald-600 border border-slate-200/60" : "text-slate-500 hover:text-slate-700"}`}
            >
              Minggu Ini
            </button>
            <button
              onClick={() => setDateFilter("month")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${dateFilter === "month" ? "bg-white shadow-sm text-emerald-600 border border-slate-200/60" : "text-slate-500 hover:text-slate-700"}`}
            >
              Bulan Ini
            </button>
            <button
              onClick={() => setDateFilter("all")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${dateFilter === "all" ? "bg-white shadow-sm text-emerald-600 border border-slate-200/60" : "text-slate-500 hover:text-slate-700"}`}
            >
              Semua
            </button>
            <button
              onClick={() => setDateFilter("custom")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${dateFilter === "custom" ? "bg-white shadow-sm text-emerald-600 border border-slate-200/60" : "text-slate-500 hover:text-slate-700"}`}
            >
              Kustom
            </button>
          </div>

          {dateFilter === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-emerald-500"
              />
              <span className="text-slate-400">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-emerald-500"
              />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* Ringkasan Instan Admin */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: Total Penjualan Hari Ini */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[4px] bg-gradient-to-r from-emerald-500 to-teal-500 rounded-t-2xl"></div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="bg-emerald-50 text-emerald-600 p-2 rounded-xl">
                  <Calendar className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">
                    Total Penjualan Hari Ini
                  </h3>
                  <p className="text-[10px] text-slate-400 font-semibold">
                    Real-time per hari ini: {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-extrabold bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg uppercase tracking-wide">
                Hari Ini
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
                {formatRupiah(totalSalesToday)}
              </span>
              <span className="text-xs text-slate-500 font-semibold">
                ({todayTransactions.length} Nota)
              </span>
            </div>
          </div>

          {/* Card 2: Sisa Piutang Aktif */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[4px] bg-gradient-to-r from-amber-500 to-orange-500 rounded-t-2xl"></div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="bg-amber-50 text-amber-600 p-2 rounded-xl">
                  <CreditCard className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">
                    Sisa Piutang Aktif
                  </h3>
                  <p className="text-[10px] text-slate-400 font-semibold">
                    Total akumulasi piutang yang belum dilunasi
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-extrabold bg-amber-50 text-amber-700 px-2 py-1 rounded-lg uppercase tracking-wide">
                Akumulasi
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
                {formatRupiah(activeRemainingDebt)}
              </span>
              <span className="text-xs text-slate-500 font-semibold">
                (Sisa Tagihan)
              </span>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Activity className="w-16 h-16" />
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-blue-50 text-blue-600 p-2 rounded-lg">
                <TrendingUp className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-slate-600 text-sm">
                Total Omset
              </h3>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">
                {formatRupiah(totalOmset)}
              </p>
              <p className="text-xs text-slate-500 mt-1">{txCount} Transaksi</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <DollarSign className="w-16 h-16" />
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-emerald-50 text-emerald-600 p-2 rounded-lg">
                <DollarSign className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-slate-600 text-sm">
                Pemasukan Tunai
              </h3>
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-600">
                {formatRupiah(totalPemasukanTunai)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Kas masuk periode ini
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <CreditCard className="w-16 h-16" />
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-orange-50 text-orange-600 p-2 rounded-lg">
                <TrendingDown className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-slate-600 text-sm">
                Piutang Baru
              </h3>
            </div>
            <div>
              <p className="text-2xl font-bold text-orange-600">
                {formatRupiah(piutangBaru)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Utang belum terbayar periode ini
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Users className="w-16 h-16" />
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-indigo-50 text-indigo-600 p-2 rounded-lg">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-slate-600 text-sm">
                Pelanggan Aktif
              </h3>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">
                {new Set(filteredTransactions.map((t) => t.customerId)).size}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Pelanggan bertransaksi
              </p>
            </div>
          </div>
        </div>

        {/* Chart Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 lg:col-span-2">
            <h3 className="font-bold text-slate-700 mb-6 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-500" />
              Grafik Omset vs Pemasukan
            </h3>
            <div className="h-72 w-full text-xs">
              {dailyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={dailyData}
                    margin={{ top: 10, right: 10, left: 20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#e2e8f0"
                    />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#64748b" }}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#64748b" }}
                      tickFormatter={(value) => `Rp ${value / 1000}K`}
                      width={80}
                    />
                    <RechartsTooltip
                      formatter={(value: number) => formatRupiah(value)}
                      contentStyle={{
                        borderRadius: "8px",
                        border: "none",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                      }}
                      cursor={{ fill: "#f1f5f9" }}
                    />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{ paddingTop: "20px" }}
                    />
                    <Bar
                      dataKey="omset"
                      name="Total Omset"
                      fill="#3b82f6"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                    <Bar
                      dataKey="pemasukan"
                      name="Pemasukan Tunai"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                  <BarChart3 className="w-12 h-12 mb-2 opacity-20" />
                  <p>Tidak ada data untuk periode ini</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-orange-500" />
              Distribusi Transaksi
            </h3>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-600">
                    Tunai / Transfer (Lunas)
                  </span>
                  <span className="text-emerald-600">
                    {formatRupiah(totalPemasukanTunai)}
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className="bg-emerald-500 h-2 rounded-full"
                    style={{
                      width:
                        totalOmset > 0
                          ? `${(totalPemasukanTunai / totalOmset) * 100}%`
                          : "0%",
                    }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-600">
                    Piutang (Belum Dibayar)
                  </span>
                  <span className="text-orange-500">
                    {formatRupiah(piutangBaru)}
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className="bg-orange-500 h-2 rounded-full"
                    style={{
                      width:
                        totalOmset > 0
                          ? `${(piutangBaru / totalOmset) * 100}%`
                          : "0%",
                    }}
                  ></div>
                </div>
              </div>
            </div>

            <div className="mt-8 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                Statistik Tambahan
              </h4>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex justify-between">
                  <span>Rata-rata Transaksi:</span>
                  <span className="font-semibold">
                    {txCount > 0 ? formatRupiah(totalOmset / txCount) : "Rp 0"}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span>Jumlah Transaksi:</span>
                  <span className="font-semibold">{txCount}</span>
                </li>
                <li className="flex justify-between">
                  <span>Jumlah Pelanggan:</span>
                  <span className="font-semibold">
                    {
                      new Set(filteredTransactions.map((t) => t.customerId))
                        .size
                    }
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
