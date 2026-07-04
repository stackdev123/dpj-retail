import React, { useState, useEffect } from "react";
import { AppUser } from "../types";
import { db } from "../utils/db";
import {
    Users,
    Plus,
    Trash2,
    Edit,
    Save,
    X,
    Shield,
    UserCheck,
    RefreshCw,
    Search,
    Crown,
} from "lucide-react";

interface UserManagerProps {
    currentUser: AppUser | null;
}

export default function UserManager({ currentUser }: UserManagerProps) {
    const [users, setUsers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    // Form State
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<AppUser | null>(null);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [fullname, setFullname] = useState("");
    const [role, setRole] = useState<"superadmin" | "admin" | "kasir">("kasir");

    const loadUsers = async () => {
        setLoading(true);
        const data = await db.getUsers();
        setUsers(data);
        setLoading(false);
    };

    useEffect(() => {
        loadUsers();
    }, []);

    const handleOpenCreate = () => {
        setEditingUser(null);
        setUsername("");
        setPassword("");
        setFullname("");
        setRole("kasir");
        setIsFormOpen(true);
    };

    const handleOpenEdit = (user: AppUser) => {
        setEditingUser(user);
        setUsername(user.username);
        setPassword(user.password || "");
        setFullname(user.fullname);
        setRole(user.role);
        setIsFormOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !password.trim() || !fullname.trim()) {
            alert("Seluruh kolom wajib diisi.");
            return;
        }

        // Check duplicate username for new users
        if (!editingUser) {
            const isDuplicate = users.some(
                (u) => u.username.toLowerCase() === username.trim().toLowerCase(),
            );
            if (isDuplicate) {
                alert("Username sudah terdaftar. Silakan gunakan username lain.");
                return;
            }
        }

        const payload: AppUser = {
            id: editingUser ? editingUser.id : `user-${Date.now()}`,
            username: username.trim(),
            password: password,
            fullname: fullname.trim(),
            role: role,
            createdAt: editingUser ? editingUser.createdAt : new Date().toISOString(),
        };

        try {
            await db.saveUser(payload);
            setIsFormOpen(false);
            loadUsers();
        } catch (e) {
            alert("Gagal menyimpan pengguna.");
        }
    };

    const handleDelete = async (id: string) => {
        if (currentUser && currentUser.id === id) {
            alert("Anda tidak dapat menghapus akun Anda sendiri yang sedang digunakan.");
            return;
        }

        const matched = users.find((u) => u.id === id);
        if (!matched) return;

        if (
            !confirm(
                `Apakah Anda yakin ingin menghapus pengguna "${matched.fullname}" (${matched.username})?`,
            )
        ) {
            return;
        }

        try {
            await db.deleteUser(id);
            loadUsers();
        } catch (e) {
            alert("Gagal menghapus pengguna.");
        }
    };

    const filteredUsers = users.filter(
        (u) =>
            u.fullname.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.username.toLowerCase().includes(searchQuery.toLowerCase()),
    );

    return (
        <div className="space-y-6">
            {/* Page Title & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                    <h2 className="text-lg font-extrabold text-slate-900 tracking-tight uppercase">
                        Kelola Pengguna Aplikasi
                    </h2>
                    <p className="text-xs text-slate-500 mt-1 font-medium">
                        Atur hak akses login, tambah kasir baru, atau ubah password sistem
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={loadUsers}
                        className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                    >
                        <RefreshCw className="w-3.5 h-3.5" /> Refresh
                    </button>
                    {currentUser?.role === "superadmin" ? (
                        <button
                            id="add-user-btn"
                            onClick={handleOpenCreate}
                            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white px-4 py-2 text-xs font-bold shadow-md shadow-red-600/10 transition cursor-pointer"
                        >
                            <Plus className="w-4 h-4" /> Tambah Pengguna
                        </button>
                    ) : (
                        <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded-xl px-3 py-1.5 font-bold">
                            Hanya Superadmin yang dapat menambah pengguna
                        </span>
                    )}
                </div>
            </div>

            {/* SEARCH */}
            <div className="bg-white rounded-2xl border border-slate-200/50 p-4 shadow-sm max-w-md relative">
                <Search className="absolute left-7 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                    id="user-search-input"
                    type="text"
                    placeholder="Cari nama atau username pengguna..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none transition-all"
                />
            </div>

            {/* USER LIST CARDS */}
            {loading ? (
                <div className="p-16 text-center text-slate-400 text-xs font-semibold">
                    Sedang memuat data pengguna...
                </div>
            ) : filteredUsers.length === 0 ? (
                <div className="p-16 text-center text-slate-400 text-xs font-medium max-w-sm mx-auto space-y-2">
                    <div className="text-3xl">👥</div>
                    <p className="font-bold text-slate-500">Pengguna Tidak Ditemukan</p>
                    <p className="text-slate-400">
                        Tidak ada akun pengguna yang cocok dengan kriteria pencarian Anda.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredUsers.map((user) => {
                        const isSelf = currentUser?.id === user.id;
                        return (
                            <div
                                key={user.id}
                                className={`rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between ${isSelf ? "border-red-200 ring-2 ring-red-500/5 bg-red-50/10" : "border-slate-200/60"
                                    }`}
                            >
                                {/* Decorative Badge */}
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
                                            {user.role === "superadmin" ? (
                                                <Crown className="w-5 h-5 text-amber-500" />
                                            ) : user.role === "admin" ? (
                                                <Shield className="w-5 h-5 text-red-600" />
                                            ) : (
                                                <UserCheck className="w-5 h-5 text-blue-600" />
                                            )}
                                        </div>
                                        <div>
                                            <h4 className="font-black text-slate-900 text-xs tracking-tight uppercase flex items-center gap-1.5">
                                                {user.fullname}
                                                {isSelf && (
                                                    <span className="text-[8px] bg-red-100 text-red-700 font-extrabold px-1.5 py-0.5 rounded uppercase">
                                                        Saya
                                                    </span>
                                                )}
                                            </h4>
                                            <p className="text-[10px] text-slate-400 font-bold font-mono mt-0.5">
                                                @{user.username}
                                            </p>
                                        </div>
                                    </div>

                                    <span
                                        className={`inline-flex rounded-lg px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${user.role === "superadmin"
                                                ? "bg-amber-50 text-amber-600 border border-amber-200"
                                                : user.role === "admin"
                                                    ? "bg-red-50 text-red-600 border border-red-200"
                                                    : "bg-blue-50 text-blue-600 border border-blue-200"
                                            }`}
                                    >
                                        {user.role}
                                    </span>
                                </div>

                                <div className="border-t border-slate-50 pt-3.5 mt-auto flex items-center justify-between text-[11px] font-semibold text-slate-500">
                                    <div>
                                        <span className="text-slate-400 text-[10px] block">Password:</span>
                                        <span className="font-mono font-bold text-slate-700">
                                            {user.password ? "••••••••" : "Belum diatur"}
                                        </span>
                                    </div>

                                    {currentUser?.role === "superadmin" && (
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => handleOpenEdit(user)}
                                                className="rounded-lg border border-slate-200 hover:bg-slate-50 p-1.5 text-slate-600 transition cursor-pointer"
                                                title="Edit Pengguna"
                                            >
                                                <Edit className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(user.id)}
                                                disabled={isSelf}
                                                className="rounded-lg border border-red-100 bg-red-50 hover:bg-red-100 p-1.5 text-red-600 transition cursor-pointer disabled:opacity-40"
                                                title="Hapus Pengguna"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* CREATE OR EDIT MODAL */}
            {isFormOpen && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="flex min-h-full items-center justify-center">
                        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border-t-4 border-red-500 animate-in zoom-in-95 duration-150 my-8">
                            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-50">
                                <h4 className="font-black text-slate-900 text-sm tracking-tight uppercase flex items-center gap-2">
                                    <Users className="w-4 h-4 text-red-600" />
                                    {editingUser ? "Edit Detail Pengguna" : "Tambah Pengguna Baru"}
                                </h4>
                                <button
                                    onClick={() => setIsFormOpen(false)}
                                    className="text-slate-400 hover:text-slate-600 transition cursor-pointer"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <form onSubmit={handleSave} className="space-y-4">
                                <div className="space-y-1">
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                        Nama Lengkap
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Nama lengkap kasir/admin"
                                        value={fullname}
                                        onChange={(e) => setFullname(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                        Username Login
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Contoh: siska_kasir"
                                        disabled={!!editingUser}
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                        Password Akun
                                    </label>
                                    <input
                                        type="password"
                                        placeholder="Password untuk masuk"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                        Hak Akses / Role
                                    </label>
                                    <select
                                        value={role}
                                        onChange={(e) => setRole(e.target.value as "superadmin" | "admin" | "kasir")}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-xs font-bold text-slate-900 focus:border-red-500 focus:outline-none"
                                    >
                                        <option value="kasir">Kasir (Transaksi & Laporan)</option>
                                        <option value="admin">Administrator (Akses Penuh)</option>
                                        <option value="superadmin">Super Administrator (Kelola Pengguna & Bersihkan Log)</option>
                                    </select>
                                </div>

                                <div className="flex justify-end gap-2 pt-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsFormOpen(false)}
                                        className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 text-xs font-bold transition cursor-pointer"
                                    >
                                        Batal
                                    </button>
                                    <button
                                        type="submit"
                                        className="rounded-xl bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white px-4 py-2 text-xs font-bold shadow-md shadow-red-600/10 transition flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <Save className="w-3.5 h-3.5" />
                                        Simpan
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
