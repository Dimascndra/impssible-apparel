import React, { useState, useEffect, useRef } from 'react';
import { apiClient, formatRupiah, formatDate } from '../api/client';
import { CatalogProduct, WebsiteSettings } from '../types';

interface CustomerSummary {
  job: {
    spk: string;
    customer: string;
    product: string;
    qty: number;
    deadline?: string;
    production: {
      stage: string;
    };
  };
  stages: string[];
  history: Array<{
    stage: string;
    note?: string;
    created_at: string;
  }>;
  invoices: Array<{
    id: number;
    invoice_no: string;
    total: number;
    paid: number;
    balance: number;
    payment_status: string;
    items: Array<{
      description: string;
      qty: number;
      price: number;
    }>;
    payments: Array<{
      date: string;
      method: string;
      amount: number;
    }>;
  }>;
}

export const PublicLanding: React.FC = () => {
  const [splashLeaving, setSplashLeaving] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);

  const [settings, setSettings] = useState<WebsiteSettings>({});
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('SEMUA');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [selectedProductImage, setSelectedProductImage] = useState<string>('');

  // Hero Slider
  const [heroIndex, setHeroIndex] = useState(0);
  const heroTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Customer Tracking State
  const [spkInput, setSpkInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [customerData, setCustomerData] = useState<CustomerSummary | null>(null);

  // Live order activities
  const [activities, setActivities] = useState<Array<{ id: number; message: string; created_at?: string }>>([]);

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Welcome splash dismiss
  const dismissSplash = () => {
    if (splashLeaving) return;
    setSplashLeaving(true);
    setTimeout(() => setSplashHidden(true), 720);
  };

  useEffect(() => {
    const timer = setTimeout(dismissSplash, 2650);
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
        if (catRes.settings) {
          setSettings(catRes.settings);
          if (catRes.settings.primary_color) {
            document.documentElement.style.setProperty('--public-primary', catRes.settings.primary_color);
          }
          if (catRes.settings.background_color) {
            document.documentElement.style.setProperty('--public-dark', catRes.settings.background_color);
          }
        }
      } catch (err) {
        console.error('Failed to load catalog:', err);
      }

      try {
        const actRes = await apiClient<{ activities?: Array<{ id: number; message: string; created_at?: string }>; events?: Array<{ id: number; message: string; created_at?: string }> }>(
          '/api/public/activity'
        );
        const list = actRes.activities || actRes.events || [];
        if (list.length) setActivities(list);
      } catch {
        // Optional ticker
      }

      // Check existing customer session
      try {
        const custRes = await apiClient<CustomerSummary>('/api/public/customer/summary');
        if (custRes?.job) setCustomerData(custRes);
      } catch {
        // Not logged in as customer
      }
    }
    loadData();
  }, []);

  // Hero Slider Autoplay
  const heroMedia = Array.isArray(settings.hero_media) ? settings.hero_media : [];
  useEffect(() => {
    if (heroMedia.length <= 1) return;
    const intervalSec = Math.max(3, Number(settings.hero_interval_seconds) || 6);
    heroTimerRef.current = setTimeout(() => {
      setHeroIndex((prev) => (prev + 1) % heroMedia.length);
    }, intervalSec * 1000);

    return () => {
      if (heroTimerRef.current) clearTimeout(heroTimerRef.current);
    };
  }, [heroIndex, heroMedia, settings.hero_interval_seconds]);

  const categories = ['SEMUA', ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];

  const filteredProducts = products.filter((p) => {
    const matchCat = selectedCategory === 'SEMUA' || p.category === selectedCategory;
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.short_description || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const getWhatsappUrl = (text?: string) => {
    const phone = (settings.whatsapp || '083189095042').replace(/\D/g, '').replace(/^0/, '62');
    const msg = text || 'Halo IMPOSSIBLE APPAREL, saya ingin konsultasi produk custom.';
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  };

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
      showToast('Akses pesanan terbuka.');
    } catch (err: any) {
      setCustomerError(err.message || 'Nomor SPK atau Kode Akses tidak valid.');
    } finally {
      setCustomerLoading(false);
    }
  };

  const handleCustomerLogout = async () => {
    try {
      await apiClient('/api/public/customer/logout', { method: 'POST', body: '{}' });
    } catch {
      // ignore
    }
    setCustomerData(null);
    setSpkInput('');
    setCodeInput('');
    showToast('Berhasil keluar dari portal customer.');
  };

  const downloadCustomerPdf = async (id: number) => {
    try {
      const response = await fetch(`/api/public/customer/invoices/${id}/pdf`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'PDF gagal dibuat.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `INVOICE-${id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (err: any) {
      showToast(err.message || 'Gagal mengunduh invoice.');
    }
  };

  const openProductModal = (p: CatalogProduct) => {
    setSelectedProduct(p);
    setSelectedProductImage(p.cover?.url || p.gallery?.[0]?.url || '');
    document.body.classList.add('modal-open');
  };

  const closeProductModal = () => {
    setSelectedProduct(null);
    document.body.classList.remove('modal-open');
  };

  const firstHeroImage = heroMedia.find((item) => item.media_type === 'image');
  const aboutBackgroundUrl =
    settings.about_background?.url || settings.background?.url || firstHeroImage?.url || '';

  return (
    <>
      {/* 1. Welcome Splash */}
      {!splashHidden && (
        <div
          className={`welcome-splash ${splashLeaving ? 'leaving' : ''}`}
          id="welcomeSplash"
          aria-label="Selamat datang di IMPOSSIBLE APPAREL"
        >
          <div className="welcome-grid" aria-hidden="true" />
          <div className="welcome-stage">
            <span className="welcome-kicker">WELCOME TO</span>
            <div className="welcome-logo-frame">
              <span className="welcome-orbit one" aria-hidden="true" />
              <span className="welcome-orbit two" aria-hidden="true" />
              <img
                id="welcomeLogo"
                src={settings.logo?.url || '/assets/impossible-logo.png'}
                alt="IMPOSSIBLE APPAREL"
              />
            </div>
            <div className="welcome-progress" aria-hidden="true">
              <i />
            </div>
            <span className="welcome-caption">CUSTOM APPAREL EXPERIENCE</span>
          </div>
          <button className="welcome-skip" id="welcomeSkip" type="button" onClick={dismissSplash}>
            Lewati
          </button>
        </div>
      )}

      {/* 2. Public Header */}
      <header
        className="public-header"
        style={
          settings.nav_background?.url
            ? ({ '--public-header-image': `url("${settings.nav_background.url}")` } as React.CSSProperties)
            : undefined
        }
      >
        <a className="public-brand" href="#home" aria-label="IMPOSSIBLE APPAREL">
          <img
            id="siteLogo"
            src={settings.logo?.url || '/assets/impossible-logo.png'}
            alt="IMPOSSIBLE APPAREL"
          />
        </a>
        <nav aria-label="Navigasi website">
          <a href="#home">Home</a>
          <a href="#catalog">Katalog</a>
          <a href="#order">Tracking &amp; Invoice</a>
          <a href="#tentang">Tentang Kami</a>
          <a href="#lokasi">Lokasi</a>
        </nav>
        <a
          className="header-contact"
          id="headerWhatsapp"
          href={getWhatsappUrl()}
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.5 3.5A11.8 11.8 0 0 0 12.1 0C5.6 0 .3 5.3.3 11.8c0 2.1.6 4.1 1.6 5.9L.2 24l6.5-1.7c1.7.9 3.6 1.4 5.5 1.4 6.5 0 11.8-5.3 11.8-11.8 0-3.2-1.2-6.1-3.5-8.4Zm-8.3 18.2c-1.7 0-3.4-.5-4.9-1.3l-.4-.2-3.8 1 1-3.7-.2-.4a9.8 9.8 0 1 1 8.3 4.6Zm5.4-7.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-1.8-.9-3-1.6-4.2-3.7-.3-.5.3-.5.9-1.7.1-.2.1-.4 0-.6l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.2-1.2 2.9s1.2 3.3 1.4 3.6c.2.2 2.5 3.8 6 5.3 2.2.9 3.1 1 4.2.8.7-.1 1.7-.7 1.9-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.7-.3Z" />
          </svg>
          <span>WhatsApp</span>
        </a>
      </header>

      {/* 3. Main Content */}
      <main>
        {/* Hero Section */}
        <section
          className="public-hero"
          id="home"
          style={
            settings.background?.url ? { backgroundImage: `url("${settings.background.url}")` } : undefined
          }
        >
          <div className="hero-media-stage" id="heroMediaStage">
            {heroMedia.map((item, idx) => (
              <div
                key={item.id || idx}
                className={`hero-media-slide ${idx === heroIndex ? 'active' : ''}`}
                data-hero-slide={idx}
              >
                {item.media_type === 'video' ? (
                  <video src={item.url} muted playsInline autoPlay={idx === heroIndex} loop />
                ) : (
                  <img src={item.url} alt="" fetchPriority={idx === 0 ? 'high' : 'auto'} />
                )}
              </div>
            ))}
          </div>
          <div className="hero-overlay" />
          <div className="hero-content">
            <span>IMPOSSIBLE APPAREL · CUSTOM PRODUCTION</span>
            <h1 id="heroTitle">{settings.hero_title || 'CUSTOM APPAREL, BUILT FOR YOUR IDENTITY.'}</h1>
            <p id="heroText">
              {settings.hero_text ||
                'Jersey, apparel, dan kebutuhan custom yang diproduksi dengan detail dari desain hingga selesai.'}
            </p>
            <div className="hero-actions">
              <a className="public-btn primary" href="#catalog">
                Lihat Katalog
              </a>
              <a className="public-btn ghost" href="#order">
                Cek Pesanan
              </a>
            </div>
          </div>
          <aside className="hero-status">
            <strong>TRANSPARENT WORKFLOW</strong>
            <div>
              <span>01</span> Desain
            </div>
            <div>
              <span>02</span> Produksi
            </div>
            <div>
              <span>03</span> Quality Control
            </div>
            <div>
              <span>04</span> Selesai
            </div>
          </aside>
          {heroMedia.length > 1 && (
            <div className="hero-slider-controls" id="heroSliderControls">
              <button
                id="heroPrevious"
                type="button"
                aria-label="Media sebelumnya"
                onClick={() => setHeroIndex((prev) => (prev - 1 + heroMedia.length) % heroMedia.length)}
              >
                ←
              </button>
              <div id="heroDots">
                {heroMedia.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={idx === heroIndex ? 'active' : ''}
                    onClick={() => setHeroIndex(idx)}
                    aria-label={`Tampilkan media ${idx + 1}`}
                  />
                ))}
              </div>
              <button
                id="heroNext"
                type="button"
                aria-label="Media berikutnya"
                onClick={() => setHeroIndex((prev) => (prev + 1) % heroMedia.length)}
              >
                →
              </button>
            </div>
          )}
        </section>

        {/* Catalog Section */}
        <section className="catalog-section" id="catalog">
          <div className="public-section-head">
            <div>
              <span>KATALOG PRODUK</span>
              <h2 id="catalogTitle">{settings.catalog_title || 'Katalog Impossible'}</h2>
            </div>
            <p>Pilih kategori dan lihat spesifikasi produk yang dapat dibuat sesuai kebutuhan.</p>
          </div>
          <div className="catalog-toolbar">
            <div className="category-tabs" id="categoryTabs">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={cat === selectedCategory ? 'active' : ''}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
            <label className="catalog-search">
              <span>Cari</span>
              <input
                id="catalogSearch"
                type="search"
                placeholder="Nama produk, bahan, atau kategori…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </label>
          </div>

          <div className="catalog-grid" id="catalogGrid">
            {filteredProducts.length === 0 ? (
              <div className="public-empty">
                <strong>{products.length ? 'Produk tidak ditemukan' : 'Katalog segera hadir'}</strong>
                <p>
                  {products.length
                    ? 'Coba kategori atau kata pencarian lain.'
                    : 'Admin belum menerbitkan produk katalog.'}
                </p>
              </div>
            ) : (
              filteredProducts.map((p) => {
                const coverUrl = p.cover?.url || p.gallery?.[0]?.url;
                return (
                  <article
                    key={p.id}
                    className="catalog-card"
                    onClick={() => openProductModal(p)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="catalog-image">
                      {coverUrl ? (
                        <img src={coverUrl} alt={p.name} loading="lazy" />
                      ) : (
                        <div className="product-placeholder">
                          <span>IA</span>
                          <strong>{p.name}</strong>
                        </div>
                      )}
                      {p.badge && <span className="product-badge">{p.badge}</span>}
                    </div>
                    <div className="catalog-card-body">
                      <span>{p.category}</span>
                      <h3>{p.name}</h3>
                      <p>{p.short_description || 'Produk custom sesuai kebutuhan Anda.'}</p>
                      <div className="catalog-card-foot">
                        <strong>
                          {settings.show_prices !== false
                            ? p.price
                              ? `Mulai ${formatRupiah(p.price)}`
                              : 'Hubungi kami'
                            : 'Harga konsultasi'}
                        </strong>
                        <button type="button" aria-label={`Lihat detail ${p.name}`}>
                          Lihat detail →
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        {/* Customer Portal / Order Tracking Section */}
        <section className="order-section" id="order">
          <div className="order-intro">
            <span>PORTAL CUSTOMER</span>
            <h2>Cek tracking dan invoice.</h2>
            <p>
              Masukkan nomor SPK serta kode akses yang diberikan Admin. Data yang terlihat hanya milik
              pesanan tersebut.
            </p>
            <div className="privacy-note">
              <strong>Akses aman per pesanan</strong>
              <small>Kode akses berbeda untuk setiap SPK dan bisa diperbarui oleh Admin.</small>
            </div>
          </div>
          <div className="customer-access">
            {!customerData ? (
              <form id="customerLoginForm" className="customer-login-card" onSubmit={handleCustomerLogin}>
                <div>
                  <span>AKSES PESANAN</span>
                  <h3>Masuk ke pesanan Anda</h3>
                </div>
                <label>
                  Nomor SPK
                  <input
                    name="spk"
                    autoComplete="username"
                    placeholder="Contoh: SPK-20261015-90875"
                    value={spkInput}
                    onChange={(e) => setSpkInput(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Kode Akses
                  <input
                    name="code"
                    autoComplete="current-password"
                    placeholder="8 digit kode customer"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    required
                  />
                </label>
                <button
                  className="public-btn primary wide"
                  id="customerLoginButton"
                  type="submit"
                  disabled={customerLoading}
                >
                  {customerLoading ? 'Memeriksa…' : 'Buka Pesanan'}
                </button>
                {customerError && <p className="form-message" style={{ color: '#ff3b30' }}>{customerError}</p>}
              </form>
            ) : (
              <section className="customer-portal" id="customerPortal">
                <div className="portal-customer-head">
                  <div>
                    <span>PESANAN CUSTOMER</span>
                    <h3>{customerData.job.spk}</h3>
                    <p>
                      {customerData.job.customer} · {customerData.job.product} · {customerData.job.qty} pcs
                    </p>
                  </div>
                  <button className="public-btn light" type="button" onClick={handleCustomerLogout}>
                    Keluar
                  </button>
                </div>

                <div className="customer-summary">
                  <article>
                    <span>Status Produksi</span>
                    <strong>{customerData.job.production.stage}</strong>
                    <small>
                      {Math.round(
                        ((customerData.stages.indexOf(customerData.job.production.stage) + 1) /
                          customerData.stages.length) *
                          100
                      )}
                      % selesai
                    </small>
                  </article>
                  <article>
                    <span>Total Invoice</span>
                    <strong>
                      {formatRupiah(customerData.invoices.reduce((s, inv) => s + inv.total, 0))}
                    </strong>
                    <small>{customerData.invoices.length} dokumen</small>
                  </article>
                  <article>
                    <span>Sudah Dibayar</span>
                    <strong>
                      {formatRupiah(customerData.invoices.reduce((s, inv) => s + inv.paid, 0))}
                    </strong>
                    <small>
                      Sisa {formatRupiah(customerData.invoices.reduce((s, inv) => s + inv.balance, 0))}
                    </small>
                  </article>
                </div>

                <section className="tracking-public">
                  <div className="portal-section-title">
                    <h4>Tracking Produksi</h4>
                    <span>
                      Estimasi selesai{' '}
                      {customerData.job.deadline ? formatDate(customerData.job.deadline) : 'menunggu konfirmasi'}
                    </span>
                  </div>
                  <div className="stage-track">
                    {customerData.stages.map((stage) => {
                      const isDone =
                        customerData.stages.indexOf(stage) <=
                        customerData.stages.indexOf(customerData.job.production.stage);
                      return (
                        <div key={stage} className={isDone ? 'done' : ''}>
                          <i />
                          <span>{stage}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="public-timeline">
                    {customerData.history.length ? (
                      customerData.history.map((item, idx) => (
                        <article key={idx}>
                          <i />
                          <div>
                            <strong>{item.stage}</strong>
                            <p>{item.note || 'Proses diperbarui.'}</p>
                            <small>{formatDate(item.created_at)}</small>
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="public-empty">
                        <strong>Produksi belum dimulai</strong>
                        <p>Pembaruan proses akan tampil di sini.</p>
                      </div>
                    )}
                  </div>
                </section>

                <section className="invoice-public">
                  <div className="portal-section-title">
                    <h4>Invoice &amp; Pembayaran</h4>
                    <span>Dokumen untuk {customerData.job.spk}</span>
                  </div>
                  {customerData.invoices.length ? (
                    customerData.invoices.map((inv) => (
                      <article key={inv.id} className="public-invoice">
                        <div className="invoice-public-head">
                          <div>
                            <span>{inv.invoice_no}</span>
                            <strong>{inv.payment_status}</strong>
                          </div>
                          <button
                            className="public-btn light"
                            type="button"
                            onClick={() => downloadCustomerPdf(inv.id)}
                          >
                            Unduh PDF
                          </button>
                        </div>
                        <div className="invoice-public-total">
                          <div>
                            <span>Total</span>
                            <strong>{formatRupiah(inv.total)}</strong>
                          </div>
                          <div>
                            <span>Dibayar</span>
                            <strong>{formatRupiah(inv.paid)}</strong>
                          </div>
                          <div>
                            <span>Sisa</span>
                            <strong>{formatRupiah(inv.balance)}</strong>
                          </div>
                        </div>
                        <div className="invoice-public-items">
                          {inv.items.map((it, itIdx) => (
                            <div key={itIdx}>
                              <span>
                                {it.description} · {it.qty} pcs
                              </span>
                              <strong>{formatRupiah(it.qty * it.price)}</strong>
                            </div>
                          ))}
                        </div>
                        {inv.payments.length ? (
                          <div className="payment-history">
                            <h5>Riwayat Pembayaran</h5>
                            {inv.payments.map((pm, pmIdx) => (
                              <div key={pmIdx}>
                                <span>
                                  {formatDate(pm.date)} · {pm.method}
                                </span>
                                <strong>{formatRupiah(pm.amount)}</strong>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="unpaid-note">Belum ada pembayaran tercatat.</p>
                        )}
                      </article>
                    ))
                  ) : (
                    <div className="public-empty">
                      <strong>Invoice belum dibuat</strong>
                      <p>Invoice akan tampil setelah dibuat oleh Admin.</p>
                    </div>
                  )}
                </section>
              </section>
            )}
          </div>
        </section>

        {/* About Section */}
        {settings.show_about !== false && (
          <section className="about-section" id="tentang" aria-labelledby="aboutTitle">
            <div className="about-motion-window" aria-hidden="true">
              <div
                className="about-motion-photo"
                id="aboutMotionPhoto"
                style={aboutBackgroundUrl ? { backgroundImage: `url("${aboutBackgroundUrl}")` } : undefined}
              />
              <div className="about-motion-shade" />
            </div>
            <div className="about-copy">
              <span id="aboutKicker">{settings.about_kicker || 'TENTANG KAMI'}</span>
              <h2 id="aboutTitle">{settings.about_title || 'DIBUAT UNTUK IDENTITAS ANDA.'}</h2>
              <p id="aboutText">
                {settings.about_text ||
                  'IMPOSSIBLE APPAREL membantu mewujudkan jersey dan apparel custom dari tahap desain, pemilihan bahan, produksi, hingga quality control.'}
              </p>
              <div className="about-values">
                <div>
                  <strong>01</strong>
                  <span>Desain terarah</span>
                </div>
                <div>
                  <strong>02</strong>
                  <span>Produksi terpantau</span>
                </div>
                <div>
                  <strong>03</strong>
                  <span>Hasil berkualitas</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Location Section */}
        <section className="location-section" id="lokasi" aria-labelledby="locationTitle">
          <div className="public-section-head">
            <div>
              <span>KUNJUNGI KAMI</span>
              <h2 id="locationTitle">Lokasi Impossible Apparel</h2>
            </div>
            <p>Temukan lokasi kami dan buka petunjuk arah untuk berkunjung.</p>
          </div>
          <iframe
            className="location-map"
            title="Peta lokasi Impossible Apparel"
            src="https://maps.google.com/maps?q=-6.6518483,108.2188568&amp;z=17&amp;output=embed"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
          <div className="location-actions">
            <a
              className="public-btn primary"
              href="https://www.google.com/maps/dir/?api=1&amp;destination=-6.6518483%2C108.2188568"
              target="_blank"
              rel="noopener noreferrer"
            >
              Petunjuk Arah
            </a>
            <a
              className="public-btn"
              href="https://www.google.com/maps/search/?api=1&amp;query=-6.6518483%2C108.2188568"
              target="_blank"
              rel="noopener noreferrer"
            >
              Buka Google Maps
            </a>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="public-footer">
        <img
          src={settings.logo?.url || '/assets/impossible-logo.png'}
          alt="IMPOSSIBLE APPAREL"
        />
        <div>
          <strong id="footerBrand">{settings.brand_name || 'IMPOSSIBLE APPAREL'}</strong>
          <p id="footerAddress">{settings.address || 'Custom apparel production.'}</p>
        </div>
        {settings.instagram && (
          <a
            id="footerInstagram"
            href={
              settings.instagram.startsWith('http')
                ? settings.instagram
                : `https://instagram.com/${settings.instagram.replace(/^@/, '')}`
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            Instagram
          </a>
        )}
      </footer>

      {/* Live Order Ticker */}
      {settings.show_order_ticker !== false && activities.length > 0 && (
        <section className="public-live-ticker" id="liveOrderTicker" aria-label="Aktivitas order terbaru">
          <div className="ticker-label">
            <i />
            <span id="tickerLabel">{settings.ticker_label || 'LIVE ORDER'}</span>
          </div>
          <div className="ticker-window" id="tickerWindow">
            <div className="ticker-track" id="tickerTrack">
              <div className="ticker-sequence">
                {activities.map((item, idx) => (
                  <span key={idx} className="ticker-item">
                    <i />
                    <span>{item.message}</span>
                  </span>
                ))}
              </div>
              <div className="ticker-sequence" aria-hidden="true">
                {activities.map((item, idx) => (
                  <span key={`dup-${idx}`} className="ticker-item">
                    <i />
                    <span>{item.message}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div className="product-modal" id="productModal" onClick={closeProductModal}>
          <article className="product-dialog" id="productDialog" onClick={(e) => e.stopPropagation()}>
            <button className="product-close" id="closeProduct" type="button" aria-label="Tutup" onClick={closeProductModal}>
              ×
            </button>
            <div className="product-detail-media">
              <div id="productMainImage">
                {selectedProductImage ? (
                  <img className="detail-main" src={selectedProductImage} alt={selectedProduct.name} />
                ) : (
                  <div className="product-placeholder detail-main">
                    <span>IA</span>
                    <strong>{selectedProduct.name}</strong>
                  </div>
                )}
              </div>
              {selectedProduct.gallery && selectedProduct.gallery.length > 0 && (
                <div className="product-thumbs">
                  {[selectedProduct.cover, ...selectedProduct.gallery].filter(Boolean).map((img, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedProductImage(img!.url)}
                      aria-label={`Gambar ${idx + 1}`}
                    >
                      <img src={img!.url} alt="" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="product-detail-copy">
              <span>{selectedProduct.category}</span>
              <h2>{selectedProduct.name}</h2>
              <p className="lead">{selectedProduct.short_description}</p>
              {settings.show_prices !== false && (
                <div className="product-price">
                  {selectedProduct.price ? formatRupiah(selectedProduct.price) : 'Konsultasikan harga'}
                  <small>Harga awal per produk</small>
                </div>
              )}
              <div className="product-facts">
                <div>
                  <span>Minimal order</span>
                  <strong>{selectedProduct.min_order || 1} pcs</strong>
                </div>
                <div>
                  <span>Estimasi produksi</span>
                  <strong>
                    {selectedProduct.production_days ? `${selectedProduct.production_days} hari` : 'Konfirmasi Admin'}
                  </strong>
                </div>
              </div>
              {selectedProduct.description && (
                <section>
                  <h3>Deskripsi</h3>
                  <p>{selectedProduct.description}</p>
                </section>
              )}
              {selectedProduct.materials && selectedProduct.materials.length > 0 && (
                <section>
                  <h3>Pilihan bahan</h3>
                  <div className="chip-list">
                    {selectedProduct.materials.map((m, idx) => (
                      <span key={idx}>{m.name}</span>
                    ))}
                  </div>
                </section>
              )}
              {selectedProduct.sizes && selectedProduct.sizes.length > 0 && (
                <section>
                  <h3>Ukuran tersedia</h3>
                  <div className="chip-list">
                    {selectedProduct.sizes.map((s, idx) => (
                      <span key={idx}>{s}</span>
                    ))}
                  </div>
                </section>
              )}
              {selectedProduct.specifications && (
                <section>
                  <h3>Spesifikasi</h3>
                  <p>{selectedProduct.specifications}</p>
                </section>
              )}
              <a
                className="public-btn primary wide"
                href={getWhatsappUrl(`Halo IMPOSSIBLE APPAREL, saya tertarik dengan ${selectedProduct.name}.`)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Konsultasi via WhatsApp
              </a>
            </div>
          </article>
        </div>
      )}

      {/* Public Toast */}
      {toastMsg && (
        <div className="public-toast" id="publicToast">
          {toastMsg}
        </div>
      )}
    </>
  );
};
