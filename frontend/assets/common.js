"use strict";

const connectionState = {
  online: true,
  incompatible: false,
  failedAt: 0,
  monitor: null,
  checking: false,
  lastToast: "",
  lastToastAt: 0
};
const EXPECTED_SERVER_VERSION = "FINAL-1.17.0-ONE-CLICK-SHORTCUT";

function ensureConnectionBanner() {
  let banner = document.getElementById("iaConnectionBanner");
  if (banner || !document.body) return banner;
  banner = document.createElement("aside");
  banner.id = "iaConnectionBanner";
  banner.className = "connection-banner hide";
  banner.setAttribute("role", "status");
  banner.setAttribute("aria-live", "polite");
  banner.innerHTML = `<span class="connection-pulse" aria-hidden="true"></span><div><strong id="iaConnectionTitle">Koneksi server terputus</strong><small id="iaConnectionDetail">Sistem mencoba menyambung kembali secara otomatis.</small></div><button type="button" id="iaConnectionRetry">Coba sambungkan</button>`;
  document.body.appendChild(banner);
  banner.querySelector("#iaConnectionRetry").addEventListener("click", () => window.IA.checkConnection({ announce: true }));
  return banner;
}

function setConnection(online, detail = "", title = "Koneksi server terputus") {
  if (online && connectionState.incompatible) return;
  const wasOffline = !connectionState.online;
  connectionState.online = online;
  const banner = ensureConnectionBanner();
  document.body?.classList.toggle("server-offline", !online);
  if (!banner) return;

  if (online) {
    connectionState.failedAt = 0;
    banner.classList.add("hide");
    if (wasOffline) {
      window.dispatchEvent(new CustomEvent("ia:connection-restored"));
      window.IA.toast("Koneksi server tersambung kembali.");
    }
    return;
  }

  if (!connectionState.failedAt) connectionState.failedAt = Date.now();
  banner.classList.remove("hide");
  const titleNode = banner.querySelector("#iaConnectionTitle");
  const detailNode = banner.querySelector("#iaConnectionDetail");
  if (titleNode) titleNode.textContent = title;
  if (detailNode) detailNode.textContent = detail || "Sistem mencoba menyambung kembali secara otomatis.";
}

window.IA = {
  csrf: "",
  async api(url, options = {}) {
    const { timeoutMs = 0, ...fetchOptions } = options;
    const headers = { ...(fetchOptions.headers || {}) };
    if (fetchOptions.body && !(fetchOptions.body instanceof FormData)) headers["Content-Type"] = "application/json";
    if (window.IA.csrf && fetchOptions.method && fetchOptions.method !== "GET") headers["X-CSRF-Token"] = window.IA.csrf;
    let controller;
    let timeout;
    if (timeoutMs > 0 && !fetchOptions.signal) {
      controller = new AbortController();
      fetchOptions.signal = controller.signal;
      timeout = setTimeout(() => controller.abort(), timeoutMs);
    }
    let response;
    try {
      response = await fetch(url, { ...fetchOptions, headers, cache: fetchOptions.cache || "no-store" });
      setConnection(true);
    } catch (cause) {
      connectionState.incompatible = false;
      setConnection(false, "Server lokal atau koneksi internet sedang tidak terhubung. Pastikan jendela server tetap terbuka.");
      const error = new Error("Koneksi ke server terputus. Sistem sedang mencoba menyambung kembali.");
      error.code = "NETWORK_ERROR";
      error.cause = cause;
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    if (response.status === 401 && location.pathname !== "/login") {
      location.href = "/login";
      const error = new Error("Sesi login sudah berakhir. Silakan login kembali.");
      error.code = "AUTH_REQUIRED";
      throw error;
    }
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json().catch(() => ({})) : {};
    if (!response.ok) {
      const fallback = response.status === 404
        ? "Program server belum sesuai dengan tampilan dashboard. Silakan muat ulang halaman."
        : `Permintaan server gagal (kode ${response.status}).`;
      const error = new Error(data.error || fallback);
      error.code = `HTTP_${response.status}`;
      error.status = response.status;
      throw error;
    }
    return data;
  },
  async checkConnection({ announce = false } = {}) {
    if (connectionState.checking) return connectionState.online;
    connectionState.checking = true;
    const button = document.getElementById("iaConnectionRetry");
    if (button) { button.disabled = true; button.textContent = "Mengecek…"; }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`/api/health?t=${Date.now()}`, { cache: "no-store", signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok !== true) throw new Error("Health check gagal");
      if (data.version !== EXPECTED_SERVER_VERSION) {
        connectionState.incompatible = true;
        setConnection(false, `Versi aktif: ${data.version || "tidak dikenal"}.`, "Program server belum diperbarui");
        return false;
      }
      connectionState.incompatible = false;
      setConnection(true);
      if (announce) window.IA.toast("Server aktif dan merespons.");
      return true;
    } catch {
      connectionState.incompatible = false;
      setConnection(false, "Koneksi ke server terputus. Pastikan server aplikasi menyala.");
      return false;
    } finally {
      clearTimeout(timeout);
      connectionState.checking = false;
      if (button) { button.disabled = false; button.textContent = "Coba sambungkan"; }
    }
  },
  startConnectionMonitor() {
    clearInterval(connectionState.monitor);
    window.IA.checkConnection();
    connectionState.monitor = setInterval(() => window.IA.checkConnection(), 8000);
  },
  date(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  },
  escape(value) {
    const node = document.createElement("div");
    node.textContent = String(value == null ? "" : value);
    return node.innerHTML;
  },
  attr(value) {
    return String(value == null ? "" : value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  },
  toast(message) {
    const text = String(message || "Terjadi kesalahan.");
    const now = Date.now();
    if (text === connectionState.lastToast && now - connectionState.lastToastAt < 4000) return;
    connectionState.lastToast = text;
    connectionState.lastToastAt = now;
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }
};
