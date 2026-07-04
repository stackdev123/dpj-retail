import React, { useState, useRef } from "react";
import { db } from "../utils/db";
import { AppUser } from "../types";
import { Landmark, Lock, User, AlertCircle, CheckCircle2 } from "lucide-react";

interface LoginProps {
    onLoginSuccess: (user: AppUser) => void;
    sessionExpiredMessage?: string | null;
}

export default function Login({ onLoginSuccess, sessionExpiredMessage }: LoginProps) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const usernameRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);

    const handleUsernameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === "ArrowDown") {
            e.preventDefault();
            passwordRef.current?.focus();
        }
    };

    const handlePasswordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowUp") {
            e.preventDefault();
            usernameRef.current?.focus();
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !password.trim()) {
            setError("Username dan password wajib diisi.");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const users = await db.getUsers();
            const matchedUser = users.find(
                (u) =>
                    u.username.toLowerCase() === username.trim().toLowerCase() &&
                    u.password === password,
            );

            if (matchedUser) {
                setSuccess(true);
                // Log the successful login
                await db.addActivityLog(
                    "LOGIN",
                    "Sistem",
                    `Pengguna ${matchedUser.fullname} (${matchedUser.role.toUpperCase()}) berhasil masuk ke sistem`
                );

                // Wait briefly for animations
                setTimeout(() => {
                    onLoginSuccess(matchedUser);
                }, 1000);
            } else {
                setError("Username atau Password salah. Silakan coba lagi.");
                // Log failed attempt
                await db.addActivityLog(
                    "LOGIN",
                    "Sistem",
                    `Gagal masuk: Percobaan masuk menggunakan username "${username}"`
                );
            }
        } catch (err) {
            console.error("Login error:", err);
            setError("Terjadi kesalahan sistem saat mencoba masuk.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full bg-[#070b13] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Decorative Background Elements */}
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-red-600/10 blur-[120px] pointer-events-none"></div>
            <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none"></div>

            <div className="w-full max-w-md bg-slate-900/40 backdrop-blur-xl rounded-[28px] border border-slate-800 p-8 shadow-2xl relative z-10">

                {/* Brand Header */}
                <div className="flex flex-col items-center text-center mb-8">
                    <div className="rounded-3xl bg-white p-3.5 shadow-xl shadow-red-600/15 flex items-center justify-center w-20 h-20 overflow-hidden mb-4 border border-slate-800">
                        <img
                            src="/logo.png"
                            alt="Logo CV DPJ Berkah Unggas"
                            className="w-full h-full object-contain"
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling!.classList.remove('hidden');
                            }}
                        />
                        <Landmark className="w-10 h-10 text-red-600 hidden" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-white uppercase tracking-tight leading-none">CV DPJ BERKAH UNGGAS</h1>
                        <span className="text-xs text-red-500 font-extrabold uppercase tracking-widest mt-1.5 block">Sistem Manajemen Kasir & Piutang</span>
                    </div>
                </div>

                {/* Status Messages */}
                {sessionExpiredMessage && !error && !success && (
                    <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3.5 text-xs text-amber-400 font-bold animate-in fade-in">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                        <span>{sessionExpiredMessage}</span>
                    </div>
                )}

                {error && (
                    <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-red-500/10 border border-red-500/20 p-3.5 text-xs text-red-400 font-medium animate-in fade-in">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{error}</span>
                    </div>
                )}

                {success && (
                    <div className="mb-5 flex items-center gap-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3.5 text-xs text-emerald-400 font-medium animate-in fade-in">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Login berhasil! Memuat sistem...</span>
                    </div>
                )}

                {/* Login Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Username
                        </label>
                        <div className="relative">
                            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 w-4.5 h-4.5" />
                            <input
                                id="login-username"
                                ref={usernameRef}
                                type="text"
                                disabled={loading || success}
                                placeholder="Masukkan username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                onKeyDown={handleUsernameKeyDown}
                                className="w-full rounded-xl border border-slate-800 bg-slate-950/40 py-3 pl-11 pr-4 text-xs font-bold text-white placeholder-slate-500 focus:border-red-500 focus:outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Password
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 w-4.5 h-4.5" />
                            <input
                                id="login-password"
                                ref={passwordRef}
                                type="password"
                                disabled={loading || success}
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onKeyDown={handlePasswordKeyDown}
                                className="w-full rounded-xl border border-slate-800 bg-slate-950/40 py-3 pl-11 pr-4 text-xs font-bold text-white placeholder-slate-500 focus:border-red-500 focus:outline-none transition-all"
                            />
                        </div>
                    </div>

                    <button
                        id="login-submit-btn"
                        type="submit"
                        disabled={loading || success}
                        className="w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider py-3.5 rounded-xl shadow-lg shadow-red-600/10 transition-all cursor-pointer mt-2"
                    >
                        {loading ? "Menghubungkan..." : "Masuk ke Aplikasi"}
                    </button>
                </form>


            </div>
        </div>
    );
}
