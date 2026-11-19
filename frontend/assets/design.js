"use strict";

const statuses = ["MENUNGGU", "PROSES", "REVISI", "SELESAI"];
const state = { jobs: [], selectedId: null, messageTimer: null, knownIds: new Set() };

function badge(value) {
  return `<span class="badge ${IA.attr(value)}">${IA.escape(value)}</span>`;
}

function jobById(id) {
  return state.jobs.find(job => job.id === id);
}

function renderBoard() {
  document.getElementById("statusBoard").innerHTML = statuses.map(status => {
    const jobs = state.jobs.filter(job => job.status === status);
    return `<section class="status-column"><div class="status-head"><span>${status}</span><span>${jobs.length}</span></div><div class="cards">${jobs.length ? jobs.map(job => {
      const cdr = job.attachments.some(file => file.kind === "cdr");
      return `<article class="design-card" data-id="${job.id}"><div class="job-line"><strong>${IA.escape(job.spk)}</strong>${job.priority === "URGENT" ? badge("URGENT") : ""}</div><h3>${IA.escape(job.product)}</h3><p>${IA.escape(job.customer)} · ${job.qty} pcs</p><p class="production-label">Produksi: <strong>${IA.escape(job.production.stage)}</strong></p><div class="meta"><span>${job.deadline ? `Deadline ${IA.escape(job.deadline)}` : "Tanpa deadline"}</span><span class="${cdr ? "cdr-ready" : "muted"}">${cdr ? "● CDR siap" : "○ CDR"}</span></div></article>`;
    }).join("") : `<div class="detail-empty"><small>Kosong</small></div>`}</div></section>`;
  }).join("");
  document.querySelectorAll(".design-card").forEach(card => card.addEventListener("click", () => openJob(Number(card.dataset.id))));
}

function fileList(files) {
  return files.length ? files.map(file => `<div class="file-row"><a href="/api/files/${file.id}">${IA.escape(file.filename)}</a><small>${Math.ceil(file.size / 1024)} KB</small></div>`).join("") : `<p class="muted">Belum ada file.</p>`;
}

function renderModal() {
  const job = jobById(state.selectedId);
  if (!job) return closeModal();
  const previews = job.attachments.filter(file => file.kind === "preview");
  const cdr = job.attachments.filter(file => file.kind === "cdr");
  const references = job.attachments.filter(file => file.kind === "reference");
  document.getElementById("detailCard").innerHTML = `
    <div class="panel-head"><div><h2>${IA.escape(job.spk)}</h2><span class="muted">${IA.escape(job.customer)}</span></div><button class="modal-close" id="closeDetail">×</button></div>
    <div class="detail-wrap">
      <div class="detail-title"><div><h2>${IA.escape(job.product)}</h2><p>${job.qty} pcs · deadline ${job.deadline ? IA.escape(job.deadline) : "—"}</p></div>${job.priority === "URGENT" ? badge("URGENT") : badge(job.status)}</div>
      <div class="fact"><small>Tracking Produksi</small><strong>${IA.escape(job.production.stage)} · ${job.production.progress}%</strong></div>
      <div><h3 class="section-title">Instruksi</h3><div class="fact"><strong>${IA.escape(job.note || "Tidak ada catatan.")}</strong></div></div>
      <div class="file-box ${references.length ? "has-files" : ""}"><h3 class="section-title">Lampiran dari Instruksi (${references.length})</h3>${fileList(references)}</div>
      <div class="form-grid">
        <div class="field"><label>Status kerja</label><select id="statusField">${statuses.map(value => `<option ${value === job.status ? "selected" : ""}>${value}</option>`).join("")}</select></div>
        <div class="field"><label>PIC Desain</label><input id="designerField" value="${IA.attr(job.designer)}" placeholder="Nama desainer"></div>
        <div class="field"><label>Komputer</label><input id="computerField" value="${IA.attr(job.computer)}" placeholder="PC-DESAIN-01"></div>
        <div class="field"><label>&nbsp;</label><button class="btn btn-dark" id="saveJob">Simpan status & PIC</button></div>
      </div>
      <div class="files">
        <form class="file-box" id="previewForm"><h3 class="section-title">Preview (${previews.length})</h3>${fileList(previews)}<div class="field"><label>Tambah gambar/PDF</label><input name="files" type="file" accept="image/*,.pdf" multiple required></div><button class="btn btn-small btn-dark">Unggah Preview</button></form>
        <form class="file-box ${cdr.length ? "good" : ""}" id="cdrForm"><h3 class="section-title"><span class="dot ${cdr.length ? "green" : ""}"></span>Final CDR (${cdr.length})</h3>${fileList(cdr)}<div class="field"><label>Tambah file .CDR</label><input name="files" type="file" accept=".cdr" required></div><button class="btn btn-small btn-primary">Unggah CDR Final</button></form>
      </div>
      <div class="chat"><h3 class="section-title">Chat dengan Tim Instruksi</h3><div class="chat-list" id="chatList"><span class="muted">Memuat pesan…</span></div><form class="chat-send" id="chatForm"><input id="chatInput" maxlength="2000" placeholder="Tulis balasan…" required><button class="btn btn-primary">Kirim</button></form></div>
    </div>`;
  document.getElementById("closeDetail").addEventListener("click", closeModal);
  document.getElementById("saveJob").addEventListener("click", saveJob);
  document.getElementById("previewForm").addEventListener("submit", event => upload(event, "preview"));
  document.getElementById("cdrForm").addEventListener("submit", event => upload(event, "cdr"));
  document.getElementById("chatForm").addEventListener("submit", sendMessage);
  loadMessages();
  clearInterval(state.messageTimer);
  state.messageTimer = setInterval(loadMessages, 3000);
}

function openJob(id) {
  state.selectedId = id;
  document.getElementById("detailModal").hidden = false;
  renderModal();
}

function closeModal() {
  clearInterval(state.messageTimer);
  state.selectedId = null;
  document.getElementById("detailModal").hidden = true;
}

async function loadJobs({ announce = false, quiet = false } = {}) {
  try {
    const data = await IA.api("/api/jobs");
    if (announce) {
      const incoming = data.jobs.filter(job => !state.knownIds.has(job.id));
      if (state.knownIds.size && incoming.length) IA.toast(`${incoming.length} instruksi baru masuk.`);
    }
    state.jobs = data.jobs;
    state.knownIds = new Set(data.jobs.map(job => job.id));
    renderBoard();
    return true;
  } catch (err) { if (!quiet) IA.toast(err.message); return false; }
}

async function saveJob() {
  const button = document.getElementById("saveJob");
  button.disabled = true;
  try {
    await IA.api(`/api/jobs/${state.selectedId}`, { method: "PATCH", body: JSON.stringify({ status: document.getElementById("statusField").value, designer: document.getElementById("designerField").value, computer: document.getElementById("computerField").value }) });
    await loadJobs();
    renderModal();
    IA.toast("Status dan PIC diperbarui.");
  } catch (err) { IA.toast(err.message); button.disabled = false; }
}

async function upload(event, kind) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    await IA.api(`/api/jobs/${state.selectedId}/upload/${kind}`, { method: "POST", body: new FormData(form) });
    await loadJobs();
    renderModal();
    IA.toast(kind === "cdr" ? "File CDR final tersimpan." : "Preview berhasil diunggah.");
  } catch (err) { IA.toast(err.message); button.disabled = false; }
}

async function loadMessages() {
  if (!state.selectedId || !document.getElementById("chatList")) return;
  try {
    const data = await IA.api(`/api/jobs/${state.selectedId}/messages`);
    const box = document.getElementById("chatList");
    if (!box) return;
    box.innerHTML = data.messages.length ? data.messages.map(message => `<div class="bubble ${message.sender === "Desain" ? "mine" : ""}">${IA.escape(message.body)}<small>${IA.escape(message.sender)} · ${IA.date(message.created_at)}</small></div>`).join("") : `<span class="muted">Belum ada pesan.</span>`;
    box.scrollTop = box.scrollHeight;
  } catch { /* retry on next poll */ }
}

async function sendMessage(event) {
  event.preventDefault();
  const input = document.getElementById("chatInput");
  try {
    await IA.api(`/api/jobs/${state.selectedId}/messages`, { method: "POST", body: JSON.stringify({ body: input.value }) });
    input.value = "";
    await loadMessages();
  } catch (err) { IA.toast(err.message); }
}

document.getElementById("detailModal").addEventListener("click", event => { if (event.target.id === "detailModal") closeModal(); });
document.getElementById("refreshBtn").addEventListener("click", () => loadJobs());
document.getElementById("logoutBtn").addEventListener("click", async () => {
  try { await IA.api("/api/auth/logout", { method: "POST", body: "{}" }); } finally { location.href = "/login"; }
});

(async function init() {
  let identityReady = false;
  try {
    const me = await IA.api("/api/auth/me");
    IA.csrf = me.csrf;
    identityReady = true;
    document.getElementById("accountName").textContent = me.username;
  } catch (error) {
    if (error.code !== "NETWORK_ERROR") return;
    document.getElementById("accountName").textContent = "Menunggu koneksi";
  }
  await loadJobs({ quiet: true });
  IA.startConnectionMonitor();
  window.addEventListener("ia:connection-restored", () => {
    if (!identityReady) return location.reload();
    loadJobs({ quiet: true });
  });
  setInterval(() => loadJobs({ announce: true, quiet: true }), 5000);
})();
