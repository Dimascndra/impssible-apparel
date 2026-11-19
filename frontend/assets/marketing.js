"use strict";

const MKT_PUBLIC_ADMIN = true;
const MKT_API_BASE = "/api/admin";
const MKT_API = `${MKT_API_BASE}/marketing`;
const marketingState = {
  loaded: false,
  loading: false,
  summary: {}, products: [], posts: [], media: [], ads: [], analytics: { totals: [], metrics: [], publish_log: [] },
  connections: {}, settings: {}, selectedMedia: new Set(), storyboard: null, currentTab: "overview", pollTimers: new Map()
};

const mkt = id => document.getElementById(id);
const mktNumber = value => new Intl.NumberFormat("id-ID").format(Number(value) || 0);
const mktRupiah = value => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value) || 0);
const mktDate = value => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Belum dijadwalkan";
const mktEmpty = message => `<div class="marketing-empty">${IA.escape(message)}</div>`;
const mktStatus = value => `<span class="marketing-status ${IA.attr(value || "DRAFT")}">${IA.escape(value || "DRAFT")}</span>`;

function marketingTab(name) {
  marketingState.currentTab = name;
  document.querySelectorAll("[data-marketing-tab]").forEach(button => button.classList.toggle("active", button.dataset.marketingTab === name));
  document.querySelectorAll("[data-marketing-panel]").forEach(panel => panel.classList.toggle("hide", panel.dataset.marketingPanel !== name));
  if (name === "content") renderMarketingMediaPicker();
}

function renderMarketingSummary() {
  const summary = marketingState.summary || {};
  const posts = summary.posts || {};
  const perf = summary.performance || {};
  const cards = [
    ["Total Konten", posts.total || 0, "Semua draft & publikasi", "#ff1b1b"],
    ["Menunggu Review", posts.review || 0, "Perlu keputusan", "#f0ac00"],
    ["Siap Tayang", posts.approved || 0, "Approved / terjadwal", "#2563eb"],
    ["Sudah Tayang", posts.published || 0, "Publikasi tercatat", "#13a45a"],
    ["Order Marketing", perf.orders || 0, `${mktRupiah(perf.revenue || 0)} omzet`, "#7257ff", "dark"]
  ];
  mkt("marketingKpis").innerHTML = cards.map(([label, value, note, color, className = ""]) => `<article class="marketing-kpi ${className}" style="--kpi-color:${color}"><small>${label}</small><strong>${mktNumber(value)}</strong><span>${note}</span></article>`).join("");
  const flow = [["DRAFT", posts.drafts || 0], ["REVIEW", posts.review || 0], ["APPROVED", posts.approved || 0], ["PUBLISHED", posts.published || 0]];
  const max = Math.max(1, ...flow.map(item => item[1]));
  mkt("marketingFlow").innerHTML = flow.map(([label, count]) => `<div class="marketing-flow-row"><span>${label}</span><i style="--flow:${Math.round(count / max * 100)}%"></i><strong>${count}</strong></div>`).join("");
  const upcoming = summary.upcoming || [];
  mkt("marketingUpcoming").innerHTML = upcoming.length ? upcoming.map(post => `<article class="marketing-upcoming-item"><div><strong>${IA.escape(post.title)}</strong>${mktStatus(post.status)}</div><small>${mktDate(post.scheduled_at)} · ${IA.escape((post.platforms || []).join(" · ") || "Belum memilih platform")}</small></article>`).join("") : mktEmpty("Belum ada konten terjadwal.");
  renderMarketingUsage(summary.ai_video || {});
}

function renderMarketingUsage(usage) {
  const today = Number(usage.today) || 0;
  const daily = Number(usage.daily_limit) || 3;
  const month = Number(usage.monthly_estimate_idr) || 0;
  const budget = Number(usage.monthly_budget_idr) || 0;
  const percent = budget ? Math.min(100, Math.round(month / budget * 100)) : 0;
  mkt("marketingAiUsage").innerHTML = `<div><strong>${today}/${daily}</strong><span>Generate hari ini</span></div><div><strong>${Math.max(0, daily - today)}</strong><span>Sisa hari ini</span></div><div><strong>${mktRupiah(month)}</strong><span>Estimasi bulan ini</span></div><div><strong>${budget ? mktRupiah(budget) : "Tanpa batas"}</strong><span>Budget Guard</span></div><div class="marketing-budget-bar"><i style="--usage:${percent}%"></i></div>`;
  marketingState.summary.ai_video = usage;
  renderMarketingVideoJobs();
}

function renderMarketingProducts() {
  const current = mkt("marketingProduct").value;
  mkt("marketingProduct").innerHTML = `<option value="">Pilih produk…</option>${marketingState.products.map(product => `<option value="${IA.attr(product.key)}" data-name="${IA.attr(product.name)}">${IA.escape(product.name)} · ${IA.escape(product.source)}</option>`).join("")}`;
  if (marketingState.products.some(product => product.key === current)) mkt("marketingProduct").value = current;
}

function marketingMediaUrl(media) {
  return `${MKT_API}/media/${media.id}/file`;
}

function marketingMediaPreview(media, { controls = false } = {}) {
  const url = marketingMediaUrl(media);
  return media.media_type === "video"
    ? `<video src="${IA.attr(url)}" ${controls ? "controls" : "muted playsinline preload=\"metadata\""}></video>`
    : `<img src="${IA.attr(url)}" alt="${IA.attr(media.filename)}" loading="lazy">`;
}

function renderMarketingMediaGrid() {
  mkt("marketingMediaGrid").innerHTML = marketingState.media.length ? marketingState.media.map(media => `<article class="marketing-media-card"><div class="marketing-media-thumb">${marketingMediaPreview(media, { controls: media.media_type === "video" })}</div><div class="marketing-media-meta"><strong title="${IA.attr(media.filename)}">${IA.escape(media.filename)}</strong><small>${IA.escape(media.source)} · ${Math.ceil(media.size / 1024)} KB</small><div><button class="btn" type="button" data-mkt-use-media="${media.id}">Pakai</button><button class="btn btn-danger" type="button" data-mkt-delete-media="${media.id}">Hapus</button></div></div></article>`).join("") : mktEmpty("Belum ada foto atau video marketing.");
  mkt("marketingMediaGrid").querySelectorAll("[data-mkt-use-media]").forEach(button => button.addEventListener("click", () => {
    marketingState.selectedMedia.add(Number(button.dataset.mktUseMedia));
    marketingTab("content");
    renderMarketingMediaPicker();
    mkt("marketingContentForm").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  mkt("marketingMediaGrid").querySelectorAll("[data-mkt-delete-media]").forEach(button => button.addEventListener("click", () => deleteMarketingMedia(Number(button.dataset.mktDeleteMedia))));
  renderMarketingMediaPicker();
  renderMarketingVideoSource();
}

function renderMarketingMediaPicker() {
  const box = mkt("marketingMediaPicker");
  if (!marketingState.media.length) {
    box.innerHTML = `<span class="muted">Upload media pada tab Media & Kalender.</span>`;
    return;
  }
  box.innerHTML = marketingState.media.map(media => `<label class="marketing-picker-item ${marketingState.selectedMedia.has(media.id) ? "selected" : ""}" title="${IA.attr(media.filename)}"><input type="checkbox" value="${media.id}" ${marketingState.selectedMedia.has(media.id) ? "checked" : ""}>${marketingMediaPreview(media)}</label>`).join("");
  box.querySelectorAll(".marketing-picker-item").forEach(item => item.addEventListener("click", event => {
    event.preventDefault();
    const id = Number(item.querySelector("input").value);
    marketingState.selectedMedia.has(id) ? marketingState.selectedMedia.delete(id) : marketingState.selectedMedia.add(id);
    renderMarketingMediaPicker();
    updateMarketingScore();
  }));
}

function renderMarketingVideoSource() {
  const current = mkt("marketingVideoSource").value;
  const images = marketingState.media.filter(media => media.media_type === "image");
  mkt("marketingVideoSource").innerHTML = `<option value="">Text to video</option>${images.map(media => `<option value="${media.id}">${IA.escape(media.filename)}</option>`).join("")}`;
  if (images.some(media => String(media.id) === current)) mkt("marketingVideoSource").value = current;
}

function postActions(post) {
  const buttons = [];
  if (post.status !== "PUBLISHED") buttons.push(`<button class="btn" type="button" data-mkt-edit-post="${post.id}">Edit</button>`);
  if (post.status === "DRAFT") buttons.push(`<button class="btn btn-dark" type="button" data-mkt-status-post="${post.id}" data-status="REVIEW">Kirim Review</button>`);
  if (post.status === "REVIEW") {
    buttons.push(`<button class="btn" type="button" data-mkt-status-post="${post.id}" data-status="DRAFT">Kembalikan Draft</button>`);
    buttons.push(`<button class="btn btn-primary" type="button" data-mkt-status-post="${post.id}" data-status="APPROVED">✓ Approve</button>`);
  }
  if (post.status === "APPROVED" && post.scheduled_at) buttons.push(`<button class="btn" type="button" data-mkt-status-post="${post.id}" data-status="SCHEDULED">Jadwalkan</button>`);
  if (["APPROVED", "SCHEDULED", "PARTIAL"].includes(post.status)) buttons.push(`<button class="btn btn-primary" type="button" data-mkt-publish-post="${post.id}">Tandai Sudah Diposting</button>`);
  buttons.push(`<button class="btn btn-danger" type="button" data-mkt-delete-post="${post.id}">Hapus</button>`);
  return buttons.join("");
}

function renderMarketingPosts() {
  const filter = mkt("marketingPostFilter").value;
  const posts = marketingState.posts.filter(post => !filter || post.status === filter);
  mkt("marketingPostList").innerHTML = posts.length ? posts.map(post => {
    const media = post.media?.[0];
    return `<article class="marketing-post-card"><div class="marketing-post-media">${media ? marketingMediaPreview(media) : "TANPA MEDIA"}</div><div class="marketing-post-main"><h3>#${post.id} ${IA.escape(post.title)}</h3><div class="marketing-post-meta">${mktStatus(post.status)}<span>Score ${post.readiness_score || 0}/100</span><span>${IA.escape((post.platforms || []).join(" · ") || "Belum ada platform")}</span><span>${mktDate(post.scheduled_at)}</span></div><p><strong>${IA.escape(post.hook || "")}</strong><br>${IA.escape(String(post.body || "").slice(0, 230))}${String(post.body || "").length > 230 ? "…" : ""}</p></div><div class="marketing-post-actions">${postActions(post)}</div></article>`;
  }).join("") : mktEmpty("Belum ada konten untuk status ini.");
  const root = mkt("marketingPostList");
  root.querySelectorAll("[data-mkt-edit-post]").forEach(button => button.addEventListener("click", () => editMarketingPost(Number(button.dataset.mktEditPost))));
  root.querySelectorAll("[data-mkt-status-post]").forEach(button => button.addEventListener("click", () => changeMarketingPostStatus(Number(button.dataset.mktStatusPost), button.dataset.status)));
  root.querySelectorAll("[data-mkt-publish-post]").forEach(button => button.addEventListener("click", () => publishMarketingPost(Number(button.dataset.mktPublishPost))));
  root.querySelectorAll("[data-mkt-delete-post]").forEach(button => button.addEventListener("click", () => deleteMarketingPost(Number(button.dataset.mktDeletePost))));
  const options = marketingState.posts.map(post => `<option value="${post.id}">#${post.id} ${IA.escape(post.title)}</option>`).join("");
  const metricCurrent = mkt("marketingMetricPost").value;
  mkt("marketingMetricPost").innerHTML = `<option value="">Tanpa konten</option>${options}`;
  if (marketingState.posts.some(post => String(post.id) === metricCurrent)) mkt("marketingMetricPost").value = metricCurrent;
}

function renderMarketingAds() {
  mkt("marketingAdsList").innerHTML = marketingState.ads.length ? marketingState.ads.map(ad => `<article class="marketing-ad-card"><div><h3>#${ad.id} ${IA.escape(ad.name)}</h3><p>${IA.escape(ad.platform)} · ${IA.escape(ad.objective)} · ${mktRupiah(ad.daily_budget)}/hari × ${ad.duration_days} hari</p><p>Estimasi maksimal <strong>${mktRupiah(Number(ad.daily_budget) * Number(ad.duration_days))}</strong></p><div class="marketing-post-meta">${mktStatus(ad.status)}${ad.approved_budget ? `<span>Budget disetujui</span>` : `<span>Belum disetujui</span>`}</div></div><div class="marketing-ad-actions">${!ad.approved_budget ? `<button class="btn btn-primary" type="button" data-mkt-approve-ad="${ad.id}">Approve Budget</button>` : ""}<button class="btn btn-danger" type="button" data-mkt-delete-ad="${ad.id}">Hapus</button></div></article>`).join("") : mktEmpty("Belum ada rencana iklan.");
  mkt("marketingAdsList").querySelectorAll("[data-mkt-approve-ad]").forEach(button => button.addEventListener("click", () => approveMarketingAd(Number(button.dataset.mktApproveAd))));
  mkt("marketingAdsList").querySelectorAll("[data-mkt-delete-ad]").forEach(button => button.addEventListener("click", () => deleteMarketingAd(Number(button.dataset.mktDeleteAd))));
}

function renderMarketingAnalytics() {
  const analytics = marketingState.analytics || { totals: [], metrics: [], publish_log: [] };
  const all = (analytics.totals || []).reduce((sum, row) => ({
    views: sum.views + Number(row.views || 0), clicks: sum.clicks + Number(row.clicks || 0), whatsapp: sum.whatsapp + Number(row.whatsapp_clicks || 0),
    orders: sum.orders + Number(row.orders || 0), revenue: sum.revenue + Number(row.revenue || 0)
  }), { views: 0, clicks: 0, whatsapp: 0, orders: 0, revenue: 0 });
  mkt("marketingAnalyticsKpis").innerHTML = [["Views", all.views, "Total tayangan"], ["Klik", all.clicks, "Semua klik"], ["Klik WhatsApp", all.whatsapp, "Lead WhatsApp"], ["Order", all.orders, "Order teratribusi"], ["Omzet", mktRupiah(all.revenue), "Omzet marketing"]].map(([label, value, note], index) => `<article class="marketing-kpi ${index === 4 ? "dark" : ""}"><small>${label}</small><strong>${typeof value === "number" ? mktNumber(value) : value}</strong><span>${note}</span></article>`).join("");
  mkt("marketingPlatformPerformance").innerHTML = analytics.totals?.length ? analytics.totals.map(row => `<article class="marketing-performance-card"><strong>${IA.escape(row.platform.toUpperCase())}</strong><div><span>Views</span><strong>${mktNumber(row.views)}</strong></div><div><span>WA</span><strong>${mktNumber(row.whatsapp_clicks)}</strong></div><div><span>Order</span><strong>${mktNumber(row.orders)}</strong></div><div><span>Omzet</span><strong>${mktRupiah(row.revenue)}</strong></div></article>`).join("") : mktEmpty("Belum ada data performa.");
  const rows = analytics.metrics || [];
  const logs = analytics.publish_log || [];
  mkt("marketingAnalyticsLog").innerHTML = `<div class="marketing-table-wrap"><table class="marketing-table"><thead><tr><th>Tanggal</th><th>Platform</th><th>Views</th><th>Klik WA</th><th>Order</th><th>Omzet</th><th></th></tr></thead><tbody>${rows.map(row => `<tr><td>${IA.escape(row.metric_date)}</td><td>${IA.escape(row.platform)}</td><td>${mktNumber(row.views)}</td><td>${mktNumber(row.whatsapp_clicks)}</td><td>${mktNumber(row.orders)}</td><td>${mktRupiah(row.revenue)}</td><td><button class="btn btn-small btn-danger" type="button" data-mkt-delete-metric="${row.id}">Hapus</button></td></tr>`).join("") || `<tr><td colspan="7">Belum ada input performa.</td></tr>`}</tbody></table></div>${logs.length ? `<div class="marketing-table-wrap"><table class="marketing-table"><thead><tr><th>Waktu</th><th>Konten</th><th>Platform</th><th>Status</th></tr></thead><tbody>${logs.slice(0, 30).map(log => `<tr><td>${mktDate(log.created_at)}</td><td>#${log.post_id} ${IA.escape(log.title || "")}</td><td>${IA.escape(log.platform)}</td><td>${IA.escape(log.status)}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
  mkt("marketingAnalyticsLog").querySelectorAll("[data-mkt-delete-metric]").forEach(button => button.addEventListener("click", () => deleteMarketingMetric(Number(button.dataset.mktDeleteMetric))));
}

const marketingConnectionDefinitions = {
  gemini: { title: "Gemini + Veo", fields: [["api_key", "API Key", "password"], ["strategy_model", "Model Strategi", "text"], ["video_model", "Model Veo", "text"], ["account_label", "Nama Akun", "text"]] },
  meta: { title: "Meta · FB & IG", fields: [["access_token", "Access Token", "password"], ["page_id", "Facebook Page ID", "text"], ["instagram_id", "Instagram Business ID", "text"], ["profile_url", "URL Profil", "url"]] },
  tiktok: { title: "TikTok", fields: [["access_token", "Access Token", "password"], ["open_id", "Open ID", "text"], ["profile_url", "URL Profil", "url"]] },
  x: { title: "X / Twitter", fields: [["bearer_token", "Bearer Token", "password"], ["api_key", "API Key", "password"], ["api_secret", "API Secret", "password"], ["access_token", "Access Token", "password"], ["access_token_secret", "Access Token Secret", "password"]] },
  google_ads: { title: "Google Ads", fields: [["developer_token", "Developer Token", "password"], ["customer_id", "Customer ID", "text"], ["login_customer_id", "Login Customer ID", "text"], ["account_label", "Nama Akun", "text"]] }
};

function renderMarketingConnections() {
  mkt("marketingConnections").innerHTML = Object.entries(marketingConnectionDefinitions).map(([platform, definition]) => {
    const status = marketingState.connections[platform] || {};
    const fields = definition.fields.map(([key, label, type]) => `<div class="field"><label>${label}${status.configured_fields?.includes(key) ? " · tersimpan" : ""}</label><input type="${type}" data-mkt-connection-field="${key}" placeholder="${status.configured_fields?.includes(key) ? "Biarkan kosong untuk mempertahankan nilai" : `Isi ${label}`}"></div>`).join("");
    return `<article class="marketing-connection-card" data-mkt-connection="${platform}"><div class="marketing-connection-head"><h3>${definition.title}</h3>${mktStatus(status.status || "BELUM DIATUR")}</div><div class="marketing-connection-body"><div class="marketing-connection-fields">${fields}</div><small class="field-help">${IA.escape(status.last_test_message || "Belum diuji.")}</small><div class="marketing-connection-actions"><button class="btn btn-primary" type="button" data-mkt-save-connection>Simpan</button><button class="btn" type="button" data-mkt-test-connection>Test</button>${status.configured ? `<button class="btn btn-danger danger" type="button" data-mkt-delete-connection>Hapus Koneksi</button>` : ""}</div></div></article>`;
  }).join("");
  mkt("marketingConnections").querySelectorAll("[data-mkt-connection]").forEach(card => {
    card.querySelector("[data-mkt-save-connection]").addEventListener("click", () => saveMarketingConnection(card));
    card.querySelector("[data-mkt-test-connection]").addEventListener("click", () => testMarketingConnection(card.dataset.mktConnection));
    card.querySelector("[data-mkt-delete-connection]")?.addEventListener("click", () => deleteMarketingConnection(card.dataset.mktConnection));
  });
  const settings = marketingState.settings || {};
  mkt("marketingStrategyModel").value = settings.strategy_model || "gemini-3.8-flash";
  mkt("marketingDefaultVideoModel").value = settings.video_model || "veo-3.1-lite-generate-preview";
  mkt("marketingDailyLimit").value = settings.daily_video_limit || 3;
  mkt("marketingMonthlyBudget").value = settings.monthly_ai_budget_idr || 0;
  mkt("marketingUsdIdr").value = settings.usd_idr || 18000;
  mkt("marketingBrandVoice").value = settings.brand_voice || "";
  mkt("marketingDefaultAudience").value = settings.default_audience || "";
}

function renderMarketingVideoJobs() {
  const jobs = marketingState.summary?.ai_video?.jobs || [];
  mkt("marketingVideoJobs").innerHTML = jobs.length ? jobs.map(job => `<div class="marketing-video-job"><div><strong>#${job.id} ${IA.escape(job.status)}</strong><small>${IA.escape(job.model)} · ${job.duration_seconds}s · ${IA.escape(job.resolution)}</small>${job.error_message ? `<small>${IA.escape(job.error_message)}</small>` : ""}</div>${job.status === "PROCESSING" ? `<button class="btn btn-small" type="button" data-mkt-poll-video="${job.id}">Cek</button>` : job.output_media_id ? `<button class="btn btn-small" type="button" data-mkt-use-media="${job.output_media_id}">Pakai</button>` : ""}</div>`).join("") : "";
  mkt("marketingVideoJobs").querySelectorAll("[data-mkt-poll-video]").forEach(button => button.addEventListener("click", () => pollMarketingVideo(Number(button.dataset.mktPollVideo))));
  mkt("marketingVideoJobs").querySelectorAll("[data-mkt-use-media]").forEach(button => button.addEventListener("click", () => {
    marketingState.selectedMedia.add(Number(button.dataset.mktUseMedia)); renderMarketingMediaPicker(); IA.toast("Video dipilih untuk konten.");
  }));
}

async function loadMarketingAll({ quiet = false } = {}) {
  if (marketingState.loading) return false;
  marketingState.loading = true;
  try {
    const [summary, products, posts, media, ads, analytics, connections] = await Promise.all([
      IA.api(`${MKT_API}/summary`), IA.api(`${MKT_API}/products`), IA.api(`${MKT_API}/posts`), IA.api(`${MKT_API}/media`),
      IA.api(`${MKT_API}/ads`), IA.api(`${MKT_API}/analytics`), IA.api(`${MKT_API}/connections`)
    ]);
    marketingState.summary = summary.summary || {};
    marketingState.products = products.products || [];
    marketingState.posts = posts.posts || [];
    marketingState.media = media.media || [];
    marketingState.ads = ads.ads || [];
    marketingState.analytics = analytics.analytics || { totals: [], metrics: [], publish_log: [] };
    marketingState.connections = connections.connections || {};
    marketingState.settings = connections.settings || {};
    marketingState.loaded = true;
    renderMarketingSummary(); renderMarketingProducts(); renderMarketingMediaGrid(); renderMarketingPosts(); renderMarketingAds(); renderMarketingAnalytics(); renderMarketingConnections();
    if (!quiet) IA.toast("Data Marketing sudah diperbarui.");
    return true;
  } catch (error) {
    if (!quiet) IA.toast(error.message);
    return false;
  } finally {
    marketingState.loading = false;
  }
}

function selectedProduct() {
  return marketingState.products.find(product => product.key === mkt("marketingProduct").value) || null;
}

function marketingFormPayload() {
  const product = selectedProduct();
  return {
    title: mkt("marketingTitle").value.trim(), product_key: product?.key || "", product_name: product?.name || "",
    content_type: mkt("marketingContentType").value, objective: mkt("marketingObjective").value, audience: mkt("marketingAudience").value.trim(),
    hook: mkt("marketingHook").value.trim(), body: mkt("marketingBody").value.trim(), cta: mkt("marketingCta").value.trim(),
    caption_instagram: mkt("marketingCaptionInstagram").value.trim(), caption_facebook: mkt("marketingCaptionFacebook").value.trim(),
    caption_tiktok: mkt("marketingCaptionTiktok").value.trim(), caption_x: mkt("marketingCaptionX").value.trim(),
    hashtags: mkt("marketingHashtags").value.split(/[\s,#]+/).filter(Boolean),
    platforms: [...document.querySelectorAll('input[name="marketing_platform"]:checked')].map(input => input.value),
    media_ids: [...marketingState.selectedMedia], scheduled_at: mkt("marketingSchedule").value || null,
    storyboard: marketingState.storyboard?.scenes || [], veo_prompt: mkt("marketingVeoPrompt").value.trim()
  };
}

function updateMarketingScore() {
  const payload = marketingFormPayload();
  let score = 35;
  if (payload.hook.length >= 18 && payload.hook.length <= 100) score += 18;
  if (payload.body.length >= 80) score += 15;
  if (payload.body.length >= 180) score += 8;
  if (/whatsapp|pesan|konsultasi|cek katalog|hubungi/i.test(payload.cta)) score += 12;
  if (payload.platforms.length >= 2) score += 7;
  if (payload.media_ids.length) score += 5;
  mkt("marketingScore").textContent = Math.min(100, score);
}

function resetMarketingContent() {
  mkt("marketingContentForm").reset();
  mkt("marketingPostId").value = "";
  mkt("marketingEditorTitle").textContent = "Konten Baru";
  mkt("marketingSaveContent").textContent = "Simpan Draft";
  mkt("marketingEngineLabel").textContent = "Mode lokal gratis";
  mkt("marketingStrategy").innerHTML = `<span class="muted">Buat strategi untuk melihat rekomendasi.</span>`;
  mkt("marketingStoryboardOutput").innerHTML = `<span class="muted">Storyboard akan tampil di sini.</span>`;
  marketingState.selectedMedia.clear();
  marketingState.storyboard = null;
  renderMarketingMediaPicker();
  updateMarketingScore();
}

function applyMarketingDraft(draft) {
  const product = selectedProduct();
  if (!mkt("marketingTitle").value) mkt("marketingTitle").value = `${mkt("marketingContentType").value} · ${product?.name || "Konten Impossible"}`;
  mkt("marketingHook").value = draft.hook || "";
  mkt("marketingBody").value = draft.body || "";
  mkt("marketingCta").value = draft.cta || "";
  mkt("marketingCaptionInstagram").value = draft.copies?.instagram || "";
  mkt("marketingCaptionFacebook").value = draft.copies?.facebook || "";
  mkt("marketingCaptionTiktok").value = draft.copies?.tiktok || "";
  mkt("marketingCaptionX").value = draft.copies?.x || "";
  mkt("marketingHashtags").value = (draft.hashtags || []).join(", ");
  mkt("marketingEngineLabel").textContent = `${draft.engine || "STRATEGI"} · score ${draft.fyp_score || 0}/100`;
  mkt("marketingStrategy").innerHTML = (draft.strategy || []).length ? draft.strategy.map(reason => `<span>• ${IA.escape(reason)}</span>`).join("") : `<span class="muted">Strategi sudah dibuat.</span>`;
  updateMarketingScore();
}

async function generateMarketingDraft() {
  const product = selectedProduct();
  if (!product) return IA.toast("Pilih produk terlebih dahulu.");
  const button = mkt("marketingGenerate");
  button.disabled = true; button.textContent = mkt("marketingUseAi").checked ? "Gemini menganalisa…" : "Menyusun strategi…";
  try {
    const data = await IA.api(`${MKT_API}/generate`, { method: "POST", body: JSON.stringify({
      product: product.name, audience: mkt("marketingAudience").value, objective: mkt("marketingObjective").value,
      content_type: mkt("marketingContentType").value, offer: mkt("marketingOffer").value,
      source_media_id: [...marketingState.selectedMedia][0] || null, use_ai: mkt("marketingUseAi").checked
    }) });
    applyMarketingDraft(data.draft || {});
    IA.toast("Strategi dan caption siap diperiksa.");
  } catch (error) { IA.toast(error.message); }
  finally { button.disabled = false; button.textContent = "✨ Buat Strategi & Caption"; }
}

function renderStoryboard(storyboard) {
  marketingState.storyboard = storyboard;
  mkt("marketingVeoPrompt").value = storyboard.veo_prompt || "";
  mkt("marketingStoryboardOutput").innerHTML = `<div class="marketing-strategy"><strong>${IA.escape(storyboard.concept || "Konsep video")}</strong><span>${IA.escape(storyboard.notes || "")}</span></div>${(storyboard.scenes || []).map(scene => `<article class="marketing-scene"><strong>${IA.escape(scene.second || "Scene")}</strong><span>${IA.escape(scene.visual || "")}</span><small>${IA.escape(scene.purpose || "")}</small></article>`).join("")}<small class="field-help">Engine: ${IA.escape(storyboard.engine || "STORYBOARD")}</small>`;
}

async function generateMarketingStoryboard() {
  const product = selectedProduct();
  if (!product) return IA.toast("Pilih produk terlebih dahulu.");
  const button = mkt("marketingStoryboard");
  button.disabled = true; button.textContent = "Menyusun storyboard…";
  try {
    const data = await IA.api(`${MKT_API}/storyboard`, { method: "POST", body: JSON.stringify({
      product: product.name, audience: mkt("marketingAudience").value, objective: mkt("marketingObjective").value,
      hook: mkt("marketingHook").value, cta: mkt("marketingCta").value, brief: mkt("marketingOffer").value,
      source_media_id: Number(mkt("marketingVideoSource").value) || [...marketingState.selectedMedia][0] || null, use_ai: mkt("marketingUseAi").checked
    }) });
    renderStoryboard(data.storyboard || {});
    IA.toast("Storyboard 9:16 sudah siap.");
  } catch (error) { IA.toast(error.message); }
  finally { button.disabled = false; button.textContent = "Buat Storyboard 9:16"; }
}

async function saveMarketingContent(event) {
  event.preventDefault();
  const id = Number(mkt("marketingPostId").value) || null;
  const payload = marketingFormPayload();
  if (!payload.title || !payload.hook || !payload.body) return IA.toast("Judul, hook, dan isi utama wajib diisi.");
  const button = mkt("marketingSaveContent");
  button.disabled = true; button.textContent = "Menyimpan…";
  try {
    await IA.api(id ? `${MKT_API}/posts/${id}` : `${MKT_API}/posts`, { method: id ? "PUT" : "POST", body: JSON.stringify(payload) });
    resetMarketingContent();
    await loadMarketingAll({ quiet: true });
    marketingTab("library");
    IA.toast(id ? "Konten diperbarui dan kembali menjadi draft." : "Draft konten berhasil disimpan.");
  } catch (error) { IA.toast(error.message); }
  finally { button.disabled = false; button.textContent = "Simpan Draft"; }
}

function toLocalDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function editMarketingPost(id) {
  const post = marketingState.posts.find(item => item.id === id);
  if (!post) return;
  mkt("marketingPostId").value = post.id;
  mkt("marketingEditorTitle").textContent = `Edit Konten #${post.id}`;
  mkt("marketingSaveContent").textContent = "Simpan Perubahan";
  mkt("marketingProduct").value = post.product_key || "";
  mkt("marketingContentType").value = post.content_type || "PRODUCT PROOF";
  mkt("marketingObjective").value = post.objective || "ORDER WHATSAPP";
  mkt("marketingAudience").value = post.audience || "";
  mkt("marketingTitle").value = post.title || "";
  mkt("marketingHook").value = post.hook || "";
  mkt("marketingBody").value = post.body || "";
  mkt("marketingCta").value = post.cta || "";
  mkt("marketingCaptionInstagram").value = post.caption_instagram || "";
  mkt("marketingCaptionFacebook").value = post.caption_facebook || "";
  mkt("marketingCaptionTiktok").value = post.caption_tiktok || "";
  mkt("marketingCaptionX").value = post.caption_x || "";
  mkt("marketingHashtags").value = (post.hashtags || []).join(", ");
  mkt("marketingSchedule").value = toLocalDateTime(post.scheduled_at);
  document.querySelectorAll('input[name="marketing_platform"]').forEach(input => { input.checked = (post.platforms || []).includes(input.value); });
  marketingState.selectedMedia = new Set(post.media_ids || []);
  marketingState.storyboard = { scenes: post.storyboard || [], veo_prompt: post.veo_prompt || "", concept: post.title, engine: "TERSIMPAN" };
  renderStoryboard(marketingState.storyboard);
  renderMarketingMediaPicker(); updateMarketingScore(); marketingTab("content");
  mkt("marketingContentForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function changeMarketingPostStatus(id, status) {
  const labels = { REVIEW: "Kirim konten ke Review?", APPROVED: "Approve konten ini?", DRAFT: "Kembalikan konten menjadi Draft?", SCHEDULED: "Aktifkan jadwal konten ini?" };
  if (!confirm(labels[status] || `Ubah status menjadi ${status}?`)) return;
  try {
    await IA.api(`${MKT_API}/posts/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
    await loadMarketingAll({ quiet: true }); IA.toast("Status konten diperbarui.");
  } catch (error) { IA.toast(error.message); }
}

async function publishMarketingPost(id) {
  const post = marketingState.posts.find(item => item.id === id);
  if (!post) return;
  if (!confirm(`Tandai konten ini sudah diposting ke ${post.platforms.join(", ")}?

Tindakan ini hanya mencatat publikasi. Iklan tidak dijalankan dan uang tidak dibelanjakan otomatis.`)) return;
  try {
    await IA.api(`${MKT_API}/posts/${id}/publish`, { method: "POST", body: JSON.stringify({ platforms: post.platforms }) });
    await loadMarketingAll({ quiet: true }); IA.toast("Publikasi berhasil dicatat.");
  } catch (error) { IA.toast(error.message); }
}

async function deleteMarketingPost(id) {
  if (!confirm("Hapus konten ini? Media asli tidak ikut terhapus.")) return;
  try { await IA.api(`${MKT_API}/posts/${id}`, { method: "DELETE" }); await loadMarketingAll({ quiet: true }); IA.toast("Konten dihapus."); }
  catch (error) { IA.toast(error.message); }
}

async function uploadMarketingMedia(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const files = form.querySelector('input[type="file"]').files;
  if (!files.length) return IA.toast("Pilih foto atau video terlebih dahulu.");
  if (files.length > 8) return IA.toast("Maksimal 8 file dalam satu kali upload.");
  const button = mkt("marketingUploadMedia"); button.disabled = true; button.textContent = "Mengupload…";
  try { await IA.api(`${MKT_API}/media`, { method: "POST", body: new FormData(form) }); form.reset(); await loadMarketingAll({ quiet: true }); IA.toast("Media marketing berhasil diupload."); }
  catch (error) { IA.toast(error.message); }
  finally { button.disabled = false; button.textContent = "Upload Media"; }
}

async function deleteMarketingMedia(id) {
  if (!confirm("Hapus media ini? Media juga dilepas dari draft konten yang menggunakannya.")) return;
  try { await IA.api(`${MKT_API}/media/${id}`, { method: "DELETE" }); marketingState.selectedMedia.delete(id); await loadMarketingAll({ quiet: true }); IA.toast("Media dihapus."); }
  catch (error) { IA.toast(error.message); }
}

function updateAdTotal() {
  mkt("marketingAdTotal").textContent = mktRupiah(Number(mkt("marketingAdBudget").value || 0) * Number(mkt("marketingAdDays").value || 0));
}

async function saveMarketingAd(event) {
  event.preventDefault();
  try {
    await IA.api(`${MKT_API}/ads`, { method: "POST", body: JSON.stringify({ platform: mkt("marketingAdPlatform").value, name: mkt("marketingAdName").value, objective: mkt("marketingAdObjective").value, daily_budget: mkt("marketingAdBudget").value, duration_days: mkt("marketingAdDays").value, audience: mkt("marketingAdAudience").value, creative_notes: mkt("marketingAdCreative").value }) });
    event.currentTarget.reset(); mkt("marketingAdBudget").value = 50000; mkt("marketingAdDays").value = 7; updateAdTotal(); await loadMarketingAll({ quiet: true }); IA.toast("Draft rencana iklan dibuat.");
  } catch (error) { IA.toast(error.message); }
}

async function approveMarketingAd(id) {
  if (!confirm("Setujui budget rencana ini? Sistem tetap tidak akan membelanjakan uang otomatis.")) return;
  try { await IA.api(`${MKT_API}/ads/${id}/approve`, { method: "POST", body: "{}" }); await loadMarketingAll({ quiet: true }); IA.toast("Budget rencana disetujui."); }
  catch (error) { IA.toast(error.message); }
}

async function deleteMarketingAd(id) {
  if (!confirm("Hapus rencana iklan ini?")) return;
  try { await IA.api(`${MKT_API}/ads/${id}`, { method: "DELETE" }); await loadMarketingAll({ quiet: true }); IA.toast("Rencana iklan dihapus."); }
  catch (error) { IA.toast(error.message); }
}

async function saveMarketingMetric(event) {
  event.preventDefault();
  const value = id => Number(mkt(id).value) || 0;
  try {
    await IA.api(`${MKT_API}/metrics`, { method: "POST", body: JSON.stringify({ platform: mkt("marketingMetricPlatform").value, metric_date: mkt("marketingMetricDate").value, post_id: value("marketingMetricPost") || null, views: value("marketingMetricViews"), likes: value("marketingMetricLikes"), comments: value("marketingMetricComments"), shares: value("marketingMetricShares"), saves: value("marketingMetricSaves"), clicks: value("marketingMetricClicks"), whatsapp_clicks: value("marketingMetricWhatsapp"), orders: value("marketingMetricOrders"), revenue: value("marketingMetricRevenue"), note: mkt("marketingMetricNote").value }) });
    event.currentTarget.reset(); mkt("marketingMetricDate").value = new Date().toISOString().slice(0, 10); await loadMarketingAll({ quiet: true }); IA.toast("Performa marketing tersimpan.");
  } catch (error) { IA.toast(error.message); }
}

async function deleteMarketingMetric(id) {
  if (!confirm("Hapus data performa ini?")) return;
  try { await IA.api(`${MKT_API}/metrics/${id}`, { method: "DELETE" }); await loadMarketingAll({ quiet: true }); IA.toast("Data performa dihapus."); }
  catch (error) { IA.toast(error.message); }
}

async function saveMarketingConnection(card) {
  const platform = card.dataset.mktConnection;
  const config = {};
  card.querySelectorAll("[data-mkt-connection-field]").forEach(input => { if (input.value.trim()) config[input.dataset.mktConnectionField] = input.value.trim(); });
  if (!Object.keys(config).length) return IA.toast("Isi minimal satu kolom konfigurasi.");
  try { await IA.api(`${MKT_API}/connections/${platform}`, { method: "PUT", body: JSON.stringify({ config }) }); card.querySelectorAll('input[type="password"]').forEach(input => { input.value = ""; }); await loadMarketingAll({ quiet: true }); IA.toast("Konfigurasi tersimpan dan terenkripsi."); }
  catch (error) { IA.toast(error.message); }
}

async function testMarketingConnection(platform) {
  try { const data = await IA.api(`${MKT_API}/connections/${platform}/test`, { method: "POST", body: "{}", timeoutMs: 35000 }); await loadMarketingAll({ quiet: true }); IA.toast(data.message || "Pemeriksaan selesai."); }
  catch (error) { IA.toast(error.message); }
}

async function deleteMarketingConnection(platform) {
  if (!confirm(`Hapus credential ${platform}?`)) return;
  try { await IA.api(`${MKT_API}/connections/${platform}`, { method: "DELETE" }); await loadMarketingAll({ quiet: true }); IA.toast("Koneksi dihapus."); }
  catch (error) { IA.toast(error.message); }
}

async function saveMarketingSettings(event) {
  event.preventDefault();
  try { await IA.api(`${MKT_API}/settings`, { method: "PUT", body: JSON.stringify({ strategy_model: mkt("marketingStrategyModel").value, video_model: mkt("marketingDefaultVideoModel").value, daily_video_limit: mkt("marketingDailyLimit").value, monthly_ai_budget_idr: mkt("marketingMonthlyBudget").value, usd_idr: mkt("marketingUsdIdr").value, brand_voice: mkt("marketingBrandVoice").value, default_audience: mkt("marketingDefaultAudience").value }) }); await loadMarketingAll({ quiet: true }); IA.toast("Pengaturan marketing disimpan."); }
  catch (error) { IA.toast(error.message); }
}

async function startMarketingVideo() {
  const prompt = mkt("marketingVeoPrompt").value.trim();
  if (!prompt) return IA.toast("Buat storyboard atau isi Prompt Veo terlebih dahulu.");
  if (!confirm("Generate Veo dapat menggunakan saldo/kuota Google AI. Lanjut setelah Budget Guard diperiksa?")) return;
  const button = mkt("marketingGenerateVideo"); button.disabled = true; button.textContent = "Mengirim ke Veo…";
  try {
    const data = await IA.api(`${MKT_API}/video/start`, { method: "POST", timeoutMs: 95000, body: JSON.stringify({ prompt, model: mkt("marketingVideoModel").value, duration_seconds: Number(mkt("marketingVideoDuration").value), resolution: mkt("marketingVideoResolution").value, source_media_id: Number(mkt("marketingVideoSource").value) || null }) });
    renderMarketingUsage(data.usage || {}); IA.toast(`Veo mulai memproses. Estimasi ${mktRupiah(data.estimate_idr)}.`); scheduleVideoPoll(data.job_id);
  } catch (error) { IA.toast(error.message); }
  finally { button.disabled = false; button.textContent = "🎬 Generate Video dengan Veo"; }
}

function scheduleVideoPoll(id) {
  clearTimeout(marketingState.pollTimers.get(id));
  marketingState.pollTimers.set(id, setTimeout(() => pollMarketingVideo(id), 10000));
}

async function pollMarketingVideo(id) {
  try {
    const data = await IA.api(`${MKT_API}/video/${id}`, { timeoutMs: 50000 });
    if (data.usage) renderMarketingUsage(data.usage);
    if (data.job?.status === "PROCESSING") return scheduleVideoPoll(id);
    marketingState.pollTimers.delete(id);
    await loadMarketingAll({ quiet: true });
    IA.toast(data.job?.status === "DONE" ? "Video Veo selesai dan masuk Media Manager." : data.job?.error_message || "Generate video selesai dengan status gagal.");
  } catch (error) { marketingState.pollTimers.delete(id); IA.toast(error.message); }
}

document.querySelectorAll("[data-marketing-tab]").forEach(button => button.addEventListener("click", () => marketingTab(button.dataset.marketingTab)));
document.querySelectorAll("[data-go-marketing]").forEach(button => button.addEventListener("click", () => marketingTab(button.dataset.goMarketing)));
mkt("marketingRefresh").addEventListener("click", () => loadMarketingAll());
mkt("marketingNewContent").addEventListener("click", () => { resetMarketingContent(); marketingTab("content"); });
mkt("marketingResetContent").addEventListener("click", resetMarketingContent);
mkt("marketingGenerate").addEventListener("click", generateMarketingDraft);
mkt("marketingStoryboard").addEventListener("click", generateMarketingStoryboard);
mkt("marketingGenerateVideo").addEventListener("click", startMarketingVideo);
mkt("marketingContentForm").addEventListener("submit", saveMarketingContent);
mkt("marketingContentForm").addEventListener("input", updateMarketingScore);
mkt("marketingMediaForm").addEventListener("submit", uploadMarketingMedia);
mkt("marketingPostFilter").addEventListener("change", renderMarketingPosts);
mkt("marketingAdsForm").addEventListener("submit", saveMarketingAd);
mkt("marketingAdBudget").addEventListener("input", updateAdTotal);
mkt("marketingAdDays").addEventListener("input", updateAdTotal);
mkt("marketingMetricForm").addEventListener("submit", saveMarketingMetric);
mkt("marketingSettingsForm").addEventListener("submit", saveMarketingSettings);
mkt("marketingUseAi").addEventListener("change", event => { mkt("marketingEngineLabel").textContent = event.currentTarget.checked ? "Gemini aktif · perlu API Key" : "Mode lokal gratis"; });
mkt("marketingMetricDate").value = new Date().toISOString().slice(0, 10);
updateAdTotal();
window.IAMarketing = { loadAll: loadMarketingAll, open: () => { setView("marketing"); loadMarketingAll({ quiet: true }); } };
if (location.hash === "#marketing") loadMarketingAll({ quiet: true });
