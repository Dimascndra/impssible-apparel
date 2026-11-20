import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient, setCsrfToken } from '../../api/client';
import { UserSession } from '../../types';
import {
  LayoutDashboard,
  FileCheck2,
  ExternalLink,
  GitBranch,
  Boxes,
  Megaphone,
  Globe,
  TrendingUp,
  Receipt,
  LogOut,
  RefreshCw,
  Menu,
  X,
  ShieldCheck
} from 'lucide-react';

export type AdminTab =
  | 'dashboard'
  | 'instructions'
  | 'tracking'
  | 'orderTypes'
  | 'marketing'
  | 'website'
  | 'cashflow'
  | 'billing';

interface AdminLayoutProps {
  currentTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  children: React.ReactNode;
  onRefreshAll?: () => void;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  currentTab,
  onTabChange,
  children,
  onRefreshAll,
}) => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    async function checkAuth() {
      try {
        const me = await apiClient<UserSession>('/api/auth/me');
        if (me.role !== 'admin') {
          navigate('/login');
          return;
        }
        setSession(me);
        if (me.csrf) setCsrfToken(me.csrf);
      } catch {
        navigate('/login');
      }
    }
    checkAuth();
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await apiClient('/api/auth/logout', { method: 'POST', body: '{}' });
    } finally {
      navigate('/login');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    if (onRefreshAll) {
      await onRefreshAll();
    }
    setTimeout(() => setRefreshing(false), 600);
  };

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'instructions', label: 'Instruksi SPK', icon: <FileCheck2 className="w-4 h-4" /> },
    { id: 'tracking', label: 'Tracking Produksi', icon: <GitBranch className="w-4 h-4" /> },
    { id: 'orderTypes', label: 'Jenis Order & HPP', icon: <Boxes className="w-4 h-4" /> },
    { id: 'marketing', label: 'Marketing Sosmed', icon: <Megaphone className="w-4 h-4" /> },
    { id: 'website', label: 'Website Publik', icon: <Globe className="w-4 h-4" /> },
    { id: 'cashflow', label: 'Cashflow', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'billing', label: 'Invoice & Kwitansi', icon: <Receipt className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#eceae5] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 bg-[#080808] text-white flex-col sticky top-0 h-screen z-30 border-r border-[#222]">
        {/* Brand */}
        <div className="p-5 border-b border-[#222]">
          <img
            src="/assets/impossible-logo.png"
            alt="IMPOSSIBLE APPAREL"
            className="h-10 w-auto object-contain mb-2"
          />
          <span className="text-[10px] font-black tracking-[0.2em] text-[#ff1b1b] uppercase block">
            ADMIN PORTAL
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition ${
                  active
                    ? 'bg-[#ff1b1b] text-white shadow-md shadow-[#ff1b1b]/20'
                    : 'text-neutral-400 hover:text-white hover:bg-[#181818]'
                }`}
              >
                <span className={active ? 'text-white' : 'text-neutral-500'}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}

          {/* External Link to Designer Workspace */}
          <a
            href="/desain"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold text-neutral-400 hover:text-white hover:bg-[#181818] transition mt-2"
          >
            <div className="flex items-center gap-3">
              <span className="text-neutral-500">🎨</span>
              <span>Dashboard Desain</span>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-neutral-500" />
          </a>
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-[#222] bg-[#0c0c0e]">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#13a45a] animate-pulse" />
            <div>
              <strong className="block text-xs text-white font-semibold">Server Aktif</strong>
              <small className="text-[10px] text-neutral-500">Internal · Port 8897</small>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-[#d8d5ce] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg bg-neutral-100 text-neutral-700"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#ff1b1b] block">
                IMPOSSIBLE APPAREL
              </span>
              <h1 className="text-lg font-black uppercase text-neutral-900 leading-none mt-0.5">
                {navItems.find((n) => n.id === currentTab)?.label || 'Dashboard'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-block text-xs text-neutral-500 font-medium">
              Admin: <strong className="text-neutral-800">{session?.username || 'd.candra'}</strong>
            </span>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition"
              title="Muat Ulang Data"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#ff1b1b]' : ''}`} />
            </button>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </header>

        {/* Mobile Slide-in Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileMenuOpen(false)}>
            <div
              className="w-64 bg-[#080808] text-white h-full p-4 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-3 border-b border-[#222] mb-3">
                <img
                  src="/assets/impossible-logo.png"
                  alt="IMPOSSIBLE APPAREL"
                  className="h-8 w-auto object-contain mb-1"
                />
                <span className="text-[10px] font-black text-[#ff1b1b] tracking-wider uppercase">
                  Admin Portal
                </span>
              </div>
              <nav className="space-y-1 flex-1 overflow-y-auto">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      onTabChange(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition ${
                      currentTab === item.id ? 'bg-[#ff1b1b] text-white' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>
        )}

        {/* View Content */}
        <main className="flex-1 p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
