"use strict";

const IS_PUBLIC_ADMIN = true;
const API_BASE = "/api/admin";
const STAGES = ["DESAIN", "APPROVAL", "PRINTING", "PRESS", "JAHIT", "QC", "PACKING", "SELESAI"];
const PAGE_TITLES = { dashboard: "Dashboard", instructions: "Instruksi", tracking: "Tracking Produksi", orderTypes: "Jenis Order & HPP", marketing: "Marketing Sosmed & Iklan", website: "Website Publik", cashflow: "Cashflow", billing: "Invoice & Kwitansi" };
const state = { jobs: [], invoices: [], rawMaterials: [], orderTypes: [], cashflow: { summary: {}, per_spk: [], transactions: [] }, websiteSettings: {}, catalogProducts: [], selectedId: null, trackingJobId: null, publicUrl: "", designUrl: "", messageTimer: null, currentView: "dashboard" };
const list = document.getElementById("jobList");
const detail = document.getElementById("detailPanel");

function rupiah(value) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function badge(value) {
  return `<span class="badge ${IA.attr(value)}">${IA.escape(value)}</span>`;
}

function selectedJob() {
  return state.jobs.find(job => job.id === state.selectedId);
}

function setView(name) {
  if (!PAGE_TITLES[name]) name = "dashboard";
  state.currentView = name;
  document.querySelectorAll(".portal-view").forEach(view => view.classList.toggle("hide", view.dataset.page !== name));
  document.querySelectorAll("[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === name));
  document.getElementById("pageTitle").textContent = PAGE_TITLES[name];
  if (location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
  if (name === "marketing") window.IAMarketing?.loadAll({ quiet: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function fallbackDesignUrl() {
  return "/desain";
}

function updateDesignLinks(url = state.designUrl || fallbackDesignUrl()) {
  ["designDashboardLink", "designDashboardLinkMobile"].forEach(id => {
    const link = document.getElementById(id);
    if (link) link.href = url;
  });
}

function renderList() {
  document.getElementById("jobCount").textContent = state.jobs.length;
  list.innerHTML = state.jobs.length ? state.jobs.map(job => `
    <button class="job-item ${job.id === state.selectedId ? "active" : ""}" data-id="${job.id}">
      <div class="job-line"><strong>${IA.escape(job.spk)}</strong>${badge(job.status)}</div>
      <p>${IA.escape(job.product)}</p>
      <div class="job-line"><small>${IA.escape(job.customer)} · ${job.qty} pcs</small>${job.priority === "URGENT" ? badge("URGENT") : ""}</div>
    </button>`).join("") : `<div class="detail-empty"><div><strong>Belum ada instruksi</strong><p>Klik “Instruksi baru” untuk membuat SPK.</p></div></div>`;
  list.querySelectorAll("[data-id]").forEach(button => button.addEventListener("click", () => selectJob(Number(button.dataset.id))));
}

function renderFiles(files) {
  return files.length ? files.map(file => `<div class="file-row"><a href="/api/files/${file.id}" title="${IA.attr(file.filename)}">${IA.escape(file.filename)}</a><small>${Math.ceil(file.size / 1024)} KB</small></div>`).join("") : `<p class="muted">Belum ada file.</p>`;
}

function renderDetail() {
  const job = selectedJob();
  if (!job) {
    detail.innerHTML = `<div class="detail-empty"><div><strong>Pilih SPK</strong><p>Detail instruksi dan komunikasi akan tampil di sini.</p></div></div>`;
    return;
  }
  const previews = job.attachments.filter(file => file.kind === "preview");
  const cdr = job.attachments.filter(file => file.kind === "cdr");
  const references = job.attachments.filter(file => file.kind === "reference");
  detail.innerHTML = `<div class="panel-head"><h2>Detail Instruksi</h2>${badge(job.status)}</div>
    <div class="detail-wrap">
      <div class="detail-title"><div><h2>${IA.escape(job.product)}</h2><p>${IA.escape(job.spk)} · ${IA.escape(job.customer)}</p></div>${job.priority === "URGENT" ? badge("URGENT") : ""}</div>
      <div class="facts">
        <div class="fact"><small>Jenis Instruksi</small><strong>${IA.escape(job.instruction_type || "INSTRUKSI BIASA")}</strong></div>
        <div class="fact"><small>Jumlah</small><strong>${job.qty} pcs</strong></div>
        <div class="fact"><small>Deadline</small><strong>${job.deadline ? IA.escape(job.deadline) : "—"}</strong></div>
        <div class="fact"><small>Produksi</small><strong>${IA.escape(job.production.stage)}</strong></div>
        <div class="fact"><small>HPP SPK</small><strong>${rupiah(job.costing?.total_hpp || 0)}</strong></div>
        <div class="fact"><small>Proyeksi Laba</small><strong>${rupiah(job.costing?.projected_profit || 0)}</strong></div>
      </div>
      <div><h3 class="section-title">Brief</h3><div class="fact"><strong>${IA.escape(job.note || "Tidak ada catatan.")}</strong></div></div>
      <div class="customer-code-box"><div><small>AKSES WEBSITE CUSTOMER</small><strong>${IA.escape(job.customer_code || "Belum dibuat")}</strong><span>Customer login memakai nomor ${IA.escape(job.spk)} dan kode ini.</span></div><div><button class="btn btn-small" id="copyCustomerAccess">Salin Akses</button><button class="btn btn-small btn-danger" id="regenerateCustomerCode">Buat Kode Baru</button></div></div>
      <div class="form-grid">
        <div class="field"><label>Status Desain</label><select id="statusField">${["MENUNGGU","PROSES","REVISI","SELESAI"].map(value => `<option ${value === job.status ? "selected" : ""}>${value}</option>`).join("")}</select></div>
        <div class="field"><label>&nbsp;</label><button class="btn btn-dark" id="saveDetail">Simpan perubahan</button></div>
      </div>
      <button class="btn" id="detailTracking">Update Tracking Produksi →</button>
      <div class="files">
        <form class="file-box wide" id="referenceForm"><h3 class="section-title">Lampiran Instruksi (${references.length})</h3>${renderFiles(references)}<div class="field"><label>Tambah lampiran</label><input name="files" type="file" accept="image/*,.pdf,.cdr,.ai,.eps,.svg,.psd,.zip,.rar,.doc,.docx,.xls,.xlsx,.txt" multiple required><small class="field-help">Maksimal 10 file, masing-masing 50 MB.</small></div><button class="btn btn-small btn-dark" type="submit">Unggah Lampiran</button></form>
        <div class="file-box"><h3 class="section-title">Preview (${previews.length})</h3>${renderFiles(previews)}</div>
        <div class="file-box ${cdr.length ? "good" : ""}"><h3 class="section-title"><span class="dot ${cdr.length ? "green" : ""}"></span>File CDR (${cdr.length})</h3>${renderFiles(cdr)}</div>
      </div>
      <div class="chat"><h3 class="section-title">Chat Instruksi ↔ Desain</h3><div class="chat-list" id="chatList"><span class="muted">Memuat pesan…</span></div><form class="chat-send" id="chatForm"><input id="chatInput" maxlength="2000" placeholder="Tulis pesan untuk tim desain…" required><button class="btn btn-primary">Kirim</button></form></div>
    </div>`;
  document.getElementById("saveDetail").addEventListener("click", saveDetail);
  document.getElementById("copyCustomerAccess").addEventListener("click", copyCustomerAccess);
  document.getElementById("regenerateCustomerCode").addEventListener("click", regenerateCustomerCode);
  document.getElementById("detailTracking").addEventListener("click", () => openTracking(job.id));
  document.getElementById("referenceForm").addEventListener("submit", uploadReference);
  document.getElementById("chatForm").addEventListener("submit", sendMessage);
  loadMessages();
  clearInterval(state.messageTimer);
  state.messageTimer = setInterval(loadMessages, 3000);
}

function renderDashboard() {
  const active = state.jobs.filter(job => job.status !== "SELESAI");
  const waiting = state.jobs.filter(job => job.status === "MENUNGGU");
  const production = state.jobs.filter(job => job.production.stage !== "BELUM DIMULAI" && job.production.stage !== "SELESAI");
  const outstanding = state.invoices.reduce((sum, invoice) => sum + invoice.balance, 0);
  document.getElementById("statActive").textContent = active.length;
  document.getElementById("statWaiting").textContent = waiting.length;
  document.getElementById("statProduction").textContent = production.length;
  document.getElementById("statOutstanding").textContent = rupiah(outstanding);
  const max = Math.max(1, ...STAGES.map(stage => state.jobs.filter(job => job.production.stage === stage).length));
  document.getElementById("productionSummary").innerHTML = STAGES.map(stage => {
    const count = state.jobs.filter(job => job.production.stage === stage).length;
    return `<div class="production-row"><span>${stage}</span><progress class="mini-progress" value="${count}" max="${max}"></progress><strong>${count}</strong></div>`;
  }).join("");
  document.getElementById("recentJobs").innerHTML = state.jobs.slice(0, 6).map(job => `<div class="recent-item"><div><strong>${IA.escape(job.spk)} · ${IA.escape(job.product)}</strong><small>${IA.escape(job.customer)} · ${IA.date(job.updated_at)}</small></div>${badge(job.status)}</div>`).join("") || `<div class="detail-empty"><small>Belum ada SPK.</small></div>`;
}

function renderTracking() {
  const query = document.getElementById("trackingSearch").value.trim().toLowerCase();
  const jobs = state.jobs.filter(job => !query || `${job.spk} ${job.customer} ${job.product}`.toLowerCase().includes(query));
  document.getElementById("trackingGrid").innerHTML = jobs.length ? jobs.map(job => `<article class="tracking-card">
    <div class="tracking-card-head"><strong>${IA.escape(job.spk)}</strong>${job.priority === "URGENT" ? badge("URGENT") : ""}</div>
    <h3>${IA.escape(job.product)}</h3><p>${IA.escape(job.customer)} · ${job.qty} pcs</p>
    <progress class="production-progress" value="${job.production.progress}" max="100"></progress>
    <div class="progress-meta"><span class="stage-badge">${IA.escape(job.production.stage)}</span><span>${job.production.progress}%</span></div>
    <div class="tracking-card-foot"><small>${job.production.updated_at ? IA.date(job.production.updated_at) : "Belum dimulai"}</small><button class="btn btn-small btn-dark" data-track="${job.id}">Update</button></div>
  </article>`).join("") : `<div class="detail-empty"><div><strong>SPK tidak ditemukan</strong><p>Coba kata pencarian lain.</p></div></div>`;
  document.querySelectorAll("[data-track]").forEach(button => button.addEventListener("click", () => openTracking(Number(button.dataset.track))));
}

async function openTracking(jobId) {
  const job = state.jobs.find(item => item.id === jobId);
  if (!job) return;
  state.trackingJobId = jobId;
  document.getElementById("trackingModal").hidden = false;
  document.getElementById("trackingModalTitle").textContent = job.spk;
  document.getElementById("trackingModalSub").textContent = `${job.customer} · ${job.product}`;
  document.getElementById("trackingStage").innerHTML = STAGES.map(stage => `<option ${stage === job.production.stage ? "selected" : ""}>${stage}</option>`).join("");
  document.getElementById("trackingNote").value = "";
  document.getElementById("trackingHistory").innerHTML = `<span class="muted">Memuat riwayat…</span>`;
  try {
    const data = await IA.api(`${API_BASE}/tracking/${jobId}`);
    document.getElementById("trackingHistory").innerHTML = data.history.length ? data.history.map(item => `<div class="timeline-item"><strong>${IA.escape(item.stage)}</strong><p>${IA.escape(item.note || "Tanpa catatan")}</p><small>${IA.escape(item.actor)} · ${IA.date(item.created_at)}</small></div>`).join("") : `<span class="muted">Belum ada riwayat produksi.</span>`;
  } catch (err) { IA.toast(err.message); }
}

function closeTracking() {
  state.trackingJobId = null;
  document.getElementById("trackingModal").hidden = true;
}

async function submitTracking(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  try {
    await IA.api(`${API_BASE}/tracking/${state.trackingJobId}`, { method: "POST", body: JSON.stringify({ stage: document.getElementById("trackingStage").value, note: document.getElementById("trackingNote").value }) });
    const jobId = state.trackingJobId;
    await loadJobs({ quiet: true });
    await openTracking(jobId);
    IA.toast("Tracking produksi diperbarui.");
  } catch (err) { IA.toast(err.message); }
  finally { button.disabled = false; }
}

function hppQuantity(value) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(Number(value) || 0);
}

function hppMaterialRow(material = {}) {
  const row = document.createElement("div");
  row.className = "hpp-material-row";
  const selectedId = Number(material.raw_material_id) || state.rawMaterials.find(item => item.name.toLowerCase() === String(material.name || "").toLowerCase())?.id || "";
  row.innerHTML = `<div class="field hpp-material-name"><label>Bahan Baku</label><select data-hpp="raw_material_id" required><option value="">Pilih bahan…</option>${state.rawMaterials.map(item => `<option value="${item.id}" ${item.id === selectedId ? "selected" : ""}>${IA.escape(item.name)} · ${rupiah(item.unit_price)}/${IA.escape(item.unit)}</option>`).join("")}</select></div><div class="field"><label>Kebutuhan</label><input data-hpp="qty" type="number" min="0.001" step="0.001" value="${IA.attr(material.qty || 1)}" required></div><div class="hpp-material-info"><span>Satuan</span><strong data-hpp-display="unit">—</strong></div><div class="hpp-material-info"><span>Harga Satuan</span><strong data-hpp-display="price">Rp0</strong></div><div class="hpp-row-subtotal"><span>Subtotal</span><strong>${rupiah(material.subtotal || 0)}</strong></div><button class="remove-item" type="button" title="Hapus bahan">×</button>`;
  row.querySelector(".remove-item").addEventListener("click", () => {
    if (document.querySelectorAll(".hpp-material-row").length > 1) row.remove();
    calculateHpp();
  });
  row.querySelectorAll("input,select").forEach(input => input.addEventListener("input", calculateHpp));
  document.getElementById("hppMaterialList").appendChild(row);
  calculateHpp();
}

function calculateHpp() {
  let total = 0;
  document.querySelectorAll(".hpp-material-row").forEach(row => {
    const qty = Number(row.querySelector('[data-hpp="qty"]').value) || 0;
    const master = state.rawMaterials.find(item => item.id === Number(row.querySelector('[data-hpp="raw_material_id"]').value));
    const price = Number(master?.unit_price) || 0;
    const subtotal = Math.round(qty * price);
    total += subtotal;
    row.querySelector('[data-hpp-display="unit"]').textContent = master?.unit || "—";
    row.querySelector('[data-hpp-display="price"]').textContent = rupiah(price);
    row.querySelector(".hpp-row-subtotal strong").textContent = rupiah(subtotal);
  });
  const sellingPrice = Number(document.getElementById("orderTypeSellingPrice").value) || 0;
  const profit = sellingPrice - total;
  const margin = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0;
  document.getElementById("hppGrandTotal").textContent = rupiah(total);
  document.getElementById("hppProfit").textContent = rupiah(profit);
  document.getElementById("hppProfit").classList.toggle("negative", profit < 0);
  document.getElementById("hppMargin").textContent = `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(margin)}%`;
  document.getElementById("hppOutputLabel").textContent = document.getElementById("orderTypeUnit").value.trim() || "pcs";
}

function openOrderType(orderTypeId = null) {
  const orderType = state.orderTypes.find(item => item.id === orderTypeId);
  const hasRawMaterials = state.rawMaterials.length > 0;
  const form = document.getElementById("orderTypeForm");
  form.reset();
  document.getElementById("orderTypeId").value = orderType?.id || "";
  document.getElementById("orderTypeModalTitle").textContent = orderType ? "Edit Jenis Order" : "Jenis Order Baru";
  document.getElementById("orderTypeName").value = orderType?.name || "";
  document.getElementById("orderTypeUnit").value = orderType?.output_unit || "pcs";
  document.getElementById("orderTypeSellingPrice").value = orderType?.selling_price || 0;
  document.getElementById("orderTypeNote").value = orderType?.note || "";
  document.getElementById("hppMaterialList").innerHTML = "";
  document.getElementById("orderTypeMaterialWarning").classList.toggle("hide", hasRawMaterials);
  document.getElementById("addHppMaterial").disabled = !hasRawMaterials;
  document.getElementById("saveOrderType").disabled = !hasRawMaterials;
  if (hasRawMaterials) (orderType?.materials?.length ? orderType.materials : [{}]).forEach(hppMaterialRow);
  calculateHpp();
  document.getElementById("orderTypeModal").hidden = false;
}

function closeOrderType() {
  document.getElementById("orderTypeModal").hidden = true;
}

function orderTypePayload() {
  return {
    name: document.getElementById("orderTypeName").value,
    output_unit: document.getElementById("orderTypeUnit").value,
    selling_price: Number(document.getElementById("orderTypeSellingPrice").value) || 0,
    note: document.getElementById("orderTypeNote").value,
    materials: [...document.querySelectorAll(".hpp-material-row")].map(row => ({
      raw_material_id: Number(row.querySelector('[data-hpp="raw_material_id"]').value) || null,
      qty: Number(row.querySelector('[data-hpp="qty"]').value) || 0
    }))
  };
}

async function saveOrderType(event) {
  event.preventDefault();
  const id = Number(document.getElementById("orderTypeId").value) || null;
  const button = document.getElementById("saveOrderType");
  button.disabled = true;
  button.textContent = "Menyimpan…";
  try {
    await IA.api(`${API_BASE}/order-types${id ? `/${id}` : ""}`, { method: id ? "PUT" : "POST", body: JSON.stringify(orderTypePayload()) });
    closeOrderType();
    await loadOrderTypes();
    IA.toast(id ? "Jenis order diperbarui." : "Jenis order berhasil ditambahkan.");
  } catch (err) { IA.toast(err.message); }
  finally { button.disabled = false; button.textContent = "Simpan Jenis Order"; }
}

async function removeOrderType(id) {
  const orderType = state.orderTypes.find(item => item.id === id);
  if (!orderType || !confirm(`Hapus jenis order ${orderType.name}?`)) return;
  try {
    await IA.api(`${API_BASE}/order-types/${id}`, { method: "DELETE" });
    await loadOrderTypes();
    IA.toast("Jenis order dihapus.");
  } catch (err) { IA.toast(err.message); }
}

function renderOrderTypes() {
  const average = state.orderTypes.length ? Math.round(state.orderTypes.reduce((sum, item) => sum + item.total_hpp, 0) / state.orderTypes.length) : 0;
  const averageProfit = state.orderTypes.length ? Math.round(state.orderTypes.reduce((sum, item) => sum + item.profit_per_unit, 0) / state.orderTypes.length) : 0;
  document.getElementById("orderTypeCount").textContent = state.orderTypes.length;
  document.getElementById("rawMaterialCount").textContent = state.rawMaterials.length;
  document.getElementById("averageHpp").textContent = rupiah(average);
  document.getElementById("averageProfit").textContent = rupiah(averageProfit);
  const query = document.getElementById("orderTypeSearch").value.trim().toLowerCase();
  const filtered = state.orderTypes.filter(item => !query || `${item.name} ${item.note} ${item.materials.map(material => material.name).join(" ")}`.toLowerCase().includes(query));
  document.getElementById("orderTypeGrid").innerHTML = filtered.length ? filtered.map(item => `<article class="order-type-card">
    <div class="order-type-head"><div><span class="hero-kicker">HPP / ${IA.escape(item.output_unit)}</span><h3>${IA.escape(item.name)}</h3></div><strong>${rupiah(item.total_hpp)}</strong></div>
    <div class="order-type-profit"><div><span>Harga jual</span><strong>${rupiah(item.selling_price)}</strong></div><div><span>Laba / unit</span><strong class="${item.profit_per_unit < 0 ? "negative" : "positive"}">${rupiah(item.profit_per_unit)}</strong></div><div><span>Margin</span><strong>${hppQuantity(item.margin_percent)}%</strong></div></div>
    <div class="hpp-breakdown">${item.materials.map(material => `<div><span><strong>${IA.escape(material.name)}</strong><small>${hppQuantity(material.qty)} ${IA.escape(material.unit)} × ${rupiah(material.unit_price)}</small></span><strong>${rupiah(material.subtotal)}</strong></div>`).join("")}</div>
    ${item.note ? `<p class="order-type-note">${IA.escape(item.note)}</p>` : ""}
    <div class="order-type-actions"><span>${item.materials.length} bahan baku</span><div><button class="btn btn-small" data-edit-order="${item.id}">Edit</button><button class="btn btn-small btn-danger" data-delete-order="${item.id}">Hapus</button></div></div>
  </article>`).join("") : `<div class="detail-empty"><div><strong>${state.orderTypes.length ? "Jenis order tidak ditemukan" : "Belum ada jenis order"}</strong><p>${state.orderTypes.length ? "Coba kata pencarian lain." : "Klik + Jenis Order untuk membuat perhitungan HPP."}</p></div></div>`;
  document.querySelectorAll("[data-edit-order]").forEach(button => button.addEventListener("click", () => openOrderType(Number(button.dataset.editOrder))));
  document.querySelectorAll("[data-delete-order]").forEach(button => button.addEventListener("click", () => removeOrderType(Number(button.dataset.deleteOrder))));
}

function openRawMaterial(id = null) {
  const material = state.rawMaterials.find(item => item.id === id);
  document.getElementById("rawMaterialForm").reset();
  document.getElementById("rawMaterialId").value = material?.id || "";
  document.getElementById("rawMaterialModalTitle").textContent = material ? "Edit Bahan Baku" : "Bahan Baku Baru";
  document.getElementById("rawMaterialName").value = material?.name || "";
  document.getElementById("rawMaterialUnit").value = material?.unit || "";
  document.getElementById("rawMaterialPrice").value = material?.unit_price || 0;
  document.getElementById("rawMaterialNote").value = material?.note || "";
  document.getElementById("rawMaterialModal").hidden = false;
}

function closeRawMaterial() {
  document.getElementById("rawMaterialModal").hidden = true;
}

async function saveRawMaterial(event) {
  event.preventDefault();
  const id = Number(document.getElementById("rawMaterialId").value) || null;
  const button = document.getElementById("saveRawMaterial");
  const fields = Object.fromEntries(new FormData(event.currentTarget));
  fields.unit_price = Number(fields.unit_price) || 0;
  button.disabled = true;
  button.textContent = "Menyimpan…";
  try {
    await IA.api(`${API_BASE}/raw-materials${id ? `/${id}` : ""}`, { method: id ? "PUT" : "POST", body: JSON.stringify(fields) });
    closeRawMaterial();
    await loadRawMaterials();
    await loadOrderTypes();
    IA.toast(id ? "Bahan baku diperbarui." : "Bahan baku berhasil ditambahkan.");
  } catch (err) { IA.toast(err.message); }
  finally { button.disabled = false; button.textContent = "Simpan Bahan Baku"; }
}

async function removeRawMaterial(id) {
  const material = state.rawMaterials.find(item => item.id === id);
  if (!material || !confirm(`Hapus bahan baku ${material.name}?`)) return;
  try {
    await IA.api(`${API_BASE}/raw-materials/${id}`, { method: "DELETE" });
    await loadRawMaterials();
    IA.toast("Bahan baku dihapus.");
  } catch (err) { IA.toast(err.message); }
}

function renderRawMaterials() {
  document.getElementById("rawMaterialCount").textContent = state.rawMaterials.length;
  const query = document.getElementById("rawMaterialSearch").value.trim().toLowerCase();
  const materials = state.rawMaterials.filter(item => !query || `${item.name} ${item.unit} ${item.note}`.toLowerCase().includes(query));
  document.getElementById("rawMaterialGrid").innerHTML = materials.length ? materials.map(item => `<article class="raw-material-card"><div><span>${IA.escape(item.unit)}</span><h3>${IA.escape(item.name)}</h3><p>${IA.escape(item.note || "Tanpa catatan")}</p></div><strong>${rupiah(item.unit_price)}<small> / ${IA.escape(item.unit)}</small></strong><div class="raw-material-actions"><button class="btn btn-small" data-edit-material="${item.id}">Edit</button><button class="btn btn-small btn-danger" data-delete-material="${item.id}">Hapus</button></div></article>`).join("") : `<div class="detail-empty"><div><strong>${state.rawMaterials.length ? "Bahan tidak ditemukan" : "Belum ada bahan baku"}</strong><p>Klik + Bahan Baku untuk membuat master harga.</p></div></div>`;
  document.querySelectorAll("[data-edit-material]").forEach(button => button.addEventListener("click", () => openRawMaterial(Number(button.dataset.editMaterial))));
  document.querySelectorAll("[data-delete-material]").forEach(button => button.addEventListener("click", () => removeRawMaterial(Number(button.dataset.deleteMaterial))));
}

function renderCashflow() {
  const summary = state.cashflow.summary || {};
  document.getElementById("cashflowIn").textContent = rupiah(summary.total_in);
  document.getElementById("cashflowOut").textContent = rupiah(summary.total_out);
  document.getElementById("cashflowBalance").textContent = rupiah(summary.cash_balance);
  document.getElementById("cashflowReserve").textContent = rupiah(summary.hpp_remaining_total);
  document.getElementById("cashflowProfit").textContent = rupiah(summary.profit_available_total);
  document.getElementById("cashflowProfit").classList.toggle("negative", Number(summary.profit_available_total) < 0);
  document.getElementById("cashflowProjectedProfit").textContent = rupiah(summary.projected_profit_total);
  document.getElementById("cashflowProjectedProfit").classList.toggle("negative", Number(summary.projected_profit_total) < 0);
  const query = document.getElementById("cashflowSearch").value.trim().toLowerCase();
  const rows = (state.cashflow.per_spk || []).filter(row => !query || `${row.spk} ${row.customer} ${row.product}`.toLowerCase().includes(query));
  document.getElementById("cashflowSpkList").innerHTML = rows.length ? rows.map(row => {
    const fundedPercent = row.hpp_remaining > 0 ? Math.min(100, Math.round((row.hpp_funded / row.hpp_remaining) * 100)) : 100;
    return `<article class="cashflow-spk-card"><div class="cashflow-spk-title"><div><span class="hero-kicker">${IA.escape(row.spk)}</span><h3>${IA.escape(row.product)}</h3><p>${IA.escape(row.customer)} · ${row.qty} pcs</p></div><div class="profit-number"><span>Laba aman</span><strong class="${row.profit_available < 0 ? "negative" : "positive"}">${rupiah(row.profit_available)}</strong></div></div><div class="cashflow-spk-numbers"><div><span>Pembayaran masuk</span><strong>${rupiah(row.income)}</strong></div><div><span>Pengeluaran aktual</span><strong>${rupiah(row.expenses)}</strong></div><div><span>Total HPP</span><strong>${rupiah(row.hpp_required)}</strong></div><div><span>Cadangan HPP tersisa</span><strong>${rupiah(row.hpp_remaining)}</strong></div><div><span>Proyeksi laba SPK</span><strong>${rupiah(row.projected_profit)}</strong></div></div><div class="budget-line"><div><span>Budget HPP tersedia ${rupiah(row.hpp_funded)}</span><strong>${fundedPercent}%</strong></div><progress value="${fundedPercent}" max="100"></progress>${row.hpp_shortage > 0 ? `<small>Masih kurang ${rupiah(row.hpp_shortage)} untuk memenuhi cadangan HPP.</small>` : `<small>Cadangan HPP sudah tercukupi oleh kas SPK.</small>`}</div></article>`;
  }).join("") : `<div class="detail-empty"><div><strong>Belum ada perhitungan SPK</strong><p>Buat instruksi dari Jenis Order untuk menghitung HPP.</p></div></div>`;
  const transactions = state.cashflow.transactions || [];
  document.getElementById("cashflowTransactions").innerHTML = transactions.length ? transactions.map(entry => {
    const job = state.jobs.find(item => item.id === entry.job_id);
    return `<div class="cashflow-entry"><span class="flow-icon ${entry.type === "MASUK" ? "in" : "out"}">${entry.type === "MASUK" ? "↓" : "↑"}</span><div><strong>${IA.escape(entry.description)}</strong><small>${IA.escape(entry.date || "")} · ${IA.escape(entry.type === "MASUK" ? entry.method || "Pembayaran" : entry.category)}${job ? ` · ${IA.escape(job.spk)}` : " · Umum"}</small></div><strong class="${entry.type === "MASUK" ? "positive" : "negative"}">${entry.type === "MASUK" ? "+" : "−"}${rupiah(entry.amount)}</strong>${entry.type === "KELUAR" ? `<button class="btn btn-small btn-danger" data-delete-expense="${entry.id}">Hapus</button>` : ""}</div>`;
  }).join("") : `<div class="detail-empty"><div><strong>Belum ada transaksi</strong><p>Pembayaran invoice akan masuk otomatis di sini.</p></div></div>`;
  document.querySelectorAll("[data-delete-expense]").forEach(button => button.addEventListener("click", () => removeExpense(Number(button.dataset.deleteExpense))));
}

function openExpense() {
  document.getElementById("expenseForm").reset();
  document.getElementById("expenseDate").value = new Date().toISOString().slice(0, 10);
  document.getElementById("expenseJob").innerHTML = `<option value="">Umum / tanpa SPK</option>${state.jobs.map(job => `<option value="${job.id}">${IA.escape(job.spk)} · ${IA.escape(job.customer)}</option>`).join("")}`;
  document.getElementById("expenseModal").hidden = false;
}

function closeExpense() {
  document.getElementById("expenseModal").hidden = true;
}

async function saveExpense(event) {
  event.preventDefault();
  const button = document.getElementById("saveExpense");
  const fields = Object.fromEntries(new FormData(event.currentTarget));
  fields.job_id = Number(fields.job_id) || null;
  fields.amount = Number(fields.amount) || 0;
  button.disabled = true;
  button.textContent = "Menyimpan…";
  try {
    await IA.api(`${API_BASE}/cashflow/expenses`, { method: "POST", body: JSON.stringify(fields) });
    closeExpense();
    await loadCashflow();
    setView("cashflow");
    IA.toast("Pengeluaran berhasil dicatat.");
  } catch (err) { IA.toast(err.message); }
  finally { button.disabled = false; button.textContent = "Simpan Pengeluaran"; }
}

async function removeExpense(id) {
  if (!confirm("Hapus catatan pengeluaran ini?")) return;
  try {
    await IA.api(`${API_BASE}/cashflow/expenses/${id}`, { method: "DELETE" });
    await loadCashflow();
    IA.toast("Pengeluaran dihapus.");
  } catch (err) { IA.toast(err.message); }
}

function renderWebsiteSettings() {
  const settings = state.websiteSettings || {};
  document.getElementById("websiteBrand").value = settings.brand_name || "IMPOSSIBLE APPAREL";
  document.getElementById("websiteCatalogTitle").value = settings.catalog_title || "Katalog Impossible";
  document.getElementById("websiteHeroTitle").value = settings.hero_title || "";
  document.getElementById("websiteHeroText").value = settings.hero_text || "";
  document.getElementById("websiteShowAbout").value = settings.show_about === false ? "false" : "true";
  document.getElementById("websiteAboutKicker").value = settings.about_kicker || "TENTANG KAMI";
  document.getElementById("websiteAboutTitle").value = settings.about_title || "DIBUAT UNTUK IDENTITAS ANDA.";
  document.getElementById("websiteAboutText").value = settings.about_text || "";
  document.getElementById("websiteWhatsapp").value = settings.whatsapp || "";
  document.getElementById("websiteInstagram").value = settings.instagram || "";
  document.getElementById("websiteAddress").value = settings.address || "";
  document.getElementById("websitePrimaryColor").value = settings.primary_color || "#e32127";
  document.getElementById("websiteBackgroundColor").value = settings.background_color || "#090909";
  document.getElementById("websiteShowPrices").value = settings.show_prices === false ? "false" : "true";
  document.getElementById("websiteHeroInterval").value = String(settings.hero_interval_seconds || 6);
  document.getElementById("websiteShowTicker").value = settings.show_order_ticker === false ? "false" : "true";
  document.getElementById("websiteTickerLabel").value = settings.ticker_label || "LIVE ORDER";
  document.getElementById("websiteLogoStatus").textContent = settings.logo ? `Logo aktif: ${settings.logo.filename}` : "Menggunakan logo utama.";
  document.getElementById("websiteNavBackgroundStatus").textContent = settings.nav_background ? `Background menu aktif: ${settings.nav_background.filename}` : "Menggunakan warna gelap bawaan.";
  document.getElementById("websiteNavBackgroundPreview").innerHTML = settings.nav_background ? `<img src="${IA.attr(settings.nav_background.url)}" alt="Background menu header aktif">` : "Menggunakan warna gelap bawaan";
  document.getElementById("deleteWebsiteNavBackground").hidden = !settings.nav_background;
  document.getElementById("websiteHeroBackgroundStatus").textContent = settings.background ? `Background hero aktif: ${settings.background.filename}` : "Belum ada background hero khusus.";
  document.getElementById("websiteHeroBackgroundPreview").innerHTML = settings.background ? `<img src="${IA.attr(settings.background.url)}" alt="Background hero website aktif">` : "Belum ada background hero";
  document.getElementById("deleteWebsiteHeroBackground").hidden = !settings.background;
  document.getElementById("websiteAboutBackgroundStatus").textContent = settings.about_background ? `Foto aktif: ${settings.about_background.filename}` : "Jika kosong, sistem memakai foto header sebagai cadangan.";
  document.getElementById("websiteAboutBackgroundPreview").innerHTML = settings.about_background ? `<img src="${IA.attr(settings.about_background.url)}" alt="Foto Tentang Kami aktif">` : "Belum ada foto khusus";
  document.getElementById("deleteWebsiteAboutBackground").hidden = !settings.about_background;
  renderHeroMediaExisting();
  renderWebsiteSummary();
}

function renderHeroMediaExisting() {
  const media = state.websiteSettings?.hero_media || [];
  document.getElementById("websiteHeroMediaExisting").innerHTML = media.length
    ? `<div class="hero-media-help"><strong>${media.length} media aktif</strong><span>Gunakan tombol Hapus pada media yang tidak dipakai.</span></div><div class="hero-media-grid">${media.map((item, index) => `<article class="hero-media-card">${item.media_type === "video" ? `<video src="${IA.attr(item.url)}" muted playsinline preload="metadata" controls></video><b>VIDEO</b>` : `<img src="${IA.attr(item.url)}" alt="Media header ${index + 1}"><b>FOTO</b>`}<button type="button" data-delete-hero-media="${item.id}">Hapus</button><small title="${IA.attr(item.filename)}">${index + 1}. ${IA.escape(item.filename)}</small></article>`).join("")}</div>`
    : `<div class="hero-media-empty"><strong>Belum ada slideshow</strong><span>Unggah foto hasil produksi atau video agar tampil silih berganti pada header website.</span></div>`;
  document.querySelectorAll("[data-delete-hero-media]").forEach(button => button.addEventListener("click", () => deleteWebsiteHeaderMedia(Number(button.dataset.deleteHeroMedia))));
}

function renderWebsiteSummary() {
  const published = state.catalogProducts.filter(product => product.status === "PUBLISH").length;
  const draft = state.catalogProducts.filter(product => product.status === "DRAFT").length;
  const websiteUrl = state.publicUrl ? state.publicUrl.replace(/\/$/, "") : `${location.origin}${IS_PUBLIC_ADMIN ? "" : "/website"}`;
  const mediaCount = (state.websiteSettings?.hero_media || []).length;
  document.getElementById("websiteSummary").innerHTML = `<div><span>Produk Publish</span><strong>${published}</strong></div><div><span>Produk Draft</span><strong>${draft}</strong></div><div><span>Background Menu</span><strong>${state.websiteSettings?.nav_background ? "Foto aktif" : "Warna bawaan"}</strong></div><div><span>Background Hero</span><strong>${state.websiteSettings?.background ? "Foto aktif" : "Belum diatur"}</strong></div><div><span>Media Slideshow</span><strong>${mediaCount} foto/video</strong></div><div><span>Tentang Kami</span><strong>${state.websiteSettings?.show_about === false ? "Disembunyikan" : "Aktif"}</strong></div><div><span>Running Text</span><strong>${state.websiteSettings?.show_order_ticker === false ? "Disembunyikan" : "Live otomatis"}</strong></div><div><span>Alamat Website</span><strong class="website-url">${IA.escape(websiteUrl)}</strong></div><div><span>Portal Customer</span><strong>SPK + kode akses</strong></div>`;
}

function refreshWebsitePreview() {
  const frame = document.getElementById("websiteLivePreview");
  if (frame) frame.src = `/website-preview?embedded=1&t=${Date.now()}`;
}

function setWebsitePreviewDevice(device) {
  const stage = document.getElementById("websitePreviewStage");
  const selected = device === "mobile" ? "mobile" : "desktop";
  stage.classList.toggle("mobile", selected === "mobile");
  stage.classList.toggle("desktop", selected === "desktop");
  document.querySelectorAll("[data-preview-device]").forEach(button => button.classList.toggle("active", button.dataset.previewDevice === selected));
}

async function saveWebsiteSettings(event) {
  event.preventDefault();
  const button = document.getElementById("saveWebsiteSettings");
  button.disabled = true;
  button.textContent = "Menyimpan…";
  try {
    const formData = new FormData(event.currentTarget);
    const data = await IA.api(`${API_BASE}/website/settings`, { method: "PUT", body: formData });
    state.websiteSettings = data.settings;
    renderWebsiteSettings();
    event.currentTarget.querySelectorAll('input[type="file"]').forEach(input => { input.value = ""; });
    refreshWebsitePreview();
    IA.toast("Tampilan website publik berhasil diperbarui.");
  } catch (err) { IA.toast(err.message); }
  finally { button.disabled = false; button.textContent = "Simpan Tampilan Website"; }
}

async function uploadWebsiteNavBackground(event) {
  event.preventDefault();
  const input = document.getElementById("websiteNavBackground");
  const button = document.getElementById("uploadWebsiteNavBackground");
  if (!input.files.length) return IA.toast("Pilih background menu header terlebih dahulu.");
  button.disabled = true;
  button.textContent = "Mengupload…";
  try {
    const data = await IA.api(`${API_BASE}/website/nav-background`, { method: "POST", body: new FormData(event.currentTarget) });
    state.websiteSettings = data.settings;
    input.value = "";
    renderWebsiteSettings();
    refreshWebsitePreview();
    IA.toast("Background menu header berhasil diupload.");
  } catch (err) { IA.toast(err.message); }
  finally { button.disabled = false; button.textContent = "Upload Background Menu"; }
}

async function deleteWebsiteNavBackground() {
  if (!confirm("Hapus background menu header?")) return;
  const button = document.getElementById("deleteWebsiteNavBackground");
  button.disabled = true;
  try {
    const data = await IA.api(`${API_BASE}/website/nav-background`, { method: "DELETE" });
    state.websiteSettings = data.settings;
    renderWebsiteSettings();
    refreshWebsitePreview();
    IA.toast("Background menu header dihapus.");
  } catch (err) { IA.toast(err.message); }
  finally { button.disabled = false; }
}

async function uploadWebsiteHeroBackground(event) {
  event.preventDefault();
  const input = document.getElementById("websiteHeroBackground");
  const button = document.getElementById("uploadWebsiteHeroBackground");
  if (!input.files.length) return IA.toast("Pilih background hero website terlebih dahulu.");
  button.disabled = true;
  button.textContent = "Mengupload…";
  try {
    const data = await IA.api(`${API_BASE}/website/hero-background`, { method: "POST", body: new FormData(event.currentTarget) });
    state.websiteSettings = data.settings;
    input.value = "";
    renderWebsiteSettings();
    refreshWebsitePreview();
    IA.toast("Background hero website berhasil diupload.");
  } catch (err) { IA.toast(err.message); }
  finally { button.disabled = false; button.textContent = "Upload Background Hero"; }
}

async function deleteWebsiteHeroBackground() {
  if (!confirm("Hapus background hero website?")) return;
  const button = document.getElementById("deleteWebsiteHeroBackground");
  button.disabled = true;
  try {
    const data = await IA.api(`${API_BASE}/website/hero-background`, { method: "DELETE" });
    state.websiteSettings = data.settings;
    renderWebsiteSettings();
    refreshWebsitePreview();
    IA.toast("Background hero website dihapus.");
  } catch (err) { IA.toast(err.message); }
  finally { button.disabled = false; }
}

async function uploadWebsiteHeaderMedia(event) {
  event.preventDefault();
  const input = document.getElementById("websiteHeroMedia");
  const button = document.getElementById("uploadWebsiteHeaderMedia");
  if (!input.files.length) return IA.toast("Pilih foto atau video header terlebih dahulu.");
  button.disabled = true;
  button.textContent = "Mengupload…";
  try {
    const data = await IA.api(`${API_BASE}/website/header-media`, { method: "POST", body: new FormData(event.currentTarget) });
    state.websiteSettings = data.settings;
    input.value = "";
    renderWebsiteSettings();
    refreshWebsitePreview();
    IA.toast("Media header berhasil diupload.");
  } catch (err) { IA.toast(err.message); }
  finally { button.disabled = false; button.textContent = "Upload Header"; }
}

async function deleteWebsiteHeaderMedia(id) {
  if (!confirm("Hapus media ini dari header website?")) return;
  try {
    const data = await IA.api(`${API_BASE}/website/header-media/${id}`, { method: "DELETE" });
    state.websiteSettings = data.settings;
    renderWebsiteSettings();
    refreshWebsitePreview();
    IA.toast("Media header dihapus.");
  } catch (err) { IA.toast(err.message); }
}

async function uploadWebsiteAboutBackground(event) {
  event.preventDefault();
  const input = document.getElementById("websiteAboutBackground");
  const button = document.getElementById("uploadWebsiteAboutBackground");
  if (!input.files.length) return IA.toast("Pilih foto Tentang Kami terlebih dahulu.");
  button.disabled = true;
  button.textContent = "Mengupload…";
  try {
    const data = await IA.api(`${API_BASE}/website/about-background`, { method: "POST", body: new FormData(event.currentTarget) });
    state.websiteSettings = data.settings;
    input.value = "";
    renderWebsiteSettings();
    refreshWebsitePreview();
    IA.toast("Foto Tentang Kami berhasil diupload.");
  } catch (err) { IA.toast(err.message); }
  finally { button.disabled = false; button.textContent = "Upload Foto"; }
}

async function deleteWebsiteAboutBackground() {
  if (!confirm("Hapus foto Tentang Kami?")) return;
  const button = document.getElementById("deleteWebsiteAboutBackground");
  button.disabled = true;
  try {
    const data = await IA.api(`${API_BASE}/website/about-background`, { method: "DELETE" });
    state.websiteSettings = data.settings;
    renderWebsiteSettings();
    refreshWebsitePreview();
    IA.toast("Foto Tentang Kami dihapus.");
  } catch (err) { IA.toast(err.message); }
  finally { button.disabled = false; }
}

function renderCatalogAdmin() {
  const query = document.getElementById("catalogAdminSearch").value.trim().toLowerCase();
  const products = state.catalogProducts.filter(product => !query || `${product.name} ${product.category} ${product.status} ${product.collection}`.toLowerCase().includes(query));
  document.getElementById("catalogAdminGrid").innerHTML = products.length ? products.map(product => `<article class="catalog-admin-card"><div class="catalog-admin-image">${product.cover ? `<img src="${IA.attr(product.cover.url)}" alt="${IA.attr(product.name)}">` : `<span>IA</span>`}<b class="catalog-status ${IA.attr(product.status)}">${IA.escape(product.status)}</b></div><div class="catalog-admin-copy"><small>${IA.escape(product.category)}</small><h3>${IA.escape(product.name)}</h3><p>${IA.escape(product.short_description || "Belum ada deskripsi singkat.")}</p><div><span>${rupiah(product.price)}</span><span>${product.gallery.length + (product.cover ? 1 : 0)} foto</span></div></div><div class="catalog-admin-actions"><button class="btn btn-small" data-edit-catalog="${product.id}">Edit</button><button class="btn btn-small btn-danger" data-delete-catalog="${product.id}">Hapus</button></div></article>`).join("") : `<div class="detail-empty"><div><strong>${state.catalogProducts.length ? "Produk tidak ditemukan" : "Belum ada produk katalog"}</strong><p>Klik + Produk Katalog untuk mulai mengisi website.</p></div></div>`;
  document.querySelectorAll("[data-edit-catalog]").forEach(button => button.addEventListener("click", () => openCatalogProduct(Number(button.dataset.editCatalog))));
  document.querySelectorAll("[data-delete-catalog]").forEach(button => button.addEventListener("click", () => removeCatalogProduct(Number(button.dataset.deleteCatalog))));
  renderWebsiteSummary();
}

function renderCatalogMaterialPicker(selected = []) {
  const selectedIds = new Set(selected.map(Number));
  document.getElementById("catalogMaterialPicker").innerHTML = state.rawMaterials.length ? state.rawMaterials.map(material => `<label><input type="checkbox" data-catalog-material value="${material.id}" ${selectedIds.has(material.id) ? "checked" : ""}><span><strong>${IA.escape(material.name)}</strong><small>${IA.escape(material.unit)}</small></span></label>`).join("") : `<span class="muted">Belum ada master bahan baku.</span>`;
}

function renderCatalogExistingMedia(product) {
  const media = product ? [product.cover, ...product.gallery].filter(Boolean) : [];
  document.getElementById("catalogMediaExisting").innerHTML = media.length ? `<span class="muted">Centang foto yang ingin dihapus saat disimpan.</span><div>${media.map((image, index) => `<label><img src="${IA.attr(image.url)}" alt=""><span><input type="checkbox" data-remove-catalog-media value="${image.id}"> Hapus ${index === 0 ? "foto utama" : "foto galeri"}</span></label>`).join("")}</div>` : `<span class="muted">Belum ada media tersimpan.</span>`;
}

function openCatalogProduct(id = null) {
  if (!state.orderTypes.length) {
    setView("orderTypes");
    IA.toast("Buat Jenis Order terlebih dahulu sebelum membuat katalog.");
    return;
  }
  const product = state.catalogProducts.find(item => item.id === id);
  const form = document.getElementById("catalogProductForm");
  form.reset();
  document.getElementById("catalogProductId").value = product?.id || "";
  document.getElementById("catalogProductModalTitle").textContent = product ? "Edit Produk Katalog" : "Produk Katalog Baru";
  document.getElementById("catalogProductName").value = product?.name || "";
  document.getElementById("catalogProductSlug").value = product?.slug || "";
  document.getElementById("catalogProductOrderType").innerHTML = `<option value="">Pilih Jenis Order…</option>${state.orderTypes.map(item => `<option value="${item.id}" ${item.id === Number(product?.order_type_id) ? "selected" : ""}>${IA.escape(item.name)}</option>`).join("")}`;
  document.getElementById("catalogProductStatus").value = product?.status || "DRAFT";
  document.getElementById("catalogProductBadge").value = product?.badge || "";
  document.getElementById("catalogProductCollection").value = product?.collection || "";
  document.getElementById("catalogProductOrder").value = product?.display_order || 0;
  document.getElementById("catalogProductFeatured").checked = Boolean(product?.featured);
  document.getElementById("catalogProductShort").value = product?.short_description || "";
  document.getElementById("catalogProductDescription").value = product?.description || "";
  document.getElementById("catalogProductPrice").value = product?.price || "";
  document.getElementById("catalogProductMinimum").value = product?.min_order || 1;
  document.getElementById("catalogProductDays").value = product?.production_days || 0;
  document.getElementById("catalogProductSizes").value = (product?.sizes || []).join(", ");
  document.getElementById("catalogProductSpecs").value = product?.specifications || "";
  document.getElementById("catalogProductFaq").value = (product?.faq || []).map(item => `${item.question} | ${item.answer}`).join("\n");
  document.getElementById("catalogProductSeoTitle").value = product?.seo_title || "";
  document.getElementById("catalogProductSeoDescription").value = product?.seo_description || "";
  renderCatalogMaterialPicker((product?.materials || []).map(item => item.id));
  renderCatalogExistingMedia(product);
  document.getElementById("catalogProductModal").hidden = false;
}

function closeCatalogProduct() {
  document.getElementById("catalogProductModal").hidden = true;
}

async function saveCatalogProduct(event) {
  event.preventDefault();
  const id = Number(document.getElementById("catalogProductId").value) || null;
  const button = document.getElementById("saveCatalogProduct");
  const formData = new FormData(event.currentTarget);
  formData.set("featured", document.getElementById("catalogProductFeatured").checked ? "true" : "false");
  formData.set("material_ids", JSON.stringify([...document.querySelectorAll("[data-catalog-material]:checked")].map(input => Number(input.value))));
  formData.set("remove_media_ids", JSON.stringify([...document.querySelectorAll("[data-remove-catalog-media]:checked")].map(input => Number(input.value))));
  button.disabled = true;
  button.textContent = "Menyimpan…";
  try {
    await IA.api(`${API_BASE}/catalog${id ? `/${id}` : ""}`, { method: id ? "PUT" : "POST", body: formData });
    closeCatalogProduct();
    await loadCatalogAdmin();
    IA.toast(id ? "Produk katalog diperbarui." : "Produk katalog berhasil dibuat.");
  } catch (err) { IA.toast(err.message); }
  finally { button.disabled = false; button.textContent = "Simpan Produk Katalog"; }
}

async function removeCatalogProduct(id) {
  const product = state.catalogProducts.find(item => item.id === id);
  if (!product || !confirm(`Hapus produk katalog ${product.name} beserta medianya?`)) return;
  try {
    await IA.api(`${API_BASE}/catalog/${id}`, { method: "DELETE" });
    await loadCatalogAdmin();
    IA.toast("Produk katalog dihapus.");
  } catch (err) { IA.toast(err.message); }
}

function openPublicWebsite() {
  const url = state.publicUrl ? state.publicUrl.replace(/\/$/, "") : `${location.origin}${IS_PUBLIC_ADMIN ? "" : "/website"}`;
  window.open(url, "_blank", "noopener");
}

function invoiceItemRow(item = {}) {
  const row = document.createElement("div");
  row.className = "invoice-item-row";
  row.innerHTML = `<div class="field item-description"><label>Deskripsi</label><input data-item="description" value="${IA.attr(item.description || "")}" required></div><div class="field"><label>Qty</label><input data-item="qty" type="number" min="0.01" step="0.01" value="${IA.attr(item.qty || 1)}" required></div><div class="field"><label>Harga</label><input data-item="price" type="number" min="0" value="${IA.attr(item.price || 0)}" required></div><button class="remove-item" type="button" title="Hapus item">×</button>`;
  row.querySelector(".remove-item").addEventListener("click", () => { if (document.querySelectorAll(".invoice-item-row").length > 1) row.remove(); calculateInvoice(); });
  row.querySelectorAll("input").forEach(input => input.addEventListener("input", calculateInvoice));
  document.getElementById("invoiceItems").appendChild(row);
  calculateInvoice();
}

function calculateInvoice() {
  const subtotal = [...document.querySelectorAll(".invoice-item-row")].reduce((sum, row) => sum + (Number(row.querySelector('[data-item="qty"]').value) || 0) * (Number(row.querySelector('[data-item="price"]').value) || 0), 0);
  const discount = Number(document.getElementById("invoiceDiscount")?.value) || 0;
  const shipping = Number(document.getElementById("invoiceShipping")?.value) || 0;
  document.getElementById("invoiceGrandTotal").textContent = rupiah(Math.max(0, subtotal - discount + shipping));
}

function openInvoice() {
  const form = document.getElementById("invoiceForm");
  form.reset();
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("invoiceDate").value = today;
  document.getElementById("invoicePaymentDate").value = today;
  document.getElementById("invoiceJob").innerHTML = `<option value="">Tanpa SPK</option>${state.jobs.map(job => `<option value="${job.id}">${IA.escape(job.spk)} · ${IA.escape(job.customer)}</option>`).join("")}`;
  document.getElementById("invoiceItems").innerHTML = "";
  invoiceItemRow();
  calculateInvoice();
  document.getElementById("invoiceModal").hidden = false;
}

function closeInvoice() {
  document.getElementById("invoiceModal").hidden = true;
}

function fillInvoiceFromJob() {
  const job = state.jobs.find(item => item.id === Number(document.getElementById("invoiceJob").value));
  if (!job) return;
  document.getElementById("invoiceCustomer").value = job.customer;
  document.getElementById("invoiceItems").innerHTML = "";
  invoiceItemRow({ description: `${job.product} — ${job.spk}`, qty: job.qty, price: job.costing?.selling_price || 0 });
}

function invoicePayload(form) {
  const fields = Object.fromEntries(new FormData(form));
  fields.items = [...document.querySelectorAll(".invoice-item-row")].map(row => ({ description: row.querySelector('[data-item="description"]').value, qty: Number(row.querySelector('[data-item="qty"]').value), price: Number(row.querySelector('[data-item="price"]').value) }));
  for (const key of ["discount", "shipping", "paid"]) fields[key] = Number(fields[key]) || 0;
  fields.job_id = Number(fields.job_id) || null;
  return fields;
}

async function saveInvoice(event) {
  event.preventDefault();
  const button = document.getElementById("saveInvoice");
  button.disabled = true;
  button.textContent = "Menyimpan…";
  try {
    const data = await IA.api(`${API_BASE}/invoices`, { method: "POST", body: JSON.stringify(invoicePayload(event.currentTarget)) });
    closeInvoice();
    await loadInvoices();
    await loadCashflow();
    setView("billing");
    IA.toast(`Invoice ${data.invoice.invoice_no} berhasil dibuat.`);
  } catch (err) { IA.toast(err.message); }
  finally { button.disabled = false; button.textContent = "Simpan Invoice"; }
}

function renderInvoices() {
  const totalPaid = state.invoices.reduce((sum, invoice) => sum + invoice.paid, 0);
  const outstanding = state.invoices.reduce((sum, invoice) => sum + invoice.balance, 0);
  document.getElementById("billingCount").textContent = state.invoices.length;
  document.getElementById("billingPaid").textContent = rupiah(totalPaid);
  document.getElementById("billingOutstanding").textContent = rupiah(outstanding);
  document.getElementById("invoiceList").innerHTML = state.invoices.length ? `<table class="invoice-table"><thead><tr><th>Nomor</th><th>Customer</th><th>Tanggal</th><th>Total</th><th>Pembayaran</th><th>Aksi</th></tr></thead><tbody>${state.invoices.map(invoice => `<tr><td><strong>${IA.escape(invoice.invoice_no)}</strong></td><td>${IA.escape(invoice.customer)}</td><td>${IA.escape(invoice.invoice_date)}</td><td><strong>${rupiah(invoice.total)}</strong></td><td><span class="payment-status ${IA.attr(invoice.payment_status)}">${IA.escape(invoice.payment_status)}</span><small class="table-sub">Dibayar ${rupiah(invoice.paid)} · Sisa ${rupiah(invoice.balance)}</small>${invoice.latest_payment ? `<small class="table-sub">Terakhir ${IA.escape(invoice.latest_payment.date)} · ${IA.escape(invoice.latest_payment.method)}</small>` : ""}</td><td><div class="actions"><button class="btn btn-small" data-pdf-invoice="${invoice.id}">PDF Invoice</button>${invoice.paid ? `<button class="btn btn-small btn-dark" data-pdf-receipt="${invoice.id}">PDF Kwitansi</button>` : ""}${invoice.balance ? `<button class="btn btn-small btn-primary" data-payment="${invoice.id}">Input Pembayaran</button>` : ""}<button class="btn btn-small btn-danger" data-delete-invoice="${invoice.id}">Hapus</button></div></td></tr>`).join("")}</tbody></table>` : `<div class="detail-empty"><div><strong>Belum ada invoice</strong><p>Klik “Buat Invoice” untuk mulai.</p></div></div>`;
  document.querySelectorAll("[data-pdf-invoice]").forEach(button => button.addEventListener("click", () => downloadInvoicePdf(Number(button.dataset.pdfInvoice), "invoice")));
  document.querySelectorAll("[data-pdf-receipt]").forEach(button => button.addEventListener("click", () => downloadInvoicePdf(Number(button.dataset.pdfReceipt), "kwitansi")));
  document.querySelectorAll("[data-payment]").forEach(button => button.addEventListener("click", () => openPayment(Number(button.dataset.payment))));
  document.querySelectorAll("[data-delete-invoice]").forEach(button => button.addEventListener("click", () => deleteInvoice(Number(button.dataset.deleteInvoice), button)));
}

async function deleteInvoice(id, button) {
  const invoice = state.invoices.find(item => item.id === id);
  if (!invoice) return IA.toast("Invoice tidak ditemukan.");
  const paymentWarning = invoice.paid > 0
    ? `\n\nRiwayat pembayaran ${rupiah(invoice.paid)} dan PDF kwitansinya juga akan dihapus dari sistem.`
    : "";
  const approved = window.confirm(`Hapus invoice ${invoice.invoice_no} milik ${invoice.customer}?${paymentWarning}\n\nTindakan ini akan memperbarui cashflow dan tidak dapat dibatalkan dari dashboard.`);
  if (!approved) return;
  const originalText = button?.textContent || "Hapus";
  if (button) { button.disabled = true; button.textContent = "Menghapus…"; }
  try {
    const result = await IA.api(`${API_BASE}/invoices/${id}`, { method: "DELETE" });
    await Promise.all([loadInvoices(), loadCashflow()]);
    IA.toast(`Invoice ${result.invoice_no} berhasil dihapus.`);
  } catch (err) {
    IA.toast(err.message);
    if (button?.isConnected) { button.disabled = false; button.textContent = originalText; }
  }
}

async function downloadInvoicePdf(id, type) {
  const invoice = state.invoices.find(item => item.id === id);
  if (!invoice) return IA.toast("Invoice tidak ditemukan.");
  try {
    const response = await fetch(`${API_BASE}/invoices/${id}/pdf?type=${type}`);
    if (response.status === 401) return location.href = "/login";
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `PDF gagal dibuat (${response.status}).`);
    }
    const blob = await response.blob();
    if (blob.type !== "application/pdf" || blob.size < 1000) throw new Error("File PDF yang diterima tidak valid.");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${type === "kwitansi" ? "KWITANSI" : "INVOICE"}-${invoice.invoice_no}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    IA.toast(`${type === "kwitansi" ? "PDF Kwitansi" : "PDF Invoice"} berhasil diunduh.`);
  } catch (error) {
    if (error instanceof TypeError) {
      await IA.checkConnection();
      IA.toast("Koneksi terputus. PDF akan dapat diunduh setelah server tersambung kembali.");
    } else IA.toast(error.message);
  }
}

function openPayment(id) {
  const invoice = state.invoices.find(item => item.id === id);
  if (!invoice) return IA.toast("Invoice tidak ditemukan.");
  document.getElementById("paymentForm").reset();
  document.getElementById("paymentInvoiceId").value = invoice.id;
  document.getElementById("paymentInvoiceLabel").textContent = `${invoice.invoice_no} · ${invoice.customer}`;
  document.getElementById("paymentTotal").textContent = rupiah(invoice.total);
  document.getElementById("paymentPaid").textContent = rupiah(invoice.paid);
  document.getElementById("paymentBalance").textContent = rupiah(invoice.balance);
  const amount = document.getElementById("paymentAmount");
  amount.max = invoice.balance;
  amount.value = invoice.balance;
  document.getElementById("paymentDate").value = new Date().toISOString().slice(0, 10);
  document.getElementById("paymentModal").hidden = false;
}

function closePayment() {
  document.getElementById("paymentModal").hidden = true;
}

async function savePayment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = document.getElementById("savePayment");
  const invoiceId = Number(document.getElementById("paymentInvoiceId").value);
  button.disabled = true;
  button.textContent = "Menyimpan…";
  try {
    const fields = Object.fromEntries(new FormData(form));
    fields.amount = Number(fields.amount) || 0;
    const data = await IA.api(`${API_BASE}/invoices/${invoiceId}/payments`, { method: "POST", body: JSON.stringify(fields) });
    closePayment();
    await loadInvoices();
    await loadCashflow();
    IA.toast(`Pembayaran ${rupiah(data.payment.amount)} berhasil dicatat.`);
  } catch (err) { IA.toast(err.message); }
  finally { button.disabled = false; button.textContent = "Simpan Pembayaran"; }
}

function printInvoice(id, type) {
  const invoice = state.invoices.find(item => item.id === id);
  if (!invoice) return;
  const isReceipt = ["receipt", "kwitansi"].includes(type);
  const title = isReceipt ? "KWITANSI PEMBAYARAN" : "INVOICE";
  document.getElementById("printDocument").innerHTML = `<article class="print-sheet">
    <header class="print-head"><img src="/instruksi/assets/impossible-logo.png?v=20260902-5" alt="IMPOSSIBLE APPAREL"><h1>${title}</h1></header>
    <section class="print-meta"><div><h3>Ditagihkan kepada</h3><p><strong>${IA.escape(invoice.customer)}</strong></p><p>${IA.escape(invoice.address || "—")}</p></div><div><h3>Informasi Dokumen</h3><p>No: <strong>${IA.escape(invoice.invoice_no)}</strong></p><p>Tanggal: ${IA.escape(invoice.invoice_date)}</p>${!isReceipt && invoice.due_date ? `<p>Jatuh tempo: ${IA.escape(invoice.due_date)}</p>` : ""}<p>Status: <strong>${IA.escape(invoice.payment_status)}</strong></p></div></section>
    <table class="print-table"><thead><tr><th>Deskripsi</th><th>Qty</th><th class="money-cell">Harga</th><th class="money-cell">Jumlah</th></tr></thead><tbody>${invoice.items.map(item => `<tr><td>${IA.escape(item.description)}</td><td>${item.qty}</td><td class="money-cell">${rupiah(item.price)}</td><td class="money-cell">${rupiah(item.qty * item.price)}</td></tr>`).join("")}</tbody></table>
    <div class="print-total"><div><span>Subtotal</span><strong>${rupiah(invoice.subtotal)}</strong></div>${invoice.discount ? `<div><span>Diskon</span><strong>-${rupiah(invoice.discount)}</strong></div>` : ""}${invoice.shipping ? `<div><span>Biaya lain</span><strong>${rupiah(invoice.shipping)}</strong></div>` : ""}<div class="final"><span>Total</span><strong>${rupiah(invoice.total)}</strong></div><div><span>Sudah dibayar</span><strong>${rupiah(invoice.paid)}</strong></div><div><span>Sisa</span><strong>${rupiah(invoice.balance)}</strong></div></div>
    <div class="print-note"><strong>Catatan:</strong><br>${IA.escape(invoice.notes || "Terima kasih telah mempercayai IMPOSSIBLE APPAREL.")}</div>
    <div class="print-sign"><div>Customer</div><div>IMPOSSIBLE APPAREL</div></div>
  </article>`;
  window.print();
}

async function loadJobs({ quiet = false } = {}) {
  try {
    const data = await IA.api(`${API_BASE}/jobs`);
    state.jobs = data.jobs;
    if (state.selectedId && !selectedJob()) state.selectedId = null;
    renderList();
    renderDashboard();
    renderTracking();
    if (!quiet && state.selectedId) renderDetail();
    document.getElementById("lastSync").textContent = `Sinkron ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;
    return true;
  } catch (err) { if (!quiet) IA.toast(err.message); return false; }
}

async function loadInvoices({ quiet = false } = {}) {
  try {
    const data = await IA.api(`${API_BASE}/invoices`);
    state.invoices = data.invoices;
    renderInvoices();
    renderDashboard();
    return true;
  } catch (err) { if (!quiet) IA.toast(err.message); return false; }
}

async function loadOrderTypes({ quiet = false } = {}) {
  try {
    const data = await IA.api(`${API_BASE}/order-types`);
    state.orderTypes = data.order_types;
    renderOrderTypes();
    return true;
  } catch (err) { if (!quiet) IA.toast(err.message); return false; }
}

async function loadRawMaterials({ quiet = false } = {}) {
  try {
    const data = await IA.api(`${API_BASE}/raw-materials`);
    state.rawMaterials = data.raw_materials;
    renderRawMaterials();
    return true;
  } catch (err) { if (!quiet) IA.toast(err.message); return false; }
}

async function loadCashflow({ quiet = false } = {}) {
  try {
    state.cashflow = await IA.api(`${API_BASE}/cashflow`);
    renderCashflow();
    return true;
  } catch (err) { if (!quiet) IA.toast(err.message); return false; }
}

async function loadWebsiteSettings({ quiet = false } = {}) {
  try {
    const data = await IA.api(`${API_BASE}/website/settings`);
    state.websiteSettings = data.settings;
    renderWebsiteSettings();
    return true;
  } catch (err) { if (!quiet) IA.toast(err.message); return false; }
}

async function loadCatalogAdmin({ quiet = false } = {}) {
  try {
    const data = await IA.api(`${API_BASE}/catalog`);
    state.catalogProducts = data.products;
    if (Array.isArray(data.order_types)) state.orderTypes = data.order_types;
    if (Array.isArray(data.raw_materials)) state.rawMaterials = data.raw_materials;
    renderCatalogAdmin();
    return true;
  } catch (err) { if (!quiet) IA.toast(err.message); return false; }
}

async function refreshAll({ quiet = false } = {}) {
  const results = await Promise.all([
    loadJobs({ quiet: true }),
    loadInvoices({ quiet: true }),
    loadRawMaterials({ quiet: true }),
    loadOrderTypes({ quiet: true }),
    loadCashflow({ quiet: true }),
    loadWebsiteSettings({ quiet: true }),
    loadCatalogAdmin({ quiet: true }),
    loadPublicUrl({ quiet: true })
  ]);
  const complete = results.every(Boolean);
  if (!quiet) IA.toast(complete ? "Data sudah diperbarui." : "Sebagian data belum tersambung. Sistem akan mencoba lagi otomatis.");
  return complete;
}

function selectJob(id) {
  state.selectedId = id;
  renderList();
  renderDetail();
}

async function saveDetail() {
  const button = document.getElementById("saveDetail");
  button.disabled = true;
  try {
    await IA.api(`${API_BASE}/jobs/${state.selectedId}`, { method: "PATCH", body: JSON.stringify({ status: document.getElementById("statusField").value }) });
    await loadJobs();
    IA.toast("Perubahan tersimpan.");
  } catch (err) { IA.toast(err.message); button.disabled = false; }
}

async function copyCustomerAccess() {
  const job = selectedJob();
  if (!job?.customer_code) return IA.toast("Kode akses belum tersedia.");
  const website = state.publicUrl ? `${state.publicUrl.replace(/\/$/, "")}/#order` : `${location.origin}${IS_PUBLIC_ADMIN ? "" : "/website"}#order`;
  const message = `Cek pesanan IMPOSSIBLE APPAREL\nWebsite: ${website}\nNomor SPK: ${job.spk}\nKode akses: ${job.customer_code}`;
  try { await navigator.clipboard.writeText(message); }
  catch {
    const area = document.createElement("textarea"); area.value = message; document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove();
  }
  IA.toast("Link, SPK, dan kode akses customer sudah disalin.");
}

async function regenerateCustomerCode() {
  const job = selectedJob();
  if (!job || !confirm("Buat kode akses baru? Kode lama langsung tidak dapat digunakan.")) return;
  try {
    await IA.api(`${API_BASE}/jobs/${job.id}/customer-code`, { method: "POST", body: "{}" });
    await loadJobs();
    IA.toast("Kode akses customer berhasil diperbarui.");
  } catch (err) { IA.toast(err.message); }
}

async function loadMessages() {
  if (!state.selectedId || !document.getElementById("chatList")) return;
  try {
    const data = await IA.api(`${API_BASE}/jobs/${state.selectedId}/messages`);
    const box = document.getElementById("chatList");
    if (!box) return;
    box.innerHTML = data.messages.length ? data.messages.map(message => `<div class="bubble ${message.sender === "Instruksi" ? "mine" : ""}">${IA.escape(message.body)}<small>${IA.escape(message.sender)} · ${IA.date(message.created_at)}</small></div>`).join("") : `<span class="muted">Belum ada pesan.</span>`;
    box.scrollTop = box.scrollHeight;
  } catch { /* retry */ }
}

async function sendMessage(event) {
  event.preventDefault();
  const input = document.getElementById("chatInput");
  try {
    await IA.api(`${API_BASE}/jobs/${state.selectedId}/messages`, { method: "POST", body: JSON.stringify({ body: input.value }) });
    input.value = "";
    await loadMessages();
  } catch (err) { IA.toast(err.message); }
}

async function uploadReference(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "Mengunggah…";
  try {
    await IA.api(`${API_BASE}/jobs/${state.selectedId}/upload/reference`, { method: "POST", body: new FormData(form) });
    await loadJobs();
    IA.toast("Lampiran terkirim ke Dashboard Desain.");
  } catch (err) { IA.toast(err.message); button.disabled = false; button.textContent = label; }
}

async function loadPublicUrl({ quiet = false } = {}) {
  try {
    const data = await IA.api(`${API_BASE}/public-url`);
    state.publicUrl = data.url || "";
    state.designUrl = data.designUrl || fallbackDesignUrl();
    updateDesignLinks();
    document.getElementById("publicLink").textContent = data.url || data.note;
    renderWebsiteSummary();
    return true;
  } catch (err) {
    document.getElementById("publicLink").textContent = "Menunggu koneksi server…";
    if (!quiet) IA.toast(err.message);
    return false;
  }
}

async function copyPublicLink() {
  if (!state.publicUrl) return IA.toast("Tautan publik belum tersedia.");
  try { await navigator.clipboard.writeText(state.publicUrl); }
  catch {
    const area = document.createElement("textarea"); area.value = state.publicUrl; document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove();
  }
  IA.toast("Tautan disalin.");
}

function openJobModal() {
  if (!state.orderTypes.length) {
    setView("instructions");
    document.getElementById("newModal").hidden = true;
    IA.toast("Belum ada Jenis Order. Tambahkan melalui menu Jenis Order & HPP; halaman Instruksi tidak dialihkan.");
    return;
  }
  document.getElementById("jobOrderType").innerHTML = `<option value="">Pilih jenis order…</option>${state.orderTypes.map(item => `<option value="${item.id}">${IA.escape(item.name)} · HPP ${rupiah(item.total_hpp)} · Jual ${rupiah(item.selling_price)}</option>`).join("")}`;
  document.getElementById("newModal").hidden = false;
}

document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
window.addEventListener("hashchange", () => setView(location.hash.replace("#", "") || "dashboard"));
document.getElementById("newBtn").addEventListener("click", openJobModal);
document.getElementById("quickInstruction").addEventListener("click", () => { setView("instructions"); openJobModal(); });
document.getElementById("closeModal").addEventListener("click", () => { document.getElementById("newModal").hidden = true; });
document.getElementById("newModal").addEventListener("click", event => { if (event.target.id === "newModal") event.currentTarget.hidden = true; });
document.getElementById("refreshBtn").addEventListener("click", refreshAll);
document.getElementById("copyLink").addEventListener("click", copyPublicLink);
document.getElementById("trackingSearch").addEventListener("input", renderTracking);
document.getElementById("closeTracking").addEventListener("click", closeTracking);
document.getElementById("trackingModal").addEventListener("click", event => { if (event.target.id === "trackingModal") closeTracking(); });
document.getElementById("trackingForm").addEventListener("submit", submitTracking);
document.getElementById("newOrderTypeBtn").addEventListener("click", () => openOrderType());
document.getElementById("orderTypeSearch").addEventListener("input", renderOrderTypes);
document.getElementById("newRawMaterialBtn").addEventListener("click", () => openRawMaterial());
document.getElementById("rawMaterialSearch").addEventListener("input", renderRawMaterials);
document.getElementById("closeRawMaterial").addEventListener("click", closeRawMaterial);
document.getElementById("rawMaterialModal").addEventListener("click", event => { if (event.target.id === "rawMaterialModal") closeRawMaterial(); });
document.getElementById("rawMaterialForm").addEventListener("submit", saveRawMaterial);
document.getElementById("closeOrderType").addEventListener("click", closeOrderType);
document.getElementById("orderTypeModal").addEventListener("click", event => { if (event.target.id === "orderTypeModal") closeOrderType(); });
document.getElementById("orderTypeForm").addEventListener("submit", saveOrderType);
document.getElementById("addHppMaterial").addEventListener("click", () => {
  if (!state.rawMaterials.length) return IA.toast("Tambahkan bahan baku terlebih dahulu melalui tombol + Bahan Baku.");
  hppMaterialRow();
});
document.getElementById("orderTypeAddRawMaterial").addEventListener("click", () => {
  closeOrderType();
  openRawMaterial();
});
document.getElementById("orderTypeUnit").addEventListener("input", calculateHpp);
document.getElementById("orderTypeSellingPrice").addEventListener("input", calculateHpp);
document.getElementById("newExpenseBtn").addEventListener("click", openExpense);
document.getElementById("cashflowSearch").addEventListener("input", renderCashflow);
document.getElementById("closeExpense").addEventListener("click", closeExpense);
document.getElementById("expenseModal").addEventListener("click", event => { if (event.target.id === "expenseModal") closeExpense(); });
document.getElementById("expenseForm").addEventListener("submit", saveExpense);
document.getElementById("websiteSettingsForm").addEventListener("submit", saveWebsiteSettings);
document.getElementById("websiteNavBackgroundForm").addEventListener("submit", uploadWebsiteNavBackground);
document.getElementById("deleteWebsiteNavBackground").addEventListener("click", deleteWebsiteNavBackground);
document.getElementById("websiteHeroBackgroundForm").addEventListener("submit", uploadWebsiteHeroBackground);
document.getElementById("deleteWebsiteHeroBackground").addEventListener("click", deleteWebsiteHeroBackground);
document.getElementById("websiteHeaderMediaForm").addEventListener("submit", uploadWebsiteHeaderMedia);
document.getElementById("websiteAboutBackgroundForm").addEventListener("submit", uploadWebsiteAboutBackground);
document.getElementById("deleteWebsiteAboutBackground").addEventListener("click", deleteWebsiteAboutBackground);
document.getElementById("websiteHeroMedia").addEventListener("change", event => {
  if (event.currentTarget.files.length <= 8) return;
  event.currentTarget.value = "";
  IA.toast("Maksimal 8 foto/video dalam satu kali unggah.");
});
document.getElementById("openPublicWebsite").addEventListener("click", openPublicWebsite);
document.getElementById("refreshWebsitePreview").addEventListener("click", refreshWebsitePreview);
document.querySelectorAll("[data-preview-device]").forEach(button => button.addEventListener("click", () => setWebsitePreviewDevice(button.dataset.previewDevice)));
document.getElementById("newCatalogProduct").addEventListener("click", () => openCatalogProduct());
document.getElementById("catalogAdminSearch").addEventListener("input", renderCatalogAdmin);
document.getElementById("closeCatalogProduct").addEventListener("click", closeCatalogProduct);
document.getElementById("catalogProductModal").addEventListener("click", event => { if (event.target.id === "catalogProductModal") closeCatalogProduct(); });
document.getElementById("catalogProductForm").addEventListener("submit", saveCatalogProduct);
document.getElementById("newInvoiceBtn").addEventListener("click", openInvoice);
document.getElementById("quickInvoice").addEventListener("click", () => { setView("billing"); openInvoice(); });
document.getElementById("closeInvoice").addEventListener("click", closeInvoice);
document.getElementById("invoiceModal").addEventListener("click", event => { if (event.target.id === "invoiceModal") closeInvoice(); });
document.getElementById("addInvoiceItem").addEventListener("click", () => invoiceItemRow());
document.getElementById("invoiceJob").addEventListener("change", fillInvoiceFromJob);
document.getElementById("invoiceForm").addEventListener("submit", saveInvoice);
document.getElementById("closePayment").addEventListener("click", closePayment);
document.getElementById("paymentModal").addEventListener("click", event => { if (event.target.id === "paymentModal") closePayment(); });
document.getElementById("paymentForm").addEventListener("submit", savePayment);
["invoiceDiscount", "invoiceShipping", "invoicePaid"].forEach(id => document.getElementById(id).addEventListener("input", calculateInvoice));
document.getElementById("jobForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = document.getElementById("submitJob");
  button.disabled = true;
  button.textContent = "Mengirim…";
  try {
    const data = await IA.api(`${API_BASE}/jobs`, { method: "POST", body: new FormData(form) });
    form.reset();
    document.getElementById("newModal").hidden = true;
    state.selectedId = data.job.id;
    await loadJobs();
    await loadCashflow();
    setView("instructions");
    IA.toast("Instruksi terkirim ke Dashboard Desain.");
  } catch (err) { IA.toast(err.message); }
  finally { button.disabled = false; button.textContent = "Kirim ke Dashboard Desain"; }
});

async function logout() {
  try { await IA.api("/api/auth/logout", { method: "POST", body: "{}" }); } finally { location.href = "/login"; }
}
document.getElementById("adminLogout").addEventListener("click", logout);
document.getElementById("adminLogoutMobile").addEventListener("click", logout);

(async function init() {
  let identityReady = !IS_PUBLIC_ADMIN;
  if (IS_PUBLIC_ADMIN) {
    try {
      const me = await IA.api("/api/auth/me");
      if (me.role !== "admin") return location.href = "/login";
      IA.csrf = me.csrf;
      identityReady = true;
      document.getElementById("adminLogout").classList.remove("hide");
      document.getElementById("adminLogoutMobile").classList.remove("hide");
      document.getElementById("modeText").textContent = `Admin publik · ${me.username}`;
    } catch (error) {
      if (error.code !== "NETWORK_ERROR") return;
      document.getElementById("modeText").textContent = "Admin publik · menunggu koneksi";
    }
  }
  document.getElementById("todayLabel").textContent = new Intl.DateTimeFormat("id-ID", { dateStyle: "full" }).format(new Date());
  updateDesignLinks();
  setView(location.hash.replace("#", "") || "dashboard");
  await refreshAll({ quiet: true });
  IA.startConnectionMonitor();
  window.addEventListener("ia:connection-restored", () => {
    if (IS_PUBLIC_ADMIN && !identityReady) return location.reload();
    refreshAll({ quiet: true });
  });
  setInterval(() => loadJobs({ quiet: true }), 5000);
  setInterval(() => loadInvoices({ quiet: true }), 15000);
  setInterval(() => loadOrderTypes({ quiet: true }), 30000);
  setInterval(() => loadCashflow({ quiet: true }), 15000);
  setInterval(() => loadCatalogAdmin({ quiet: true }), 30000);
  setInterval(() => loadPublicUrl({ quiet: true }), 15000);
})();
