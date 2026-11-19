-- ============================================================================
-- DDL SKEMA DATABASE POSTGRESQL UNTUK IMPOSSIBLE APPAREL
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABEL PENGGUNA (ADMIN & DESAIN)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('admin', 'design')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. TABEL BAHAN BAKU (MASTER RAW MATERIALS)
CREATE TABLE IF NOT EXISTS raw_materials (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL UNIQUE,
    unit VARCHAR(40) NOT NULL DEFAULT 'pcs',
    unit_price BIGINT NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. TABEL JENIS ORDER (ORDER TYPES / HPP SPK)
CREATE TABLE IF NOT EXISTS order_types (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL UNIQUE,
    output_unit VARCHAR(40) NOT NULL DEFAULT 'pcs',
    selling_price BIGINT NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. TABEL KOMPOSISI BAHAN BAKU PER JENIS ORDER (HPP COMPOSITION)
CREATE TABLE IF NOT EXISTS order_type_materials (
    id BIGSERIAL PRIMARY KEY,
    order_type_id BIGINT NOT NULL REFERENCES order_types(id) ON DELETE CASCADE,
    raw_material_id BIGINT NOT NULL REFERENCES raw_materials(id) ON DELETE RESTRICT,
    qty NUMERIC(12, 4) NOT NULL DEFAULT 1.0 CHECK (qty > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(order_type_id, raw_material_id)
);

-- 5. TABEL UTAMA ORDER / SPK (JOBS)
CREATE TABLE IF NOT EXISTS jobs (
    id BIGSERIAL PRIMARY KEY,
    spk VARCHAR(100) NOT NULL UNIQUE,
    customer VARCHAR(200) NOT NULL,
    instruction_type VARCHAR(50) NOT NULL DEFAULT 'INSTRUKSI BIASA',
    order_type_id BIGINT REFERENCES order_types(id) ON DELETE SET NULL,
    product VARCHAR(200) NOT NULL,
    hpp_unit_snapshot BIGINT NOT NULL DEFAULT 0,
    selling_price_snapshot BIGINT NOT NULL DEFAULT 0,
    hpp_materials_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    qty INTEGER NOT NULL DEFAULT 1 CHECK (qty >= 1),
    deadline VARCHAR(30),
    priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL', 'URGENT')),
    status VARCHAR(30) NOT NULL DEFAULT 'MENUNGGU' CHECK (status IN ('MENUNGGU', 'PROSES', 'REVISI', 'SELESAI')),
    note TEXT,
    designer VARCHAR(100) NOT NULL DEFAULT '',
    computer VARCHAR(100) NOT NULL DEFAULT '',
    customer_code VARCHAR(30) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_priority ON jobs(priority, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_customer_code ON jobs(customer_code);

-- 6. TABEL LAMPIRAN FILE (ATTACHMENTS)
CREATE TABLE IF NOT EXISTS attachments (
    id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    kind VARCHAR(30) NOT NULL CHECK (kind IN ('reference', 'preview', 'cdr')),
    filename VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    mime VARCHAR(100) NOT NULL DEFAULT 'application/octet-stream',
    size BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_job_id ON attachments(job_id);

-- 7. TABEL PESAN INTERNAL (CHAT SPK)
CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    sender VARCHAR(50) NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_job_id ON messages(job_id);

-- 8. TABEL PELACAKAN STATUS PRODUKSI (TRACKING HISTORY)
CREATE TABLE IF NOT EXISTS tracking (
    id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    stage VARCHAR(50) NOT NULL,
    note TEXT,
    actor VARCHAR(100) NOT NULL DEFAULT 'Admin Lokal',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracking_job_id ON tracking(job_id);

-- 9. TABEL INVOICE (TAGIHAN)
CREATE TABLE IF NOT EXISTS invoices (
    id BIGSERIAL PRIMARY KEY,
    invoice_no VARCHAR(100) NOT NULL UNIQUE,
    job_id BIGINT REFERENCES jobs(id) ON DELETE SET NULL,
    customer VARCHAR(200) NOT NULL,
    address TEXT,
    invoice_date VARCHAR(30) NOT NULL,
    due_date VARCHAR(30),
    discount BIGINT NOT NULL DEFAULT 0 CHECK (discount >= 0),
    shipping BIGINT NOT NULL DEFAULT 0 CHECK (shipping >= 0),
    paid BIGINT NOT NULL DEFAULT 0 CHECK (paid >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_job_id ON invoices(job_id);

-- 10. TABEL ITEM RINCIAN INVOICE (INVOICE ITEMS)
CREATE TABLE IF NOT EXISTS invoice_items (
    id BIGSERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description VARCHAR(500) NOT NULL,
    qty NUMERIC(12, 2) NOT NULL DEFAULT 1 CHECK (qty > 0),
    price BIGINT NOT NULL DEFAULT 0 CHECK (price >= 0),
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);

-- 11. TABEL PEMBAYARAN INVOICE & KWITANSI (INVOICE PAYMENTS)
CREATE TABLE IF NOT EXISTS invoice_payments (
    id BIGSERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    receipt_no VARCHAR(120) NOT NULL,
    amount BIGINT NOT NULL DEFAULT 0 CHECK (amount > 0),
    date VARCHAR(30) NOT NULL,
    method VARCHAR(80) NOT NULL DEFAULT 'Tunai',
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_id ON invoice_payments(invoice_id);

-- 12. TABEL PENGELUARAN CASHFLOW (CASHFLOW EXPENSES)
CREATE TABLE IF NOT EXISTS cashflow_expenses (
    id BIGSERIAL PRIMARY KEY,
    job_id BIGINT REFERENCES jobs(id) ON DELETE SET NULL,
    date VARCHAR(30) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('BAHAN BAKU', 'OPERASIONAL', 'GAJI/UPAH', 'LAINNYA')),
    amount BIGINT NOT NULL DEFAULT 0 CHECK (amount > 0),
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cashflow_expenses_job_id ON cashflow_expenses(job_id);

-- 13. TABEL KATALOG PRODUK (Dibuat sebelum media atau cover_media_id ditambahkan via ALTER TABLE)
CREATE TABLE IF NOT EXISTS catalog_products (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(200) NOT NULL UNIQUE,
    order_type_id BIGINT REFERENCES order_types(id) ON DELETE SET NULL,
    category_name VARCHAR(200) NOT NULL DEFAULT 'Lainnya',
    short_description TEXT,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISH')),
    badge VARCHAR(50),
    collection VARCHAR(100),
    display_order INTEGER NOT NULL DEFAULT 0,
    featured BOOLEAN NOT NULL DEFAULT FALSE,
    price BIGINT NOT NULL DEFAULT 0,
    min_order INTEGER NOT NULL DEFAULT 1 CHECK (min_order >= 1),
    production_days INTEGER NOT NULL DEFAULT 0,
    sizes JSONB NOT NULL DEFAULT '[]'::jsonb,
    material_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    specifications TEXT,
    faq JSONB NOT NULL DEFAULT '[]'::jsonb,
    seo_title VARCHAR(200),
    seo_description VARCHAR(400),
    cover_media_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. TABEL MEDIA KATALOG & WEBSITE
CREATE TABLE IF NOT EXISTS catalog_media (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT REFERENCES catalog_products(id) ON DELETE SET NULL,
    kind VARCHAR(50) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    mime VARCHAR(100) NOT NULL DEFAULT 'application/octet-stream',
    size BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_media_product_id ON catalog_media(product_id);

-- Constraint cover_media_id ke catalog_media
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_catalog_cover_media'
    ) THEN
        ALTER TABLE catalog_products
            ADD CONSTRAINT fk_catalog_cover_media
            FOREIGN KEY (cover_media_id) REFERENCES catalog_media(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 15. TABEL PENGATURAN WEBSITE (SINGLETON CONFIG)
CREATE TABLE IF NOT EXISTS website_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    brand_name VARCHAR(200) NOT NULL DEFAULT 'IMPOSSIBLE APPAREL',
    hero_title TEXT NOT NULL DEFAULT 'CUSTOM APPAREL, BUILT FOR YOUR IDENTITY.',
    hero_text TEXT NOT NULL DEFAULT 'Jersey, apparel, dan kebutuhan custom yang diproduksi dengan detail dari desain hingga selesai.',
    about_kicker VARCHAR(200) NOT NULL DEFAULT 'TENTANG KAMI',
    about_title VARCHAR(200) NOT NULL DEFAULT 'DIBUAT UNTUK IDENTITAS ANDA.',
    about_text TEXT NOT NULL DEFAULT 'IMPOSSIBLE APPAREL membantu mewujudkan jersey dan apparel custom dari tahap desain, pemilihan bahan, produksi, hingga quality control.',
    catalog_title VARCHAR(200) NOT NULL DEFAULT 'Katalog Impossible',
    whatsapp VARCHAR(100) DEFAULT '',
    address TEXT DEFAULT '',
    instagram VARCHAR(100) DEFAULT '',
    primary_color VARCHAR(30) NOT NULL DEFAULT '#e32127',
    background_color VARCHAR(30) NOT NULL DEFAULT '#090909',
    logo_media_id BIGINT REFERENCES catalog_media(id) ON DELETE SET NULL,
    nav_background_media_id BIGINT REFERENCES catalog_media(id) ON DELETE SET NULL,
    background_media_id BIGINT REFERENCES catalog_media(id) ON DELETE SET NULL,
    about_background_media_id BIGINT REFERENCES catalog_media(id) ON DELETE SET NULL,
    hero_media_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    hero_interval_seconds INTEGER NOT NULL DEFAULT 6,
    show_order_ticker BOOLEAN NOT NULL DEFAULT TRUE,
    show_about BOOLEAN NOT NULL DEFAULT TRUE,
    ticker_label VARCHAR(100) NOT NULL DEFAULT 'LIVE ORDER',
    show_prices BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ
);

-- 16. TABEL MARKETING FEED / POSTS
CREATE TABLE IF NOT EXISTS marketing_posts (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    product_key VARCHAR(100),
    product_name VARCHAR(200),
    content_type VARCHAR(100),
    objective VARCHAR(100),
    audience TEXT,
    hook TEXT NOT NULL,
    body TEXT NOT NULL,
    cta TEXT,
    caption_instagram TEXT,
    caption_facebook TEXT,
    caption_tiktok TEXT,
    caption_x TEXT,
    hashtags JSONB NOT NULL DEFAULT '[]'::jsonb,
    platforms JSONB NOT NULL DEFAULT '[]'::jsonb,
    media_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    storyboard JSONB NOT NULL DEFAULT '[]'::jsonb,
    veo_prompt TEXT,
    scheduled_at TIMESTAMPTZ,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'PARTIAL', 'FAILED')),
    approved_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. TABEL MEDIA MARKETING
CREATE TABLE IF NOT EXISTS marketing_media (
    id BIGSERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    mime VARCHAR(100) NOT NULL DEFAULT 'application/octet-stream',
    size BIGINT NOT NULL DEFAULT 0,
    source VARCHAR(30) NOT NULL DEFAULT 'UPLOAD' CHECK (source IN ('UPLOAD', 'VEO')),
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. TABEL RENCANA IKLAN (MARKETING ADS)
CREATE TABLE IF NOT EXISTS marketing_ads (
    id BIGSERIAL PRIMARY KEY,
    platform VARCHAR(50) NOT NULL DEFAULT 'META',
    name VARCHAR(200) NOT NULL,
    objective VARCHAR(100) NOT NULL DEFAULT 'WHATSAPP',
    daily_budget BIGINT NOT NULL DEFAULT 0,
    duration_days INTEGER NOT NULL DEFAULT 7,
    audience TEXT,
    creative_notes TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED')),
    approved_budget BOOLEAN NOT NULL DEFAULT FALSE,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 19. TABEL METRIKS ANALITIK MARKETING
CREATE TABLE IF NOT EXISTS marketing_metrics (
    id BIGSERIAL PRIMARY KEY,
    platform VARCHAR(50) NOT NULL,
    post_id BIGINT REFERENCES marketing_posts(id) ON DELETE SET NULL,
    metric_date VARCHAR(30) NOT NULL,
    views BIGINT NOT NULL DEFAULT 0,
    likes BIGINT NOT NULL DEFAULT 0,
    comments BIGINT NOT NULL DEFAULT 0,
    shares BIGINT NOT NULL DEFAULT 0,
    saves BIGINT NOT NULL DEFAULT 0,
    clicks BIGINT NOT NULL DEFAULT 0,
    whatsapp_clicks BIGINT NOT NULL DEFAULT 0,
    orders BIGINT NOT NULL DEFAULT 0,
    revenue BIGINT NOT NULL DEFAULT 0,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 20. TABEL LOG PUBLIKASI MANUAL MARKETING
CREATE TABLE IF NOT EXISTS marketing_publish_log (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES marketing_posts(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PUBLISHED_MANUAL',
    external_id VARCHAR(200),
    external_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 21. TABEL PEKERJAAN AI VIDEO GENERASI (VEO JOBS)
CREATE TABLE IF NOT EXISTS marketing_ai_jobs (
    id BIGSERIAL PRIMARY KEY,
    operation_name VARCHAR(700) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PROCESSING' CHECK (status IN ('PROCESSING', 'DONE', 'FAILED', 'DELETED')),
    model VARCHAR(120) NOT NULL,
    prompt TEXT NOT NULL,
    source_media_id BIGINT REFERENCES marketing_media(id) ON DELETE SET NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 8,
    aspect_ratio VARCHAR(20) NOT NULL DEFAULT '9:16',
    resolution VARCHAR(20) NOT NULL DEFAULT '720p',
    estimated_cost_usd NUMERIC(10, 4) NOT NULL DEFAULT 0,
    estimated_cost_idr BIGINT NOT NULL DEFAULT 0,
    output_media_id BIGINT REFERENCES marketing_media(id) ON DELETE SET NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 22. TABEL KONEKSI SOSMED & API (CREDENTIAL TERENKRIPSI AES-256-GCM)
CREATE TABLE IF NOT EXISTS marketing_connections (
    platform VARCHAR(50) PRIMARY KEY,
    encrypted_config TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'CONFIGURED',
    last_test_at TIMESTAMPTZ,
    last_test_message TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 23. TABEL PENGATURAN MARKETING (SINGLETON CONFIG)
CREATE TABLE IF NOT EXISTS marketing_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    strategy_model VARCHAR(120) NOT NULL DEFAULT 'gemini-3.8-flash',
    video_model VARCHAR(120) NOT NULL DEFAULT 'veo-3.1-lite-generate-preview',
    daily_video_limit INTEGER NOT NULL DEFAULT 3,
    monthly_ai_budget_idr BIGINT NOT NULL DEFAULT 700000,
    usd_idr BIGINT NOT NULL DEFAULT 18000,
    default_duration INTEGER NOT NULL DEFAULT 8,
    default_resolution VARCHAR(20) NOT NULL DEFAULT '720p',
    brand_voice TEXT NOT NULL DEFAULT 'Berani, premium, jelas, dan tetap natural.',
    default_audience TEXT NOT NULL DEFAULT 'Tim olahraga, komunitas, sekolah, perusahaan, dan pengguna apparel custom.',
    updated_at TIMESTAMPTZ
);
