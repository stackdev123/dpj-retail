import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import Cashier from './components/Cashier';
import DebtLedger from './components/DebtLedger';
import Reports from './components/Reports';
import DatabaseManager from './components/DatabaseManager';
import ActivityLogs from './components/ActivityLogs';
import UserManager from './components/UserManager';
import Login from './components/Login';
import PrinterSettings from './components/PrinterSettings';
import { AppUser } from './types';
import { db } from './utils/db';
import { autoConnectPrinter } from './utils/printer';
import { Store, BookOpen, BarChart3, Database, Menu, X, Landmark, ChevronLeft, ChevronRight, LayoutDashboard, History, Users, LogOut, Shield, UserCheck, RefreshCw, Crown, ChevronDown, Settings } from 'lucide-react';

type MenuItem = 'dashboard' | 'cashier' | 'ledger' | 'reports' | 'database' | 'activity_logs' | 'users_management' | 'settings';

function OnlineUsersDropdown({ onlineUsers }: { onlineUsers: any[] }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.online-users-dropdown')) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative online-users-dropdown">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 px-2.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition shadow-sm cursor-pointer md:bg-emerald-50 md:hover:bg-emerald-100 md:border-emerald-200 md:text-emerald-700 md:px-3.5 md:py-1.5 md:text-xs"
      >
        <span className="relative flex h-1.5 w-1.5 md:h-2 md:w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 md:h-2 md:w-2 bg-emerald-500"></span>
        </span>
        <Users className="w-3 h-3 md:w-3.5 md:h-3.5 text-emerald-400 md:text-emerald-600" />
        <span className="hidden xs:inline">Staf Aktif </span>
        <span>({onlineUsers.length})</span>
        <ChevronDown className="w-2.5 h-2.5 md:w-3 md:h-3 opacity-60" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-[#0b0f19] text-white rounded-2xl p-4 shadow-xl border border-slate-800 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-2.5 border-b border-slate-800/60 pb-2">
            <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Staf Sedang Aktif</h4>
            <span className="bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded text-[8px] font-black uppercase">
              Online ({onlineUsers.length})
            </span>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {onlineUsers.length === 0 ? (
              <p className="text-[10px] text-slate-500 py-2">Tidak ada staf lain yang online.</p>
            ) : (
              onlineUsers.map((user) => (
                <div key={user.id} className="flex items-center justify-between bg-slate-900/60 p-2 rounded-xl border border-slate-800/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-[10px] text-slate-300 shrink-0 uppercase">
                      {(user.fullname || 'U').charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-slate-200 truncate leading-none">
                        {user.fullname}
                      </p>
                      <p className="text-[8px] text-slate-400 font-bold truncate mt-0.5">
                        @{user.username}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded leading-none shrink-0 ${user.role === 'superadmin'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : user.role === 'admin'
                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                    }`}>
                    {user.role}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [activeMenu, setActiveMenu] = useState<MenuItem>(() => {
    const savedMenu = localStorage.getItem('dpj_active_menu');
    return (savedMenu as MenuItem) || 'dashboard';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);

  // Persist activeMenu to localStorage when changed
  useEffect(() => {
    localStorage.setItem('dpj_active_menu', activeMenu);
  }, [activeMenu]);

  // Auto-connect to previously paired USB printers on application startup
  useEffect(() => {
    autoConnectPrinter().catch((err) => {
      console.warn("Auto-connect to paired printer failed:", err);
    });
  }, []);

  // Check login session on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('dpj_current_user');
    const loginTimeStr = localStorage.getItem('dpj_login_time');

    if (savedUser) {
      if (loginTimeStr) {
        const loginTime = Number(loginTimeStr);
        const eightHours = 8 * 60 * 60 * 1000;
        if (Date.now() - loginTime > eightHours) {
          // Session expired
          localStorage.removeItem('dpj_current_user');
          localStorage.removeItem('dpj_login_time');
          setSessionExpiredMessage('Sesi Anda telah berakhir (8 jam). Silakan masuk kembali.');
          setCurrentUser(null);
        } else {
          try {
            setCurrentUser(JSON.parse(savedUser));
          } catch (e) {
            localStorage.removeItem('dpj_current_user');
            localStorage.removeItem('dpj_login_time');
          }
        }
      } else {
        // Fallback for legacy session
        localStorage.setItem('dpj_login_time', Date.now().toString());
        try {
          setCurrentUser(JSON.parse(savedUser));
        } catch (e) {
          localStorage.removeItem('dpj_current_user');
        }
      }
    }
    setSessionLoading(false);
  }, []);

  // Update online status heartbeat when currentUser is logged in
  useEffect(() => {
    if (!currentUser) return;

    let lastHeartbeatTime = 0;

    const sendHeartbeat = async (force = false) => {
      const now = Date.now();
      // Throttle user interaction heartbeats to once every 30 seconds to prevent spamming
      if (!force && now - lastHeartbeatTime < 30000) return;

      lastHeartbeatTime = now;
      try {
        await db.updateOnlineStatus(currentUser.id);
      } catch (e) {
        console.warn("Heartbeat failed:", e);
      }
    };

    // Immediately register online
    sendHeartbeat(true);

    // Set up heartbeat interval (every 30 seconds)
    const interval = setInterval(() => {
      sendHeartbeat(true);
    }, 30000);

    // Track user active behaviors
    const handleActivity = () => {
      sendHeartbeat(false);
    };

    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('touchstart', handleActivity);

    return () => {
      clearInterval(interval);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
    };
  }, [currentUser]);

  // Periodic polling of online users to keep the indicator state current
  useEffect(() => {
    if (!currentUser) return;
    const fetchOnline = async () => {
      try {
        const online = await db.getOnlineUsers();
        setOnlineUsers(online);
      } catch (e) {
        console.error("Error fetching online users:", e);
      }
    };
    fetchOnline();
    const interval = setInterval(fetchOnline, 10000); // 10 seconds
    return () => clearInterval(interval);
  }, [currentUser]);

  const handleLoginSuccess = (user: AppUser) => {
    setCurrentUser(user);
    setSessionExpiredMessage(null);
    localStorage.setItem('dpj_current_user', JSON.stringify(user));
    localStorage.setItem('dpj_login_time', Date.now().toString());
  };

  const handleLogout = async () => {
    if (currentUser) {
      // Mark offline immediately
      await db.updateOnlineStatus(currentUser.id, true);
      await db.addActivityLog(
        'LOGIN',
        'Sistem',
        `Pengguna ${currentUser.fullname} (${currentUser.role.toUpperCase()}) telah keluar dari sistem`
      );
    }
    setCurrentUser(null);
    localStorage.removeItem('dpj_current_user');
    localStorage.removeItem('dpj_login_time');
  };

  // Active check for session expiration (8 hours)
  useEffect(() => {
    if (!currentUser) return;

    const checkSessionExpiry = () => {
      const loginTimeStr = localStorage.getItem('dpj_login_time');
      if (loginTimeStr) {
        const loginTime = Number(loginTimeStr);
        const eightHours = 8 * 60 * 60 * 1000;
        if (Date.now() - loginTime > eightHours) {
          // Session expired
          handleLogout();
          setSessionExpiredMessage('Sesi Anda telah berakhir (8 jam). Silakan masuk kembali.');
        }
      }
    };

    // Check immediately and then every 10 seconds
    checkSessionExpiry();
    const interval = setInterval(checkSessionExpiry, 10000);

    return () => clearInterval(interval);
  }, [currentUser]);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'cashier', label: 'Kasir Kas', icon: Store },
    { id: 'ledger', label: 'Buku Utang / Ledger', icon: BookOpen },
    { id: 'reports', label: 'Laporan Penjualan', icon: BarChart3 },
    { id: 'database', label: 'Database Master', icon: Database },
    { id: 'activity_logs', label: 'Log Aktivitas', icon: History },
    { id: 'users_management', label: 'Kelola Pengguna', icon: Users },
    { id: 'settings', label: 'Pengaturan Printer', icon: Settings },
  ] as const;

  const visibleNavItems = navItems.filter(item => {
    if (item.id === 'users_management') {
      return currentUser?.role === 'superadmin';
    }
    return true;
  });

  const renderActiveComponent = () => {
    switch (activeMenu) {
      case 'dashboard':
        return <Dashboard />;
      case 'cashier':
        return <Cashier />;
      case 'ledger':
        return <DebtLedger />;
      case 'reports':
        return <Reports />;
      case 'database':
        return <DatabaseManager />;
      case 'activity_logs':
        return <ActivityLogs currentUser={currentUser} />;
      case 'users_management':
        return currentUser?.role === 'superadmin' ? (
          <UserManager currentUser={currentUser} />
        ) : (
          <Dashboard />
        );
      case 'settings':
        return <PrinterSettings />;
      default:
        return <Dashboard />;
    }
  };

  if (sessionLoading) {
    return (
      <div className="min-h-screen w-full bg-[#070b13] flex flex-col items-center justify-center p-4">
        <RefreshCw className="w-8 h-8 text-red-500 animate-spin mb-3" />
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Memulai Sesi...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <Login
        onLoginSuccess={handleLoginSuccess}
        sessionExpiredMessage={sessionExpiredMessage}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-tr from-slate-100/80 via-slate-50/60 to-zinc-100/80 flex flex-col md:flex-row text-slate-800 font-sans antialiased pb-16 md:pb-0">

      {/* 1. DESKTOP STICKY LEFT SIDEBAR */}
      <aside className={`hidden md:flex md:flex-col bg-[#0b0f19] text-white shrink-0 shadow-xl border-r border-slate-800/40 sticky top-0 h-screen transition-all duration-300 relative ${isSidebarCollapsed ? 'w-20' : 'w-64'}`}>

        {/* Toggle Button */}
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-8 bg-red-600 hover:bg-red-500 text-white p-1 rounded-full shadow-md z-10 transition-colors"
        >
          {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        {/* Brand Header */}
        <div className={`p-6 border-b border-slate-800/60 bg-red-500/[0.02] flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="rounded-2xl bg-white p-1.5 shadow-md shadow-red-600/20 flex items-center justify-center shrink-0 w-12 h-12 overflow-hidden">
            <img src="/logo.png" alt="Logo CV DPJ Berkah Unggas" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling!.classList.remove('hidden'); }} />
            <Landmark className="w-5 h-5 text-red-600 hidden" />
          </div>
          {!isSidebarCollapsed && (
            <div>
              <h1 className="text-sm font-extrabold tracking-tight leading-none uppercase text-white">CV DPJ Berkah</h1>
              <span className="text-[10px] text-red-500 font-black uppercase tracking-widest mt-1 block">Unggas Retail</span>
            </div>
          )}
        </div>

        {/* Navigation items */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeMenu === item.id;
            return (
              <button
                key={item.id}
                id={`sidebar-${item.id}-btn`}
                onClick={() => setActiveMenu(item.id)}
                className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'gap-3.5 px-4'} py-3 rounded-xl text-xs font-bold tracking-wide transition-all duration-200 relative group ${isActive
                    ? 'bg-gradient-to-r from-red-600 to-red-500 text-white shadow-lg shadow-red-600/15'
                    : 'text-slate-400 hover:bg-slate-800/40 hover:text-white'
                  }`}
                title={isSidebarCollapsed ? item.label : undefined}
              >
                <Icon className={`w-4 h-4 transition-transform duration-200 group-hover:scale-110 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                {!isSidebarCollapsed && item.label}
                {isActive && !isSidebarCollapsed && (
                  <span className="absolute right-3 w-1.5 h-1.5 bg-white rounded-full"></span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer with user session and controls */}
        <div className="p-4 border-t border-slate-800/60 bg-slate-950/40 space-y-3">
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'} p-1.5 rounded-xl bg-slate-900/60 border border-slate-800/30`}>
            <div className="rounded-lg bg-red-600/10 p-1.5 flex items-center justify-center shrink-0 text-red-500 w-8 h-8">
              {currentUser?.role === 'superadmin' ? (
                <Crown className="w-4 h-4 text-amber-500" />
              ) : currentUser?.role === 'admin' ? (
                <Shield className="w-4 h-4" />
              ) : (
                <UserCheck className="w-4 h-4" />
              )}
            </div>
            {!isSidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black text-slate-200 truncate leading-tight">{currentUser?.fullname}</p>
                <p className="text-[9px] text-red-500 font-bold uppercase tracking-wider mt-0.5">{currentUser?.role.toUpperCase()}</p>
              </div>
            )}
          </div>

          <button
            onClick={handleLogout}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3 px-4'} py-2.5 rounded-xl text-xs font-bold text-red-400 hover:bg-red-500/10 hover:text-red-300 transition cursor-pointer`}
            title={isSidebarCollapsed ? "Keluar Sistem" : undefined}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!isSidebarCollapsed && "Keluar"}
          </button>
        </div>
      </aside>

      {/* 2. MOBILE HEADER & NAVIGATION */}
      <header className="md:hidden bg-[#0b0f19] text-white shadow-lg flex items-center justify-between p-4 sticky top-0 z-40 border-b border-slate-800/50">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl bg-white p-1 flex items-center justify-center shadow-md shadow-red-600/15 shrink-0 w-10 h-10 overflow-hidden">
            <img src="/logo.png" alt="Logo CV DPJ Berkah Unggas" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling!.classList.remove('hidden'); }} />
            <Landmark className="w-4 h-4 text-red-600 hidden" />
          </div>
          <div>
            <h1 className="text-xs font-extrabold uppercase leading-none">CV DPJ Berkah</h1>
            <span className="text-[8px] text-red-500 font-bold uppercase tracking-wider mt-0.5 block">Unggas Retail</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Online Users Pill inside mobile header */}
          <OnlineUsersDropdown onlineUsers={onlineUsers} />

          <div className="hidden sm:flex flex-col items-end text-right mr-2">
            <span className="text-[10px] font-bold text-slate-300 leading-none">{currentUser?.fullname}</span>
            <span className="text-[8px] text-red-500 font-extrabold uppercase mt-0.5">{currentUser?.role.toUpperCase()}</span>
          </div>

          <button
            onClick={handleLogout}
            className="rounded-xl p-2 text-red-400 hover:bg-red-500/10 transition cursor-pointer"
            title="Keluar"
          >
            <LogOut className="w-4 h-4" />
          </button>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-800/50 hover:text-white transition focus:outline-none"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-[56px] z-30 bg-[#0b0f19]/95 text-white animate-in slide-in-from-top duration-200 backdrop-blur-md flex flex-col justify-between">
          <nav className="p-6 space-y-2">
            <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/40 mb-4 flex items-center gap-3">
              <div className="rounded-lg bg-red-600/10 p-2 flex items-center justify-center text-red-500">
                {currentUser?.role === 'superadmin' ? (
                  <Crown className="w-4.5 h-4.5 text-amber-500" />
                ) : currentUser?.role === 'admin' ? (
                  <Shield className="w-4.5 h-4.5" />
                ) : (
                  <UserCheck className="w-4.5 h-4.5" />
                )}
              </div>
              <div>
                <p className="text-xs font-black text-slate-200 leading-tight">{currentUser?.fullname}</p>
                <p className="text-[9px] text-red-500 font-bold uppercase tracking-wider mt-0.5">{currentUser?.role.toUpperCase()}</p>
              </div>
            </div>

            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeMenu === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveMenu(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-xs font-bold transition ${isActive
                      ? 'bg-gradient-to-r from-red-600 to-red-500 text-white shadow-lg shadow-red-600/10'
                      : 'text-slate-400 hover:bg-slate-800/50'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="p-6 border-t border-slate-800/50 bg-slate-950/20">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-red-500/10 text-red-400 font-bold text-xs hover:bg-red-500/20 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" /> Keluar dari Sistem
            </button>
          </div>
        </div>
      )}

      {/* 3. MAIN WORKSPACE */}
      <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full flex flex-col gap-4">

        {/* Top Header Workspace (Desktop/Tablet) */}
        <div className="hidden md:flex justify-between items-center bg-transparent px-2 py-1 shrink-0">
          <div>
            <h2 className="text-xl font-extrabold text-slate-800 tracking-tight capitalize leading-none">
              {activeMenu === 'dashboard' ? 'Overview Dashboard'
                : activeMenu === 'cashier' ? 'Kasir Kas Retail'
                  : activeMenu === 'ledger' ? 'Buku Piutang / Ledger'
                    : activeMenu === 'reports' ? 'Laporan Penjualan'
                      : activeMenu === 'database' ? 'Database Master'
                        : activeMenu === 'activity_logs' ? 'Log Aktivitas Sistem'
                          : activeMenu === 'settings' ? 'Pengaturan Printer Thermal'
                            : 'Kelola Pengguna Sistem'}
            </h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">
              Sistem Informasi Retail CV DPJ Berkah
            </p>
          </div>

          <div className="flex items-center gap-3">
            <OnlineUsersDropdown onlineUsers={onlineUsers} />
          </div>
        </div>

        <div className="bg-white rounded-[28px] border border-slate-200/50 p-5 sm:p-6 md:p-8 shadow-xl shadow-slate-100/80 min-h-[calc(100vh-180px)] md:min-h-[calc(100vh-140px)]">
          {renderActiveComponent()}
        </div>
      </main>

      {/* 4. MOBILE BOTTOM ACTION BAR FOR COMFORT */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-[#0b0f19]/95 backdrop-blur-md border-t border-slate-800/80 text-white py-2 px-4 flex justify-around shadow-2xl">
        {navItems
          .filter(item => ['dashboard', 'cashier', 'ledger', 'settings'].includes(item.id))
          .map((item) => {
            const Icon = item.icon;
            const isActive = activeMenu === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveMenu(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`flex flex-col items-center justify-center p-1.5 rounded-lg transition-all duration-200 flex-1 ${isActive ? 'text-red-500 font-bold scale-105 bg-red-500/10' : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                <Icon className="w-4.5 h-4.5" />
                <span className="text-[8px] mt-1 font-bold uppercase tracking-wider">{item.label.split(' ')[0]}</span>
              </button>
            );
          })}
      </div>

    </div>
  );
}
