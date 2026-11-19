# Impossible Apparel v2 (Rust + Axum + PostgreSQL)

Aplikasi manajemen garmen dan apparel modern berkinerja tinggi menggunakan **Rust (Axum 0.7 + SQLx)** dan basis data relasional **PostgreSQL 16**.

---

## 🔒 Pembaruan Arsitektur & Keamanan Terpadu

1. **Port Tunggal Terpadu (Single Unified Web Port)**:
   - Menghapus pemisahan port ganda yang membingungkan.
   - Semua layanan berjalan pada **SATU PORT WEB TERPADU** (Host: `${APP_PORT:-8897}`, Container: Port 80).
   - Port host dapat dikonfigurasi melalui variabel lingkungan `APP_PORT` di `.env` (misal diset ke port `80` pada VPS/server dedicated).
2. **Keamanan & Otentikasi Wajib**:
   - Menu Admin (`/instruksi`, `/admin`) dan API Admin **WAJIB login** sebagai admin (`d.candra`). Jika belum login, otomatis di-redirect **HTTP 302** ke `/login`.
   - Menu Desain (`/desain`) wajib login dengan role `design` atau `admin`.
   - Customer Portal (`/cek-pesanan`) login mandiri menggunakan Nomor SPK + Kode Akses 8 karakter unik.
   - Halaman Publik (`/`, `/katalog`, `/media/:id`, `/api/public/*`) dapat diakses tanpa login.
3. **Standar Keamanan Web Modern**:
   - Cookie sesi `HttpOnly; SameSite=Lax` dengan enkripsi token HMAC-SHA256.
   - Validasi `X-CSRF-Token` pada seluruh mutasi data (`POST`, `PUT`, `PATCH`, `DELETE`).
   - Proteksi brute force rate limiting cerdas (maksimal 10 percobaan per menit, percobaan ke-11 diblokir HTTP 429 Too Many Requests).
4. **Sensor Data Sensitif untuk Desainer**:
   - Desainer dapat melihat SPK, antrian pengerjaan, tracking produksi, chat, dan mengunggah preview serta file `.cdr` CorelDraw.
   - Data sensitif finansial seperti HPP unit, harga jual, margin laba, dan kode akses customer disensor secara ketat dan tidak dikirimkan ke peran desainer.
5. **Paritas Alur Bisnis 100%**:
   - Master bahan baku & jenis order dengan kalkulasi HPP otomatis.
   - 8 tahapan siklus tracking produksi (`DESAIN` -> `APPROVAL` -> `PRINTING` -> `PRESS` -> `JAHIT` -> `QC` -> `PACKING` -> `SELESAI`).
   - Keuangan terpadu: Invoicing, pencatatan pembayaran bertahap dengan otomatisasi nomor Kwitansi (`KWT-INV-...`), cetak PDF vektor Invoice & Kwitansi via `printpdf`, dan pencatatan cashflow pengeluaran.
   - Manajemen katalog produk & publikasi etalase.

---

## 📁 Struktur Direktori Modular

```
impossible-apparelv2/
├── backend/                  # Seluruh kode dan aset backend Rust
│   ├── Cargo.toml            # Manifest dependensi Axum, SQLx, Tokio, PrintPDF
│   ├── Cargo.lock
│   ├── Dockerfile            # Multi-stage production container build
│   ├── .env                  # Konfigurasi lingkungan backend
│   ├── fonts/                # Font Roboto TrueType untuk PDF engine
│   ├── migrations/           # Skema DDL PostgreSQL (23 tabel relasional)
│   ├── src/
│   │   ├── main.rs           # Router tunggal, guard otentikasi, rate limit, UI handlers
│   │   ├── config.rs         # Dynamic path resolver & configuration
│   │   ├── error.rs          # HTTP AppError mapper & status code
│   │   ├── state.rs          # AppState terpadu & Pool DB
│   │   ├── ui.rs             # Dynamic HTML inlining engine
│   │   ├── auth/             # Session token HMAC, CSRF, Scrypt, In-Memory Rate Limiter
│   │   │   ├── mod.rs
│   │   │   ├── password.rs
│   │   │   └── rate_limit.rs
│   │   └── modules/          # Domain modul: master, jobs, tracking, finance, catalog, customer, marketing, pdf
│   └── bin/
│       └── migrate_json.rs   # CLI Tool migrasi data
├── frontend/                 # Seluruh antarmuka web HTML, CSS, JS, images, logo
│   ├── assets/               # common.js, instruction.js, design.js, login.js, public-site.js, css, logo
│   ├── instruksi/            # Dashboard Admin
│   ├── desain/               # Dashboard Desain
│   ├── public/               # Landing page, katalog publik & customer tracking
│   └── login.html            # Halaman login modern
├── uploads/                  # File upload persisten (media, preview, file .cdr)
├── data/                     # Session secrets, fallback data
├── scripts/                  # Script pengujian keamanan & utilitas
│   └── test_unified_security.sh # Script audit pengujian komprehensif
├── docker-compose.yml        # Docker compose root (PostgreSQL 16 + Rust Backend)
├── .env                      # Konfigurasi lingkungan root
└── README.md
```

---

## 🚀 Cara Menjalankan Aplikasi

### 1. Menggunakan Docker Compose (Direkomendasikan)
```bash
# Jalankan database PostgreSQL dan Backend Axum
docker compose up -d

# Periksa status kontainer
docker compose ps
```

### 2. Menjalankan Langsung di Host (Mode Development)
Pastikan PostgreSQL sudah aktif di `localhost:5432`, kemudian jalankan:
```bash
cd backend
cargo run --release
```

Server akan aktif dan listen pada `http://0.0.0.0:8897` (atau port sesuai variabel `APP_PORT`).

---

## 🔑 Kredensial Akses

| Peran | Username | Password | Halaman Akses |
|---|---|---|---|
| **Admin** | `d.candra` | `impossible2026!` | `http://localhost:8897/instruksi` atau `/admin` |
| **Desain** | `desain` | `impossible2026!` | `http://localhost:8897/desain` |
| **Customer** | Nomor SPK | Kode Akses 8 Karakter | `http://localhost:8897/cek-pesanan` |
| **Publik** | *Tanpa Login* | *Tanpa Login* | `http://localhost:8897/` atau `/katalog` |

---

## 🧪 Pengujian Keamanan & Alur Bisnis

Jalankan skrip pengujian komprehensif:
```bash
./scripts/test_unified_security.sh
```

Skrip ini menguji:
- Verifikasi endpoint publik (200 OK)
- Redirect HTTP 302 untuk halaman admin dan desain yang belum login
- Penolakan 401 untuk API terproteksi tanpa sesi
- Proteksi brute force rate limiting (HTTP 429 pada percobaan beruntun)
- Otentikasi cookie HttpOnly & SameSite=Lax
- Proteksi CSRF (penolakan 403 untuk mutasi tanpa token valid)
- Pembuatan SPK, kalkulasi HPP otomatis, pesan internal
- Siklus 8 tahapan tracking produksi hingga 100%
- Pembuatan Invoice, pembayaran bertahap, penerbitan Kwitansi `KWT-...`, dan cetak PDF vektor resmi
- Sensor data finansial untuk akun desainer
- Login customer mandiri via SPK + kode unik dan unduh dokumen invoice
