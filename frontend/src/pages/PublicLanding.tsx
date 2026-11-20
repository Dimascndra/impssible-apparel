import React, { useState, useEffect } from 'react';
import { apiClient, formatRupiah, formatDate, ApiError } from '../api/client';
import { CatalogProduct, WebsiteSettings } from '../types';
import {
  Search,
  MessageCircle,
  Download,
  CheckCircle2,
  Clock,
  ArrowRight,
  MapPin,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  X,
  Sparkles,
  Layers,
  Scissors,
  CheckCheck
} from 'lucide-react';

interface CustomerSummary {
  spk: string;
  customer: string;
  product: string;
  qty: number;
  stage: string;
  progress: number;
  history: Array<{
    stage: string;
    progress: number;
    note?: string;
    created_at: string;
  }>;
  invoice?: {
    id: number;
    invoice_no: string;
    total: number;
    paid: number;
    balance: number;
    payment_status: string;
  };
}

export const PublicLanding: React.FC = () => {
  const [splashVisible, setSplashVisible] = useState(true);
  const [settings, setSettings] = useState<WebsiteSettings>({});
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('SEMUA');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);

  // Customer Tracking State
  const [spkInput, setSpkInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [customerData, setCustomerData] = useState<CustomerSummary | null>(null);

  // Live order ticker
  const [activities, setActivities] = useState<Array<{ id: number; message: string; time: string }>>([]);

  // Auto close splash after 2.4 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setSplashVisible(false);
    }, 2400);
    return () => clearTimeout(timer);
  }, []);

  // Fetch Public Catalog & Settings
  useEffect(() => {
    async function loadData() {
      try {
        const catRes = await apiClient<{ products: CatalogProduct[]; settings?: WebsiteSettings }>(
          '/api/public/catalog'
        );
        if (catRes.products) setProducts(catRes.products);
        if (catRes.settings) setSettings(catRes.settings);
      } catch (err) {
        console.error('Failed to load catalog:', err);
      }

      try {
        const actRes = await apiClient<{ activities: Array<{ id: number; message: string; time: string }> }>(
          '/api/public/activity'
        );
        if (actRes.activities) setActivities(actRes.activities);
      } catch {
        // Activity ticker optional
      }
    }
    loadData();
  }, []);

  // Categories list
  const categories = ['SEMUA', ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];

  const filteredProducts = products.filter((p) => {
    const matchCat = selectedCategory === 'SEMUA' || p.category === selectedCategory;
    const matchSearch =
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  const getWhatsappUrl = (text?: string) => {
    const phone = (settings.whatsapp || '6281222333444').replace(/\D/g, '').replace(/^0/, '62');
    const msg = text || 'Halo IMPOSSIBLE APPAREL, saya ingin konsultasi order custom jersey/apparel.';
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  };

  // Customer Login Handler
  const handleCustomerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustomerLoading(true);
    setCustomerError(null);

    try {
      await apiClient('/api/public/customer/login', {
        method: 'POST',
        body: JSON.stringify({ spk: spkInput.trim(), code: codeInput.trim() }),
      });

      const summary = await apiClient<CustomerSummary>('/api/public/customer/summary');
      setCustomerData(summary);
    } catch (err: any) {
      setCustomerError(err.message || 'Nomor SPK atau Kode Akses tidak valid.');
    } finally {
      setCustomerLoading(false);
    }
  };

  const handleCustomerLogout = async () => {
    try {
      await apiClient('/api/public/customer/logout', { method: 'POST' });
    } catch {
      // Ignore error on logout
    }
    setCustomerData(null);
    setSpkInput('');
    setCodeInput('');
  };

  const handleDownloadInvoicePdf = async (invoiceId: number) => {
    try {
      const response = await fetch(`/api/public/customer/invoices/${invoiceId}/pdf`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Gagal mengunduh PDF');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `INVOICE-${customerData?.spk || 'OFFICIAL'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Gagal mengunduh dokumen: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#090909] text-white selection:bg-[#ff1b1b] selection:text-white">
      {/* 1. Welcome Splash */}
      {splashVisible && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#090909] transition-opacity duration-700">
          <div className="relative flex flex-col items-center">
            {/* Pulsing ring animation */}
            <div className="w-48 h-48 rounded-full border border-[#ff1b1b]/30 animate-ping absolute -top-8" />
            <div className="w-56 h-56 rounded-full border border-[#d4af37]/20 animate-pulse absolute -top-12" />

            <span className="text-[#ff1b1b] text-xs font-black tracking-[0.3em] uppercase mb-4 animate-bounce">
              WELCOME TO
            </span>
            <img
              src="/assets/impossible-logo.png"
              alt="IMPOSSIBLE APPAREL"
              className="h-16 w-auto object-contain mb-8 relative z-10"
            />
            <div className="w-48 h-1 bg-[#222] rounded-full overflow-hidden mb-4">
              <div className="h-full bg-gradient-to-r from-[#ff1b1b] to-[#d4af37] animate-[pulse_1s_infinite] w-full" />
            </div>
            <span className="text-neutral-400 text-[10px] tracking-[0.25em] uppercase font-semibold">
              CUSTOM APPAREL EXPERIENCE
            </span>
          </div>
          <button
            onClick={() => setSplashVisible(false)}
            className="absolute bottom-10 px-6 py-2 rounded-full border border-[#333] hover:border-[#666] text-xs tracking-wider uppercase text-neutral-400 hover:text-white transition"
          >
            Lewati →
          </button>
        </div>
      )}

      {/* 2. Top Header Navigation */}
      <header className="sticky top-0 z-40 bg-[#080808]/90 backdrop-blur-md border-b border-[#222]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <a href="#home" className="flex items-center gap-3">
            <img
              src="/assets/impossible-logo.png"
              alt="IMPOSSIBLE APPAREL"
              className="h-10 w-auto object-contain"
            />
          </a>

          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold tracking-wide">
            <a href="#home" className="text-neutral-300 hover:text-white transition">Home</a>
            <a href="#catalog" className="text-neutral-300 hover:text-white transition">Katalog</a>
            <a href="#order" className="text-neutral-300 hover:text-white transition">Tracking & Invoice</a>
            <a href="#tentang" className="text-neutral-300 hover:text-white transition">Tentang Kami</a>
            <a href="#lokasi" className="text-neutral-300 hover:text-white transition">Lokasi</a>
          </nav>

          <div className="flex items-center gap-4">
            <a
              href="/login"
              className="text-xs uppercase font-bold tracking-wider text-neutral-400 hover:text-white px-3 py-2 rounded-lg border border-[#333] hover:border-neutral-500 transition"
            >
              Login Staff
            </a>
            <a
              href={getWhatsappUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-[#ff1b1b] hover:bg-[#e01616] text-white text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-xl transition shadow-lg shadow-[#ff1b1b]/20"
            >
              <MessageCircle className="w-4 h-4" />
              <span>WhatsApp</span>
            </a>
          </div>
        </div>
      </header>

      {/* 3. Hero Section */}
      <section id="home" className="relative min-h-[85vh] flex items-center justify-center overflow-hidden border-b border-[#222]">
        {/* Glow & Backdrop */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#111] via-[#090909] to-[#090909] z-0" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-[#ff1b1b]/10 blur-[140px] pointer-events-none rounded-full" />

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-20 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#18181b] border border-[#333] text-[11px] font-bold tracking-[0.2em] text-[#ff1b1b] uppercase mb-8 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-[#ff1b1b]" />
            <span>{settings.hero_title ? 'IMPOSSIBLE APPAREL · CUSTOM PRODUCTION' : 'IMPOSSIBLE APPAREL · CUSTOM PRODUCTION'}</span>
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black uppercase tracking-tight leading-[1.05] mb-8">
            CUSTOM APPAREL,<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-neutral-200 to-[#d4af37]">
              BUILT FOR YOUR IDENTITY.
            </span>
          </h1>

          <p className="max-w-2xl mx-auto text-neutral-400 text-base sm:text-lg mb-10 leading-relaxed">
            Jersey full print, polo custom, hoodie, dan apparel komunitas yang diproduksi dengan standar presisi tinggi dari tahap desain hingga selesai.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#catalog"
              className="w-full sm:w-auto px-8 py-4 bg-[#ff1b1b] hover:bg-[#e01616] text-white font-black text-sm uppercase tracking-wider rounded-xl transition shadow-xl shadow-[#ff1b1b]/20 flex items-center justify-center gap-2"
            >
              <span>Lihat Katalog Produk</span>
              <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href="#order"
              className="w-full sm:w-auto px-8 py-4 bg-[#18181b] hover:bg-[#222] border border-[#333] hover:border-neutral-500 text-white font-bold text-sm uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2"
            >
              <span>Cek Status Pesanan</span>
            </a>
          </div>

          {/* 4-Step Transparent Workflow */}
          <div className="mt-16 pt-10 border-t border-[#222] grid grid-cols-2 md:grid-cols-4 gap-6 text-left">
            <div className="p-4 rounded-xl bg-[#121214]/60 border border-[#222]">
              <div className="text-[#ff1b1b] font-black text-xs mb-1">01 / BRIEF</div>
              <div className="text-sm font-bold text-white">Desain Eksklusif</div>
              <div className="text-xs text-neutral-500 mt-1">Mockup 3D & file CDR presisi</div>
            </div>
            <div className="p-4 rounded-xl bg-[#121214]/60 border border-[#222]">
              <div className="text-[#d4af37] font-black text-xs mb-1">02 / SUBLIM</div>
              <div className="text-sm font-bold text-white">Cetak Pola & Press</div>
              <div className="text-xs text-neutral-500 mt-1">Tinta original & warna pekat</div>
            </div>
            <div className="p-4 rounded-xl bg-[#121214]/60 border border-[#222]">
              <div className="text-[#ff1b1b] font-black text-xs mb-1">03 / JAHIT</div>
              <div className="text-sm font-bold text-white">Jahit & Bordir</div>
              <div className="text-xs text-neutral-500 mt-1">Jahitan rapi standar distro</div>
            </div>
            <div className="p-4 rounded-xl bg-[#121214]/60 border border-[#222]">
              <div className="text-[#13a45a] font-black text-xs mb-1">04 / FINISH</div>
              <div className="text-sm font-bold text-white">QC & Pengiriman</div>
              <div className="text-xs text-neutral-500 mt-1">100% lolos uji sebelum kirim</div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Order Ticker */}
      {activities.length > 0 && (
        <div className="bg-[#121214] border-b border-[#222] py-3 px-4 overflow-hidden">
          <div className="max-w-7xl mx-auto flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#ff1b1b]/10 text-[#ff1b1b] font-black tracking-widest uppercase text-[10px]">
              <span className="w-2 h-2 rounded-full bg-[#ff1b1b] animate-ping" />
              LIVE ORDER
            </span>
            <div className="flex gap-8 overflow-x-auto no-scrollbar whitespace-nowrap text-neutral-300">
              {activities.map((act) => (
                <span key={act.id} className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#13a45a]" />
                  <span>{act.message}</span>
                  <span className="text-neutral-500">({act.time})</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. Catalog Section */}
      <section id="catalog" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 border-b border-[#222]">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <span className="text-[#ff1b1b] text-xs font-black tracking-[0.25em] uppercase block mb-2">
              KATALOG PRODUK
            </span>
            <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white">
              {settings.catalog_title || 'Katalog Impossible'}
            </h2>
            <p className="text-neutral-400 text-sm mt-2 max-w-lg">
              Pilih spesifikasi bahan dan model jersey custom sesuai preferensi tim Anda.
            </p>
          </div>

          {/* Search bar */}
          <div className="w-full md:w-80 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              placeholder="Cari produk atau bahan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-[#141416] border border-[#333] rounded-xl text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-[#ff1b1b]"
            />
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-4 mb-8 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition shrink-0 ${
                selectedCategory === cat
                  ? 'bg-[#ff1b1b] text-white shadow-lg shadow-[#ff1b1b]/20'
                  : 'bg-[#141416] text-neutral-400 hover:text-white border border-[#2a2a2a]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Product Cards Grid */}
        {filteredProducts.length === 0 ? (
          <div className="text-center py-20 bg-[#121214] rounded-2xl border border-[#222]">
            <Layers className="w-10 h-10 text-neutral-600 mx-auto mb-3" />
            <p className="text-neutral-400 font-semibold">Tidak ada produk yang cocok dengan pencarian.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProducts.map((p) => {
              const mainMedia = p.media?.find((m) => m.is_primary) || p.media?.[0];
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedProduct(p)}
                  className="group bg-[#121214] border border-[#262626] hover:border-[#ff1b1b]/50 rounded-2xl overflow-hidden cursor-pointer transition duration-200 flex flex-col hover:-translate-y-1 shadow-lg"
                >
                  <div className="aspect-square bg-[#1a1a1c] relative overflow-hidden flex items-center justify-center">
                    {mainMedia ? (
                      <img
                        src={mainMedia.url}
                        alt={p.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      />
                    ) : (
                      <Layers className="w-12 h-12 text-neutral-700" />
                    )}
                    <span className="absolute top-3 left-3 px-2.5 py-1 bg-black/75 backdrop-blur-md rounded-md text-[10px] font-black uppercase tracking-wider text-neutral-300 border border-white/10">
                      {p.category}
                    </span>
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-white text-base group-hover:text-[#ff1b1b] transition line-clamp-1">
                        {p.name}
                      </h3>
                      <p className="text-neutral-400 text-xs mt-1.5 line-clamp-2 leading-relaxed">
                        {p.description || 'Pilihan bahan dryfit premium dengan sublimasi anti luntur.'}
                      </p>
                    </div>

                    <div className="mt-4 pt-4 border-t border-[#222] flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-neutral-500 uppercase font-semibold block">Mulai</span>
                        <strong className="text-sm font-bold text-[#d4af37]">
                          {formatRupiah(p.price)}
                        </strong>
                      </div>
                      <span className="text-xs font-semibold text-neutral-400 group-hover:text-white flex items-center gap-1">
                        Detail <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. Product Detail Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#121214] border border-[#333] rounded-2xl max-w-2xl w-full p-6 sm:p-8 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelectedProduct(null)}
              className="absolute top-5 right-5 text-neutral-400 hover:text-white p-2 rounded-lg bg-[#222]"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="aspect-square bg-[#1a1a1c] rounded-xl overflow-hidden flex items-center justify-center">
                {selectedProduct.media?.[0] ? (
                  <img
                    src={selectedProduct.media[0].url}
                    alt={selectedProduct.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Layers className="w-16 h-16 text-neutral-700" />
                )}
              </div>

              <div className="flex flex-col justify-between">
                <div>
                  <span className="px-2.5 py-1 bg-[#ff1b1b]/10 text-[#ff1b1b] border border-[#ff1b1b]/20 rounded text-[10px] font-black uppercase tracking-wider inline-block mb-3">
                    {selectedProduct.category}
                  </span>
                  <h2 className="text-2xl font-black uppercase text-white mb-2">{selectedProduct.name}</h2>
                  <div className="text-xl font-bold text-[#d4af37] mb-4">
                    {formatRupiah(selectedProduct.price)} <span className="text-xs text-neutral-400 font-normal">/ pcs</span>
                  </div>
                  <p className="text-sm text-neutral-300 leading-relaxed mb-4">
                    {selectedProduct.description || 'Pilihan bahan premium dengan garansi warna sublimasi presisi.'}
                  </p>

                  {selectedProduct.materials && selectedProduct.materials.length > 0 && (
                    <div className="mb-4">
                      <span className="text-xs uppercase font-bold text-neutral-400 block mb-2">Pilihan Bahan:</span>
                      <div className="flex flex-wrap gap-2">
                        {selectedProduct.materials.map((m, idx) => (
                          <span key={idx} className="px-2.5 py-1 rounded bg-[#222] text-xs text-neutral-300 font-medium">
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <a
                  href={getWhatsappUrl(`Halo IMPOSSIBLE APPAREL, saya tertarik dengan produk ${selectedProduct.name}.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 w-full py-3.5 bg-[#ff1b1b] hover:bg-[#e01616] text-white font-bold text-sm uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-[#ff1b1b]/20"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Pesan Sekarang via WhatsApp</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Order Tracking & Customer Portal Section */}
      <section id="order" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 border-b border-[#222]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          <div className="lg:col-span-5">
            <span className="text-[#ff1b1b] text-xs font-black tracking-[0.25em] uppercase block mb-2">
              PORTAL CUSTOMER
            </span>
            <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white mb-4">
              Cek Tracking & Dokumen Invoice
            </h2>
            <p className="text-neutral-400 text-sm leading-relaxed mb-6">
              Pantau progres produksi jersey Anda secara real-time. Cukup masukkan Nomor SPK dan Kode Akses unik 8 karakter yang telah diberikan oleh admin kami.
            </p>

            <div className="p-4 rounded-xl bg-[#141416] border border-[#2a2a2a] text-xs text-neutral-400 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-[#13a45a] shrink-0 mt-0.5" />
              <div>
                <strong className="text-white block font-semibold mb-1">Akses Aman & Terisolasi</strong>
                <span>Setiap SPK memiliki kode akses mandiri. Data rahasia seperti HPP tidak pernah dipublikasikan.</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            {!customerData ? (
              /* Customer Login Box */
              <div className="bg-[#121214] border border-[#2a2a2a] rounded-2xl p-6 sm:p-8 shadow-xl">
                <h3 className="text-xl font-black uppercase text-white mb-2">Masuk ke Pesanan Anda</h3>
                <p className="text-xs text-neutral-400 mb-6">Masukkan informasi SPK untuk melihat rincian.</p>

                {customerError && (
                  <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-600/50 text-red-200 text-xs">
                    {customerError}
                  </div>
                )}

                <form onSubmit={handleCustomerLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs uppercase font-bold text-neutral-400 mb-1.5">
                      Nomor SPK
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: SPK-20261120-26555"
                      value={spkInput}
                      onChange={(e) => setSpkInput(e.target.value)}
                      className="w-full px-4 py-3 bg-[#18181b] border border-[#333] rounded-xl text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-[#ff1b1b]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs uppercase font-bold text-neutral-400 mb-1.5">
                      Kode Akses Customer (8 Karakter)
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: F96BEFD3"
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value)}
                      className="w-full px-4 py-3 bg-[#18181b] border border-[#333] rounded-xl text-sm text-white placeholder-neutral-500 font-mono tracking-widest focus:outline-none focus:border-[#ff1b1b]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={customerLoading}
                    className="w-full py-3.5 bg-[#ff1b1b] hover:bg-[#e01616] text-white font-bold text-sm uppercase tracking-wider rounded-xl transition duration-150 disabled:opacity-50"
                  >
                    {customerLoading ? 'Memeriksa Akses...' : 'Buka Pesanan Saya'}
                  </button>
                </form>
              </div>
            ) : (
              /* Customer Order Detail Portal */
              <div className="bg-[#121214] border border-[#2a2a2a] rounded-2xl p-6 sm:p-8 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-[#222] gap-4">
                  <div>
                    <span className="text-xs uppercase font-bold text-[#ff1b1b] tracking-wider block">
                      SPK TERVERIFIKASI
                    </span>
                    <h3 className="text-2xl font-black text-white">{customerData.spk}</h3>
                    <p className="text-xs text-neutral-400 mt-1">
                      Customer: <strong className="text-white">{customerData.customer}</strong> · {customerData.product} ({customerData.qty} pcs)
                    </p>
                  </div>
                  <button
                    onClick={handleCustomerLogout}
                    className="px-4 py-2 rounded-lg bg-[#222] hover:bg-[#333] text-xs uppercase tracking-wider font-semibold text-neutral-300"
                  >
                    Keluar
                  </button>
                </div>

                {/* Progress bar */}
                <div className="my-6 p-5 rounded-xl bg-[#18181b] border border-[#282828]">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs uppercase font-bold text-neutral-400">Status Produksi</span>
                    <span className="text-xs font-black px-2.5 py-1 rounded bg-[#13a45a]/20 text-[#13a45a] uppercase">
                      {customerData.stage} ({customerData.progress}%)
                    </span>
                  </div>
                  <div className="w-full h-3 bg-[#262626] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#ff1b1b] to-[#13a45a] transition-all duration-500"
                      style={{ width: `${customerData.progress}%` }}
                    />
                  </div>
                </div>

                {/* History Timeline */}
                <div className="mb-6">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">
                    Riwayat Tahapan Produksi
                  </h4>
                  <div className="space-y-3">
                    {customerData.history && customerData.history.length > 0 ? (
                      customerData.history.map((step, idx) => (
                        <div key={idx} className="flex items-start gap-3 text-xs bg-[#161618] p-3 rounded-lg border border-[#262626]">
                          <CheckCircle2 className="w-4 h-4 text-[#13a45a] shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <strong className="text-white block font-semibold">{step.stage} ({step.progress}%)</strong>
                            {step.note && <span className="text-neutral-400 block mt-0.5">{step.note}</span>}
                          </div>
                          <span className="text-[10px] text-neutral-500 whitespace-nowrap">
                            {formatDate(step.created_at)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-neutral-500">Belum ada catatan tahapan lanjutan.</p>
                    )}
                  </div>
                </div>

                {/* Invoice & Payment Info */}
                {customerData.invoice && (
                  <div className="pt-6 border-t border-[#222]">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#18181b] border border-[#2a2a2a]">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-neutral-400 block">Dokumen Tagihan</span>
                        <div className="text-sm font-bold text-white mt-0.5">
                          {customerData.invoice.invoice_no} —{' '}
                          <span className="text-[#13a45a]">{customerData.invoice.payment_status}</span>
                        </div>
                        <div className="text-xs text-neutral-400 mt-1">
                          Total: <strong className="text-white">{formatRupiah(customerData.invoice.total)}</strong> · Dibayar: {formatRupiah(customerData.invoice.paid)}
                        </div>
                      </div>

                      <button
                        onClick={() => handleDownloadInvoicePdf(customerData.invoice!.id)}
                        className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#ff1b1b] hover:bg-[#e01616] text-white text-xs font-bold uppercase tracking-wider transition shadow-md shadow-[#ff1b1b]/20"
                      >
                        <Download className="w-4 h-4" />
                        <span>Unduh PDF Invoice</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 7. Tentang Kami */}
      <section id="tentang" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 border-b border-[#222]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <span className="text-[#ff1b1b] text-xs font-black tracking-[0.25em] uppercase block mb-2">
              {settings.about_kicker || 'TENTANG KAMI'}
            </span>
            <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-white mb-6">
              {settings.about_title || 'DIBUAT UNTUK IDENTITAS ANDA.'}
            </h2>
            <p className="text-neutral-400 text-base leading-relaxed mb-8">
              {settings.about_text ||
                'IMPOSSIBLE APPAREL hadir memadukan kreativitas grafis dengan teknologi sublimasi kain tercanggih. Setiap helai pakaian dikerjakan oleh tim berpengalaman dengan standar kontrol kualitas ketat demi kenyamanan dan ketahanan maksimal.'}
            </p>

            <div className="grid grid-cols-3 gap-4 border-t border-[#222] pt-6">
              <div>
                <strong className="text-2xl font-black text-[#ff1b1b]">01</strong>
                <p className="text-xs font-bold text-neutral-300 uppercase mt-1">Desain Terarah</p>
              </div>
              <div>
                <strong className="text-2xl font-black text-[#d4af37]">02</strong>
                <p className="text-xs font-bold text-neutral-300 uppercase mt-1">Produksi Terpantau</p>
              </div>
              <div>
                <strong className="text-2xl font-black text-[#13a45a]">03</strong>
                <p className="text-xs font-bold text-neutral-300 uppercase mt-1">Hasil Berkualitas</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#2a2a2a] bg-[#121214] p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-[#ff1b1b]/10 blur-3xl rounded-full pointer-events-none" />
            <h3 className="text-xl font-black uppercase text-white mb-4">Mengapa Memilih Kami?</h3>
            <ul className="space-y-4 text-sm text-neutral-300">
              <li className="flex items-start gap-3">
                <CheckCheck className="w-5 h-5 text-[#ff1b1b] shrink-0" />
                <span>Teknologi sublimasi anti-luntur dengan ketajaman warna tinggi.</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCheck className="w-5 h-5 text-[#ff1b1b] shrink-0" />
                <span>Bahan dryfit lembut, adem, cepat kering (quick-dry), dan elastis.</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCheck className="w-5 h-5 text-[#ff1b1b] shrink-0" />
                <span>Transparansi alur SPK: Customer dapat melihat progres pengerjaan via web.</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCheck className="w-5 h-5 text-[#ff1b1b] shrink-0" />
                <span>Dokumen legal resmi: Invoice & Kwitansi PDF berstandar rapi.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 8. Lokasi Section */}
      <section id="lokasi" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 border-b border-[#222]">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-[#ff1b1b] text-xs font-black tracking-[0.25em] uppercase block mb-2">
            KUNJUNGI KAMI
          </span>
          <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white mb-3">
            Lokasi Workshop Impossible Apparel
          </h2>
          <p className="text-neutral-400 text-sm">
            Datang langsung ke workshop kami untuk melihat sampel bahan, fitting ukuran jersey, atau konsultasi desain bersama tim.
          </p>
        </div>

        <div className="rounded-2xl overflow-hidden border border-[#2a2a2a] shadow-2xl mb-8 h-[400px]">
          <iframe
            title="Peta lokasi Impossible Apparel"
            src="https://maps.google.com/maps?q=-6.6518483,108.2188568&z=17&output=embed"
            className="w-full h-full border-0"
            loading="lazy"
            allowFullScreen
          />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <a
            href="https://www.google.com/maps/dir/?api=1&destination=-6.6518483%2C108.2188568"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 rounded-xl bg-[#ff1b1b] hover:bg-[#e01616] text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-[#ff1b1b]/20"
          >
            <MapPin className="w-4 h-4" />
            <span>Petunjuk Arah</span>
          </a>
          <a
            href="https://www.google.com/maps/search/?api=1&query=-6.6518483%2C108.2188568"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 rounded-xl bg-[#18181b] hover:bg-[#222] border border-[#333] text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Buka Google Maps</span>
          </a>
        </div>
      </section>

      {/* 9. Public Footer */}
      <footer className="bg-[#060607] py-12 border-t border-[#1a1a1a]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <img
              src="/assets/impossible-logo.png"
              alt="IMPOSSIBLE APPAREL"
              className="h-10 w-auto object-contain"
            />
            <div>
              <strong className="block text-sm font-black tracking-wide text-white">
                {settings.brand_name || 'IMPOSSIBLE APPAREL'}
              </strong>
              <small className="text-neutral-500 text-xs">
                {settings.address || 'Custom Apparel & Jersey Production.'}
              </small>
            </div>
          </div>

          <p className="text-neutral-600 text-xs">
            © {new Date().getFullYear()} IMPOSSIBLE APPAREL. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};
