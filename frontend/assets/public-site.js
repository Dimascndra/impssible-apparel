"use strict";

const IS_ADMIN_PREVIEW = location.pathname.startsWith("/website-preview");
const PUBLIC_API_BASE = IS_ADMIN_PREVIEW ? "/api/website-preview" : "/api/public";
const publicState = { settings: {}, products: [], category: "SEMUA", search: "", customer: null, heroIndex: 0, heroTimer: null, activitySignature: "" };

let welcomeTimer = null;

function closeWelcomeSplash() {
  const splash = document.getElementById("welcomeSplash");
  if (!splash || splash.classList.contains("leaving")) return;
  clearTimeout(welcomeTimer);
  splash.classList.add("leaving");
  document.body.classList.remove("welcome-active");
  document.body.classList.add("welcome-finished");
  setTimeout(() => { splash.hidden = true; }, 720);
}

function initWelcomeMotion() {
  const splash = document.getElementById("welcomeSplash");
  if (!splash) return;
  if (IS_ADMIN_PREVIEW) {
    splash.hidden = true;
    document.body.classList.add("admin-live-preview", "welcome-finished");
    return;
  }
  document.body.classList.add("welcome-active");
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  welcomeTimer = setTimeout(closeWelcomeSplash, reducedMotion ? 650 : 2650);
  document.getElementById("welcomeSkip")?.addEventListener("click", closeWelcomeSplash);
}

function escapeHtml(value) {
  const node = document.createElement("div");
  node.textContent = String(value == null ? "" : value);
  return node.innerHTML;
}

function escapeAttr(value) {
  return String(value == null ? "" : value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function rupiah(value) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function dateId(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value));
}

function activityDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

async function publicApi(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Terjadi kesalahan.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function toast(message) {
  const box = document.getElementById("publicToast");
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { box.hidden = true; }, 2800);
}

function whatsappUrl(message) {
  const number = String(publicState.settings.whatsapp || "").replace(/\D/g, "").replace(/^0/, "62");
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : "#order";
}

function applySettings() {
  const settings = publicState.settings;
  document.documentElement.style.setProperty("--public-primary", settings.primary_color || "#e32127");
  document.documentElement.style.setProperty("--public-dark", settings.background_color || "#090909");
  document.title = settings.brand_name || "IMPOSSIBLE APPAREL";
  document.getElementById("heroTitle").textContent = settings.hero_title || "CUSTOM APPAREL, BUILT FOR YOUR IDENTITY.";
  document.getElementById("heroText").textContent = settings.hero_text || "Custom apparel production.";
  document.getElementById("catalogTitle").textContent = settings.catalog_title || "Katalog Impossible";
  document.getElementById("footerBrand").textContent = settings.brand_name || "IMPOSSIBLE APPAREL";
  document.getElementById("footerAddress").textContent = settings.address || "Custom apparel production.";
  if (settings.logo?.url) document.querySelectorAll(".welcome-splash img, .public-brand img, .public-footer img").forEach(image => { image.src = settings.logo.url; });
  document.querySelector(".public-header").style.setProperty("--public-header-image", settings.nav_background?.url ? `url("${settings.nav_background.url}")` : "none");
  document.querySelector(".public-hero").style.backgroundImage = settings.background?.url ? `url("${settings.background.url}")` : "";
  const aboutSection = document.getElementById("tentang");
  const aboutVisible = settings.show_about !== false;
  aboutSection.hidden = !aboutVisible;
  document.querySelector('a[href="#tentang"]')?.toggleAttribute("hidden", !aboutVisible);
  document.getElementById("aboutKicker").textContent = settings.about_kicker || "TENTANG KAMI";
  document.getElementById("aboutTitle").textContent = settings.about_title || "DIBUAT UNTUK IDENTITAS ANDA.";
  document.getElementById("aboutText").textContent = settings.about_text || "IMPOSSIBLE APPAREL membantu mewujudkan apparel custom dari desain hingga quality control.";
  const firstHeroImage = (settings.hero_media || []).find(item => item.media_type === "image");
  const aboutBackgroundUrl = settings.about_background?.url || settings.background?.url || firstHeroImage?.url || "";
  document.getElementById("aboutMotionPhoto").style.backgroundImage = aboutBackgroundUrl ? `url("${aboutBackgroundUrl}")` : "";
  document.getElementById("tickerLabel").textContent = settings.ticker_label || "LIVE ORDER";
  if (settings.show_order_ticker === false) {
    document.getElementById("liveOrderTicker").hidden = true;
    document.body.classList.remove("ticker-active");
  }
  const whatsappLink = whatsappUrl("Halo IMPOSSIBLE APPAREL, saya ingin konsultasi produk custom.");
  const contact = document.getElementById("headerWhatsapp");
  contact.href = whatsappLink;
  contact.hidden = !settings.whatsapp;
  const instagram = document.getElementById("footerInstagram");
  if (settings.instagram) {
    instagram.hidden = false;
    instagram.href = settings.instagram.startsWith("http") ? settings.instagram : `https://instagram.com/${settings.instagram.replace(/^@/, "")}`;
  }
  renderHeroMedia();
}

function renderHeroMedia() {
  const media = Array.isArray(publicState.settings.hero_media) ? publicState.settings.hero_media : [];
  const stage = document.getElementById("heroMediaStage");
  const controls = document.getElementById("heroSliderControls");
  clearTimeout(publicState.heroTimer);
  publicState.heroTimer = null;
  publicState.heroIndex = 0;
  if (!media.length) {
    stage.innerHTML = "";
    stage.hidden = true;
    controls.hidden = true;
    return;
  }
  stage.hidden = false;
  stage.innerHTML = media.map((item, index) => `<div class="hero-media-slide${index === 0 ? " active" : ""}" data-hero-slide="${index}">${item.media_type === "video" ? `<video src="${escapeAttr(item.url)}" muted playsinline preload="metadata" aria-label="${escapeAttr(item.filename)}"></video>` : `<img src="${escapeAttr(item.url)}" alt="" fetchpriority="${index === 0 ? "high" : "auto"}">`}</div>`).join("");
  controls.hidden = media.length <= 1;
  document.getElementById("heroDots").innerHTML = media.map((_, index) => `<button class="${index === 0 ? "active" : ""}" data-hero-dot="${index}" aria-label="Tampilkan media ${index + 1}"></button>`).join("");
  document.querySelectorAll("[data-hero-dot]").forEach(button => button.addEventListener("click", () => showHeroSlide(Number(button.dataset.heroDot))));
  showHeroSlide(0);
}

function showHeroSlide(index) {
  const media = Array.isArray(publicState.settings.hero_media) ? publicState.settings.hero_media : [];
  if (!media.length) return;
  publicState.heroIndex = (index + media.length) % media.length;
  clearTimeout(publicState.heroTimer);
  const slides = [...document.querySelectorAll("[data-hero-slide]")];
  slides.forEach((slide, slideIndex) => {
    const active = slideIndex === publicState.heroIndex;
    slide.classList.toggle("active", active);
    const video = slide.querySelector("video");
    if (!video) return;
    video.onended = null;
    video.onloadedmetadata = null;
    if (!active) {
      video.pause();
      video.currentTime = 0;
    }
  });
  document.querySelectorAll("[data-hero-dot]").forEach((dot, dotIndex) => dot.classList.toggle("active", dotIndex === publicState.heroIndex));
  const activeSlide = slides[publicState.heroIndex];
  const video = activeSlide?.querySelector("video");
  if (video) {
    video.currentTime = 0;
    video.play().catch(() => {});
    if (media.length === 1) {
      video.loop = true;
      return;
    }
    const scheduleFromDuration = () => {
      clearTimeout(publicState.heroTimer);
      const duration = Number.isFinite(video.duration) ? Math.max(4, Math.min(30, video.duration)) : 15;
      publicState.heroTimer = setTimeout(nextHeroSlide, duration * 1000);
    };
    video.onended = nextHeroSlide;
    if (video.readyState >= 1) scheduleFromDuration();
    else {
      video.onloadedmetadata = scheduleFromDuration;
      publicState.heroTimer = setTimeout(nextHeroSlide, 15000);
    }
    return;
  }
  if (media.length > 1) publicState.heroTimer = setTimeout(nextHeroSlide, Math.max(3, Number(publicState.settings.hero_interval_seconds) || 6) * 1000);
}

function nextHeroSlide() {
  showHeroSlide(publicState.heroIndex + 1);
}

function renderOrderTicker(events) {
  const ticker = document.getElementById("liveOrderTicker");
  if (publicState.settings.show_order_ticker === false) {
    ticker.hidden = true;
    document.body.classList.remove("ticker-active");
    return;
  }
  const items = (events || []).filter(item => item?.message).slice(0, 20);
  const displayItems = items.length ? items : [{ id: "ready", message: "Produksi IMPOSSIBLE APPAREL sedang berjalan", created_at: "" }];
  const signature = displayItems.map(item => `${item.id}:${item.created_at}`).join("|");
  ticker.hidden = false;
  document.body.classList.add("ticker-active");
  if (signature === publicState.activitySignature) return;
  publicState.activitySignature = signature;
  const repeated = displayItems.length < 4 ? Array.from({ length: Math.ceil(4 / displayItems.length) }, () => displayItems).flat() : displayItems;
  const sequence = repeated.map(item => `<span class="ticker-item"><i></i><span>${escapeHtml(item.message)}</span>${item.created_at ? `<time>${escapeHtml(activityDate(item.created_at))}</time>` : ""}</span>`).join("");
  const track = document.getElementById("tickerTrack");
  track.style.setProperty("--ticker-duration", `${Math.max(26, Math.min(80, repeated.map(item => item.message.length).reduce((sum, length) => sum + length, 0) * .12))}s`);
  track.innerHTML = `<div class="ticker-sequence">${sequence}</div><div class="ticker-sequence" aria-hidden="true">${sequence}</div>`;
  const tickerWindow = document.getElementById("tickerWindow");
  tickerWindow.classList.remove("is-updating");
  void tickerWindow.offsetWidth;
  tickerWindow.classList.add("is-updating");
  clearTimeout(renderOrderTicker.motionTimer);
  renderOrderTicker.motionTimer = setTimeout(() => tickerWindow.classList.remove("is-updating"), 650);
}

async function loadOrderActivity() {
  try {
    const data = await publicApi(`${PUBLIC_API_BASE}/activity`);
    renderOrderTicker(data.events);
  } catch { /* coba lagi pada interval berikutnya */ }
}

function productImage(product, className = "") {
  return product.cover?.url ? `<img class="${className}" src="${escapeAttr(product.cover.url)}" alt="${escapeAttr(product.name)}" loading="lazy">` : `<div class="product-placeholder ${className}"><span>IA</span><strong>${escapeHtml(product.name)}</strong></div>`;
}

function renderCategories() {
  const categories = ["SEMUA", ...new Set(publicState.products.map(product => product.category))];
  if (!categories.includes(publicState.category)) publicState.category = "SEMUA";
  document.getElementById("categoryTabs").innerHTML = categories.map(category => `<button class="${category === publicState.category ? "active" : ""}" data-category="${escapeAttr(category)}">${escapeHtml(category)}</button>`).join("");
  document.querySelectorAll("[data-category]").forEach(button => button.addEventListener("click", () => { publicState.category = button.dataset.category; renderCategories(); renderCatalog(); }));
}

function renderCatalog() {
  const query = publicState.search.toLowerCase();
  const products = publicState.products.filter(product => (publicState.category === "SEMUA" || product.category === publicState.category) && (!query || `${product.name} ${product.category} ${product.short_description} ${product.materials.map(item => item.name).join(" ")}`.toLowerCase().includes(query)));
  document.getElementById("catalogGrid").innerHTML = products.length ? products.map(product => `<article class="catalog-card" data-product="${product.id}">
    <div class="catalog-image">${productImage(product)}${product.badge ? `<span class="product-badge">${escapeHtml(product.badge)}</span>` : ""}</div>
    <div class="catalog-card-body"><span>${escapeHtml(product.category)}</span><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.short_description || "Produk custom sesuai kebutuhan Anda.")}</p><div class="catalog-card-foot">${publicState.settings.show_prices ? `<strong>${product.price ? `Mulai ${rupiah(product.price)}` : "Hubungi kami"}</strong>` : `<strong>Harga konsultasi</strong>`}<button aria-label="Lihat detail ${escapeAttr(product.name)}">Lihat detail →</button></div></div>
  </article>`).join("") : `<div class="public-empty"><strong>${publicState.products.length ? "Produk tidak ditemukan" : "Katalog segera hadir"}</strong><p>${publicState.products.length ? "Coba kategori atau kata pencarian lain." : "Admin belum menerbitkan produk katalog."}</p></div>`;
  document.querySelectorAll("[data-product]").forEach(card => card.addEventListener("click", () => openProduct(Number(card.dataset.product))));
}

function openProduct(id) {
  const product = publicState.products.find(item => item.id === id);
  if (!product) return;
  const images = [product.cover, ...product.gallery].filter(Boolean);
  document.getElementById("productDialog").innerHTML = `<button class="product-close" id="closeProduct" aria-label="Tutup">×</button><div class="product-detail-media"><div id="productMainImage">${productImage(product, "detail-main")}</div>${images.length > 1 ? `<div class="product-thumbs">${images.map((image, index) => `<button data-image="${escapeAttr(image.url)}" aria-label="Gambar ${index + 1}"><img src="${escapeAttr(image.url)}" alt=""></button>`).join("")}</div>` : ""}</div><div class="product-detail-copy"><span>${escapeHtml(product.category)}</span><h2>${escapeHtml(product.name)}</h2><p class="lead">${escapeHtml(product.short_description)}</p>${publicState.settings.show_prices ? `<div class="product-price">${product.price ? rupiah(product.price) : "Konsultasikan harga"}<small>Harga awal per produk</small></div>` : ""}<div class="product-facts"><div><span>Minimal order</span><strong>${product.min_order} pcs</strong></div><div><span>Estimasi produksi</span><strong>${product.production_days ? `${product.production_days} hari` : "Konfirmasi Admin"}</strong></div></div>${product.description ? `<section><h3>Deskripsi</h3><p>${escapeHtml(product.description).replaceAll("\n", "<br>")}</p></section>` : ""}${product.materials.length ? `<section><h3>Pilihan bahan</h3><div class="chip-list">${product.materials.map(item => `<span>${escapeHtml(item.name)}</span>`).join("")}</div></section>` : ""}${product.sizes.length ? `<section><h3>Ukuran tersedia</h3><div class="chip-list">${product.sizes.map(size => `<span>${escapeHtml(size)}</span>`).join("")}</div></section>` : ""}${product.specifications ? `<section><h3>Spesifikasi</h3><p>${escapeHtml(product.specifications).replaceAll("\n", "<br>")}</p></section>` : ""}${product.faq.length ? `<section><h3>FAQ</h3><div class="faq-list">${product.faq.map(item => `<details><summary>${escapeHtml(item.question)}</summary><p>${escapeHtml(item.answer)}</p></details>`).join("")}</div></section>` : ""}<a class="public-btn primary wide" href="${escapeAttr(whatsappUrl(`Halo IMPOSSIBLE APPAREL, saya tertarik dengan ${product.name}.`))}" target="_blank" rel="noopener">Konsultasi via WhatsApp</a></div>`;
  document.getElementById("productModal").hidden = false;
  document.body.classList.add("modal-open");
  document.getElementById("closeProduct").addEventListener("click", closeProduct);
  document.querySelectorAll("[data-image]").forEach(button => button.addEventListener("click", () => { document.getElementById("productMainImage").innerHTML = `<img class="detail-main" src="${escapeAttr(button.dataset.image)}" alt="${escapeAttr(product.name)}">`; }));
}

function closeProduct() {
  document.getElementById("productModal").hidden = true;
  document.body.classList.remove("modal-open");
}

function progressPercent(stage, stages) {
  const index = stages.indexOf(stage);
  return index < 0 ? 0 : Math.round(((index + 1) / stages.length) * 100);
}

function renderCustomerPortal(data) {
  publicState.customer = data;
  const job = data.job;
  const progress = progressPercent(job.production.stage, data.stages);
  const invoicesTotal = data.invoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const paidTotal = data.invoices.reduce((sum, invoice) => sum + invoice.paid, 0);
  const balanceTotal = data.invoices.reduce((sum, invoice) => sum + invoice.balance, 0);
  document.getElementById("customerLoginForm").hidden = true;
  const portal = document.getElementById("customerPortal");
  portal.hidden = false;
  portal.innerHTML = `<div class="portal-customer-head"><div><span>PESANAN CUSTOMER</span><h3>${escapeHtml(job.spk)}</h3><p>${escapeHtml(job.customer)} · ${escapeHtml(job.product)} · ${job.qty} pcs</p></div><button class="public-btn light" id="customerLogout">Keluar</button></div><div class="customer-summary"><article><span>Status Produksi</span><strong>${escapeHtml(job.production.stage)}</strong><small>${progress}% selesai</small></article><article><span>Total Invoice</span><strong>${rupiah(invoicesTotal)}</strong><small>${data.invoices.length} dokumen</small></article><article><span>Sudah Dibayar</span><strong>${rupiah(paidTotal)}</strong><small>Sisa ${rupiah(balanceTotal)}</small></article></div><section class="tracking-public"><div class="portal-section-title"><h4>Tracking Produksi</h4><span>Estimasi selesai ${job.deadline ? dateId(job.deadline) : "menunggu konfirmasi"}</span></div><div class="stage-track">${data.stages.map(stage => `<div class="${data.stages.indexOf(stage) <= data.stages.indexOf(job.production.stage) ? "done" : ""}"><i></i><span>${escapeHtml(stage)}</span></div>`).join("")}</div><div class="public-timeline">${data.history.length ? data.history.map(item => `<article><i></i><div><strong>${escapeHtml(item.stage)}</strong><p>${escapeHtml(item.note || "Proses diperbarui.")}</p><small>${dateId(item.created_at)}</small></div></article>`).join("") : `<div class="public-empty"><strong>Produksi belum dimulai</strong><p>Pembaruan proses akan tampil di sini.</p></div>`}</div></section><section class="invoice-public"><div class="portal-section-title"><h4>Invoice & Pembayaran</h4><span>Dokumen untuk ${escapeHtml(job.spk)}</span></div>${data.invoices.length ? data.invoices.map(invoice => `<article class="public-invoice"><div class="invoice-public-head"><div><span>${escapeHtml(invoice.invoice_no)}</span><strong>${escapeHtml(invoice.payment_status)}</strong></div><button class="public-btn light" data-customer-pdf="${invoice.id}">Unduh PDF</button></div><div class="invoice-public-total"><div><span>Total</span><strong>${rupiah(invoice.total)}</strong></div><div><span>Dibayar</span><strong>${rupiah(invoice.paid)}</strong></div><div><span>Sisa</span><strong>${rupiah(invoice.balance)}</strong></div></div><div class="invoice-public-items">${invoice.items.map(item => `<div><span>${escapeHtml(item.description)} · ${item.qty} pcs</span><strong>${rupiah(item.qty * item.price)}</strong></div>`).join("")}</div>${invoice.payments.length ? `<div class="payment-history"><h5>Riwayat Pembayaran</h5>${invoice.payments.map(payment => `<div><span>${dateId(payment.date)} · ${escapeHtml(payment.method)}</span><strong>${rupiah(payment.amount)}</strong></div>`).join("")}</div>` : `<p class="unpaid-note">Belum ada pembayaran tercatat.</p>`}</article>`).join("") : `<div class="public-empty"><strong>Invoice belum dibuat</strong><p>Invoice akan tampil setelah dibuat oleh Admin.</p></div>`}</section>`;
  document.getElementById("customerLogout").addEventListener("click", logoutCustomer);
  document.querySelectorAll("[data-customer-pdf]").forEach(button => button.addEventListener("click", () => downloadCustomerPdf(Number(button.dataset.customerPdf))));
}

async function loadCustomerSession({ quiet = false } = {}) {
  try {
    const data = await publicApi("/api/public/customer/summary");
    renderCustomerPortal(data);
  } catch (error) {
    if (error.status === 401) {
      publicState.customer = null;
      document.getElementById("customerLoginForm").hidden = false;
      document.getElementById("customerPortal").hidden = true;
      if (!quiet) toast(error.message);
    } else if (!quiet) toast(error.message);
  }
}

async function loginCustomer(event) {
  event.preventDefault();
  const button = document.getElementById("customerLoginButton");
  const message = document.getElementById("customerLoginMessage");
  const fields = Object.fromEntries(new FormData(event.currentTarget));
  button.disabled = true;
  button.textContent = "Memeriksa…";
  message.textContent = "";
  try {
    await publicApi("/api/public/customer/login", { method: "POST", body: JSON.stringify(fields) });
    await loadCustomerSession();
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; button.textContent = "Buka Pesanan"; }
}

async function logoutCustomer() {
  await publicApi("/api/public/customer/logout", { method: "POST", body: "{}" }).catch(() => {});
  publicState.customer = null;
  document.getElementById("customerLoginForm").reset();
  document.getElementById("customerLoginForm").hidden = false;
  document.getElementById("customerPortal").hidden = true;
}

async function downloadCustomerPdf(id) {
  try {
    const response = await fetch(`/api/public/customer/invoices/${id}/pdf`);
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "PDF gagal dibuat.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `INVOICE-${id}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  } catch (error) { toast(error.message); }
}

document.getElementById("catalogSearch").addEventListener("input", event => { publicState.search = event.target.value.trim(); renderCatalog(); });
if (IS_ADMIN_PREVIEW) {
  document.querySelectorAll("#customerLoginForm input, #customerLoginForm button").forEach(control => { control.disabled = true; });
  document.getElementById("customerLoginMessage").textContent = "Login customer dinonaktifkan khusus pada mode preview Admin.";
} else {
  document.getElementById("customerLoginForm").addEventListener("submit", loginCustomer);
}
document.getElementById("productModal").addEventListener("click", event => { if (event.target.id === "productModal") closeProduct(); });
document.getElementById("heroPrevious").addEventListener("click", () => showHeroSlide(publicState.heroIndex - 1));
document.getElementById("heroNext").addEventListener("click", nextHeroSlide);
document.addEventListener("keydown", event => { if (event.key === "Escape") closeProduct(); });

initWelcomeMotion();

(async function initPublicSite() {
  try {
    const data = await publicApi(`${PUBLIC_API_BASE}/catalog`);
    publicState.settings = data.settings;
    publicState.products = data.products;
    applySettings();
    renderCategories();
    renderCatalog();
    await loadOrderActivity();
    if (!IS_ADMIN_PREVIEW) await loadCustomerSession({ quiet: true });
    setInterval(loadOrderActivity, 10000);
    if (!IS_ADMIN_PREVIEW) setInterval(() => { if (publicState.customer) loadCustomerSession({ quiet: true }); }, 15000);
  } catch (error) {
    document.getElementById("catalogGrid").innerHTML = `<div class="public-empty"><strong>Website belum dapat memuat data</strong><p>${escapeHtml(error.message)}</p></div>`;
  }
})();
