import React, { useState } from 'react';
import Dashboard from './components/Dashboard';
import Cashier from './components/Cashier';
import DebtLedger from './components/DebtLedger';
import Reports from './components/Reports';
import DatabaseManager from './components/DatabaseManager';
import { db } from './utils/db';
import { Store, BookOpen, BarChart3, Database, Trash2, Menu, X, Landmark, ChevronLeft, ChevronRight, LayoutDashboard } from 'lucide-react';

type MenuItem = 'dashboard' | 'cashier' | 'ledger' | 'reports' | 'database';

export default function App() {
  const [activeMenu, setActiveMenu] = useState<MenuItem>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'cashier', label: 'Kasir Kas', icon: Store },
    { id: 'ledger', label: 'Buku Utang / Ledger', icon: BookOpen },
    { id: 'reports', label: 'Laporan Penjualan', icon: BarChart3 },
    { id: 'database', label: 'Database Master', icon: Database },
  ] as const;

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
      default:
        return <Dashboard />;
    }
  };

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
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeMenu === item.id;
            return (
              <button
                key={item.id}
                id={`sidebar-${item.id}-btn`}
                onClick={() => setActiveMenu(item.id)}
                className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'gap-3.5 px-4'} py-3 rounded-xl text-xs font-bold tracking-wide transition-all duration-200 relative group ${
                  isActive
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

        {/* Sidebar Footer with system controls */}
        <div className="p-4 border-t border-slate-800/60 bg-slate-950/20">
          {!isSidebarCollapsed && (
            <div className="text-[9px] text-slate-500 text-center font-semibold tracking-wide whitespace-nowrap">
              Sistem Kasir v1.0 • CV DPJ Berkah
            </div>
          )}
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
        <div className="md:hidden fixed inset-0 top-[56px] z-30 bg-[#0b0f19]/95 text-white animate-in slide-in-from-top duration-200 backdrop-blur-md">
          <nav className="p-6 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeMenu === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveMenu(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-xs font-bold transition ${
                    isActive 
                      ? 'bg-gradient-to-r from-red-600 to-red-500 text-white shadow-lg shadow-red-600/10' 
                      : 'text-slate-400 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
            {/* No reset db button */}
          </nav>
        </div>
      )}

      {/* 3. MAIN WORKSPACE */}
      <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full">
        <div className="bg-white rounded-[28px] border border-slate-200/50 p-5 sm:p-6 md:p-8 shadow-xl shadow-slate-100/80 min-h-[calc(100vh-140px)] md:min-h-[calc(100vh-64px)] backdrop-blur-md bg-white/95">
          {renderActiveComponent()}
        </div>
      </main>

      {/* 4. MOBILE BOTTOM ACTION BAR FOR COMFORT */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-[#0b0f19]/95 backdrop-blur-md border-t border-slate-800/80 text-white py-2 px-4 flex justify-around shadow-2xl">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeMenu === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveMenu(item.id);
                setMobileMenuOpen(false);
              }}
              className={`flex flex-col items-center justify-center p-1.5 rounded-lg transition-all duration-200 ${
                isActive ? 'text-red-500 font-bold scale-105 bg-red-500/10' : 'text-slate-400 hover:text-slate-200'
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
