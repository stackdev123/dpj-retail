import React, { useState, useEffect } from "react";
import { ActivityLog, AppUser } from "../types";
import { db } from "../utils/db";
import { formatDate } from "../utils/format";
import {
    History,
    Search,
    Filter,
    Trash2,
    RefreshCw,
    PlusCircle,
    Edit,
    Trash,
    LogIn,
    RotateCcw,
    Info,
} from "lucide-react";

interface ActivityLogsProps {
    currentUser?: AppUser | null;
}

export default function ActivityLogs({ currentUser }: ActivityLogsProps) {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters State
    const [searchQuery, setSearchQuery] = useState("");
    const [filterAction, setFilterAction] = useState<string>("all");
    const [filterModule, setFilterModule] = useState<string>("all");

    // Confirmation modal
    const [confirmClearOpen, setConfirmClearOpen] = useState(false);

    const loadLogs = async () => {
        setLoading(true);
        const logsData = await db.getActivityLogs();
        setLogs(logsData);
        setLoading(false);
    };

    useEffect(() => {
        loadLogs();
    }, []);

    const handleRefresh = () => {
        loadLogs();
    };

    const handleClearLogs = async () => {
        await db.clearActivityLogs();
        await db.addActivityLog("RESET", "Sistem", "Menghapus riwayat log aktivitas pengguna");
        loadLogs();
        setConfirmClearOpen(false);
    };

    // Filter logic
    const filteredLogs = logs.filter((log) => {
        const matchesSearch = log.description
            .toLowerCase()
            .includes(searchQuery.toLowerCase());
        const matchesAction =
            filterAction === "all" || log.action === filterAction;
        const matchesModule =
            filterModule === "all" || log.module === filterModule;

        return matchesSearch && matchesAction && matchesModule;
    });

    const getActionBadge = (action: ActivityLog["action"]) => {
        switch (action) {
            case "CREATE":
                return {
                    bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
                    icon: <PlusCircle className="w-3.5 h-3.5 mr-1" />,
                    label: "CREATE",
                };
            case "EDIT":
                return {
                    bg: "bg-blue-50 text-blue-700 border-blue-200",
                    icon: <Edit className="w-3.5 h-3.5 mr-1" />,
                    label: "EDIT",
                };
            case "DELETE":
                return {
                    bg: "bg-red-50 text-red-700 border-red-200",
                    icon: <Trash className="w-3.5 h-3.5 mr-1" />,
                    label: "DELETE",
                };
            case "LOGIN":
                return {
                    bg: "bg-purple-50 text-purple-700 border-purple-200",
                    icon: <LogIn className="w-3.5 h-3.5 mr-1" />,
                    label: "LOGIN",
                };
            case "RESET":
                return {
                    bg: "bg-amber-50 text-amber-700 border-amber-200",
                    icon: <RotateCcw className="w-3.5 h-3.5 mr-1" />,
                    label: "RESET",
                };
            default:
                return {
                    bg: "bg-slate-50 text-slate-700 border-slate-200",
                    icon: <Info className="w-3.5 h-3.5 mr-1" />,
                    label: "LOG",
                };
        }
    };

    const getModuleBadge = (mod: string) => {
        switch (mod) {
            case "Penjualan":
                return "bg-red-100 text-red-800";
            case "Pelanggan":
                return "bg-indigo-100 text-indigo-800";
            case "Produk":
                return "bg-amber-100 text-amber-800";
            case "Sistem":
                return "bg-slate-100 text-slate-800";
            default:
                return "bg-slate-100 text-slate-800";
        }
    };

    return (
        <div className="space-y-6">
            {/* Page Title & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                    <h2 className="text-lg font-extrabold text-slate-900 tracking-tight uppercase">
                        Log Aktivitas Pengguna
                    </h2>
                    <p className="text-xs text-slate-500 mt-1 font-medium">
                        Catatan log audit atas aktivitas create, edit, delete, dan sistem
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleRefresh}
                        className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                    >
                        <RefreshCw className="w-3.5 h-3.5" /> Refresh
                    </button>
                    {currentUser?.role === "superadmin" ? (
                        <button
                            id="clear-logs-btn"
                            onClick={() => setConfirmClearOpen(true)}
                            disabled={logs.length === 0}
                            className="flex items-center gap-1.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 px-4 py-2 text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                        >
                            <Trash2 className="w-3.5 h-3.5" /> Bersihkan Log
                        </button>
                    ) : (
                        <span className="text-[10px] bg-slate-100 text-slate-500 border border-slate-200 rounded-xl px-3 py-2 font-bold select-none">
                            Khusus Superadmin
                        </span>
                    )}
                </div>
            </div>

            {/* FILTERS & SEARCH */}
            <div className="bg-white rounded-2xl border border-slate-200/50 p-5 shadow-sm space-y-4">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-50 pb-2">
                    <Filter className="w-4 h-4 text-red-600" /> Filter & Filter Pencarian
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    {/* Query search */}
                    <div className="md:col-span-6 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input
                            id="log-search-input"
                            type="text"
                            placeholder="Cari deskripsi aktivitas..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-9 pr-4 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none transition-all duration-200"
                        />
                    </div>

                    {/* Action Filter */}
                    <div className="md:col-span-3">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                            Jenis Tindakan
                        </label>
                        <select
                            id="log-action-select"
                            value={filterAction}
                            onChange={(e) => setFilterAction(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none transition-all duration-200"
                        >
                            <option value="all">Semua Tindakan</option>
                            <option value="CREATE">CREATE (Tambah)</option>
                            <option value="EDIT">EDIT (Ubah)</option>
                            <option value="DELETE">DELETE (Hapus)</option>
                            <option value="LOGIN">LOGIN (Sesi)</option>
                            <option value="RESET">RESET (Sistem)</option>
                        </select>
                    </div>

                    {/* Module Filter */}
                    <div className="md:col-span-3">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                            Modul Data
                        </label>
                        <select
                            id="log-module-select"
                            value={filterModule}
                            onChange={(e) => setFilterModule(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none transition-all duration-200"
                        >
                            <option value="all">Semua Modul</option>
                            <option value="Penjualan">Penjualan</option>
                            <option value="Pelanggan">Pelanggan</option>
                            <option value="Produk">Produk</option>
                            <option value="Sistem">Sistem</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* LOG LIST DISPLAY */}
            <div className="bg-white rounded-2xl border border-slate-200/50 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-16 text-center text-slate-400 text-xs font-semibold">
                        Sedang memuat data log...
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="p-16 text-center text-slate-400 text-xs font-medium max-w-md mx-auto space-y-2">
                        <div className="text-3xl">📋</div>
                        <p className="font-bold text-slate-500">Tidak Ada Log Terdeteksi</p>
                        <p className="text-slate-400">
                            Belum ada data log aktivitas yang cocok dengan kriteria filter pencarian Anda.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-400">
                                    <th className="py-4 px-5 font-bold uppercase tracking-wider text-[10px] w-48">
                                        Waktu / Tanggal
                                    </th>
                                    <th className="py-4 px-5 font-bold uppercase tracking-wider text-[10px] w-36">
                                        Tindakan
                                    </th>
                                    <th className="py-4 px-5 font-bold uppercase tracking-wider text-[10px] w-32">
                                        Modul
                                    </th>
                                    <th className="py-4 px-5 font-bold uppercase tracking-wider text-[10px]">
                                        Deskripsi Aktivitas
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredLogs.map((log) => {
                                    const badge = getActionBadge(log.action);
                                    return (
                                        <tr
                                            key={log.id}
                                            className="hover:bg-slate-50/30 transition-all duration-150"
                                        >
                                            <td className="py-3.5 px-5 text-slate-500 whitespace-nowrap font-medium font-mono">
                                                {formatDate(log.timestamp, true)}
                                            </td>
                                            <td className="py-3.5 px-5 whitespace-nowrap">
                                                <span
                                                    className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[9px] font-black uppercase tracking-wide border ${badge.bg}`}
                                                >
                                                    {badge.icon}
                                                    {badge.label}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-5 whitespace-nowrap">
                                                <span
                                                    className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${getModuleBadge(
                                                        log.module,
                                                    )}`}
                                                >
                                                    {log.module}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-5 font-semibold text-slate-800">
                                                {log.description}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* CONFIRM CLEAR MODAL */}
            {confirmClearOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border-t-4 border-red-500">
                        <h4 className="font-black text-slate-900 text-sm mb-2 tracking-tight uppercase">
                            Hapus Riwayat Log Aktivitas?
                        </h4>
                        <p className="text-xs text-slate-500 mb-4 font-medium leading-relaxed">
                            Tindakan ini akan menghapus permanen seluruh riwayat log aktivitas yang tersimpan. Log audit tidak dapat dikembalikan lagi.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setConfirmClearOpen(false)}
                                className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 text-xs font-bold transition cursor-pointer"
                            >
                                Batal
                            </button>
                            <button
                                id="clear-logs-confirm-btn"
                                onClick={handleClearLogs}
                                className="rounded-xl bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-xs font-bold shadow-md shadow-red-600/10 transition cursor-pointer"
                            >
                                Hapus Sekarang
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
