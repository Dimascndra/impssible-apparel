#!/usr/bin/env python3
import json
import os
import psycopg2
from psycopg2.extras import Json

DB_URL = os.environ.get("DATABASE_URL", "postgres://impossible_user:impossible_secure_pass_2026@localhost:5432/impossible_apparel")
DATA_DIR = os.environ.get("IMP_DATA_DIR", "/home/supernova/WebProject/impossible-apparelv2/data")

def main():
    print(f"Connecting to {DB_URL}...")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    # 1. Import auth.json -> users
    auth_file = os.path.join(DATA_DIR, "auth.json")
    if os.path.exists(auth_file):
        with open(auth_file, "r", encoding="utf-8") as f:
            auth_data = json.load(f)
        
        users_to_insert = []
        if "admin" in auth_data and auth_data["admin"]:
            adm = auth_data["admin"]
            users_to_insert.append((adm.get("username", "admin"), adm.get("hash", ""), adm.get("salt", ""), "admin"))
        if "design" in auth_data and auth_data["design"]:
            des = auth_data["design"]
            users_to_insert.append((des.get("username", "desain"), des.get("hash", ""), des.get("salt", ""), "design"))

        for username, password_hash, salt, role in users_to_insert:
            cur.execute("""
                INSERT INTO users (username, password_hash, salt, role, created_at, updated_at)
                VALUES (%s, %s, %s, %s, NOW(), NOW())
                ON CONFLICT (username) DO UPDATE 
                SET password_hash = EXCLUDED.password_hash, salt = EXCLUDED.salt, role = EXCLUDED.role, updated_at = NOW();
            """, (username, password_hash, salt, role))
        print(f"Imported {len(users_to_insert)} users.")

    # 2. Import impossible-apparel.json
    db_file = os.path.join(DATA_DIR, "impossible-apparel.json")
    if not os.path.exists(db_file):
        print(f"Data file {db_file} not found.")
        conn.commit()
        return

    with open(db_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 2.1 Raw Materials
    raw_materials = data.get("raw_materials", [])
    for rm in raw_materials:
        cur.execute("""
            INSERT INTO raw_materials (id, name, unit, unit_price, note, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name, unit = EXCLUDED.unit, unit_price = EXCLUDED.unit_price,
                note = EXCLUDED.note, updated_at = EXCLUDED.updated_at;
        """, (rm["id"], rm["name"], rm.get("unit", "pcs"), rm.get("unit_price", 0), rm.get("note", ""), rm.get("created_at"), rm.get("updated_at")))
    if raw_materials:
        cur.execute("SELECT setval('raw_materials_id_seq', (SELECT COALESCE(MAX(id), 1) FROM raw_materials));")
    print(f"Imported {len(raw_materials)} raw materials.")

    # 2.2 Order Types & Order Type Materials
    order_types = data.get("order_types", [])
    for ot in order_types:
        cur.execute("""
            INSERT INTO order_types (id, name, output_unit, selling_price, note, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name, output_unit = EXCLUDED.output_unit, selling_price = EXCLUDED.selling_price,
                note = EXCLUDED.note, updated_at = EXCLUDED.updated_at;
        """, (ot["id"], ot["name"], ot.get("output_unit", "pcs"), ot.get("selling_price", 0), ot.get("note", ""), ot.get("created_at"), ot.get("updated_at")))

        materials = ot.get("materials", [])
        for mat in materials:
            rm_id = mat.get("raw_material_id")
            qty = mat.get("qty", 1.0)
            if rm_id:
                cur.execute("""
                    INSERT INTO order_type_materials (order_type_id, raw_material_id, qty, created_at)
                    VALUES (%s, %s, %s, NOW())
                    ON CONFLICT (order_type_id, raw_material_id) DO UPDATE
                    SET qty = EXCLUDED.qty;
                """, (ot["id"], rm_id, qty))
    if order_types:
        cur.execute("SELECT setval('order_types_id_seq', (SELECT COALESCE(MAX(id), 1) FROM order_types));")
    print(f"Imported {len(order_types)} order types.")

    # 2.3 Jobs
    jobs = data.get("jobs", [])
    for job in jobs:
        cur.execute("""
            INSERT INTO jobs (id, spk, customer, instruction_type, order_type_id, product,
                              hpp_unit_snapshot, selling_price_snapshot, hpp_materials_snapshot,
                              qty, deadline, priority, status, note, designer, computer, customer_code,
                              created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE
            SET spk = EXCLUDED.spk, customer = EXCLUDED.customer, instruction_type = EXCLUDED.instruction_type,
                order_type_id = EXCLUDED.order_type_id, product = EXCLUDED.product,
                hpp_unit_snapshot = EXCLUDED.hpp_unit_snapshot, selling_price_snapshot = EXCLUDED.selling_price_snapshot,
                hpp_materials_snapshot = EXCLUDED.hpp_materials_snapshot, qty = EXCLUDED.qty,
                deadline = EXCLUDED.deadline, priority = EXCLUDED.priority, status = EXCLUDED.status,
                note = EXCLUDED.note, designer = EXCLUDED.designer, computer = EXCLUDED.computer,
                customer_code = EXCLUDED.customer_code, updated_at = EXCLUDED.updated_at;
        """, (
            job["id"], job["spk"], job["customer"], job.get("instruction_type", "INSTRUKSI BIASA"),
            job.get("order_type_id"), job["product"], job.get("hpp_unit_snapshot", 0),
            job.get("selling_price_snapshot", 0), Json(job.get("hpp_materials_snapshot", [])),
            job.get("qty", 1), job.get("deadline"), job.get("priority", "NORMAL"),
            job.get("status", "MENUNGGU"), job.get("note", ""), job.get("designer", ""),
            job.get("computer", ""), job.get("customer_code", ""), job.get("created_at"), job.get("updated_at")
        ))
    if jobs:
        cur.execute("SELECT setval('jobs_id_seq', (SELECT COALESCE(MAX(id), 1) FROM jobs));")
    print(f"Imported {len(jobs)} jobs.")

    # 2.4 Attachments
    attachments = data.get("attachments", [])
    for att in attachments:
        cur.execute("""
            INSERT INTO attachments (id, job_id, kind, filename, stored_name, mime, size, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE
            SET filename = EXCLUDED.filename, stored_name = EXCLUDED.stored_name,
                mime = EXCLUDED.mime, size = EXCLUDED.size;
        """, (att["id"], att["job_id"], att["kind"], att["filename"], att["stored_name"], att.get("mime", "application/octet-stream"), att.get("size", 0), att.get("created_at")))
    if attachments:
        cur.execute("SELECT setval('attachments_id_seq', (SELECT COALESCE(MAX(id), 1) FROM attachments));")
    print(f"Imported {len(attachments)} attachments.")

    # 2.5 Messages
    messages = data.get("messages", [])
    for msg in messages:
        cur.execute("""
            INSERT INTO messages (id, job_id, sender, body, created_at)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body;
        """, (msg["id"], msg["job_id"], msg["sender"], msg["body"], msg.get("created_at")))
    if messages:
        cur.execute("SELECT setval('messages_id_seq', (SELECT COALESCE(MAX(id), 1) FROM messages));")
    print(f"Imported {len(messages)} messages.")

    # 2.6 Tracking
    tracking = data.get("tracking", [])
    for trk in tracking:
        cur.execute("""
            INSERT INTO tracking (id, job_id, stage, note, actor, created_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE
            SET stage = EXCLUDED.stage, note = EXCLUDED.note, actor = EXCLUDED.actor;
        """, (trk["id"], trk["job_id"], trk["stage"], trk.get("note", ""), trk.get("actor", "Admin Lokal"), trk.get("created_at")))
    if tracking:
        cur.execute("SELECT setval('tracking_id_seq', (SELECT COALESCE(MAX(id), 1) FROM tracking));")
    print(f"Imported {len(tracking)} tracking entries.")

    # 2.7 Invoices, Items, Payments
    invoices = data.get("invoices", [])
    for inv in invoices:
        cur.execute("""
            INSERT INTO invoices (id, invoice_no, job_id, customer, address, invoice_date, due_date,
                                  discount, shipping, paid, notes, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE
            SET invoice_no = EXCLUDED.invoice_no, job_id = EXCLUDED.job_id, customer = EXCLUDED.customer,
                address = EXCLUDED.address, invoice_date = EXCLUDED.invoice_date, due_date = EXCLUDED.due_date,
                discount = EXCLUDED.discount, shipping = EXCLUDED.shipping, paid = EXCLUDED.paid,
                notes = EXCLUDED.notes, updated_at = EXCLUDED.updated_at;
        """, (
            inv["id"], inv["invoice_no"], inv.get("job_id"), inv["customer"], inv.get("address", ""),
            inv.get("invoice_date", ""), inv.get("due_date", ""), inv.get("discount", 0),
            inv.get("shipping", 0), inv.get("paid", 0), inv.get("notes", ""),
            inv.get("created_at"), inv.get("updated_at")
        ))

        # Items
        cur.execute("DELETE FROM invoice_items WHERE invoice_id = %s;", (inv["id"],))
        items = inv.get("items", [])
        for idx, item in enumerate(items):
            cur.execute("""
                INSERT INTO invoice_items (invoice_id, description, qty, price, sort_order)
                VALUES (%s, %s, %s, %s, %s);
            """, (inv["id"], item.get("description", ""), item.get("qty", 1), item.get("price", 0), idx))

        # Payments
        payments = inv.get("payments", [])
        for p_idx, pay in enumerate(payments):
            cur.execute("""
                INSERT INTO invoice_payments (id, invoice_id, receipt_no, amount, date, method, note, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE
                SET receipt_no = EXCLUDED.receipt_no, amount = EXCLUDED.amount, date = EXCLUDED.date,
                    method = EXCLUDED.method, note = EXCLUDED.note;
            """, (
                pay.get("id", p_idx + 1), inv["id"], pay.get("receipt_no", ""),
                pay.get("amount", 0), pay.get("date", inv.get("invoice_date")),
                pay.get("method", "Tunai"), pay.get("note", ""), pay.get("created_at")
            ))
    if invoices:
        cur.execute("SELECT setval('invoices_id_seq', (SELECT COALESCE(MAX(id), 1) FROM invoices));")
        cur.execute("SELECT setval('invoice_payments_id_seq', (SELECT COALESCE(MAX(id), 1) FROM invoice_payments));")
    print(f"Imported {len(invoices)} invoices.")

    # 2.8 Cashflow Expenses
    cashflow_expenses = data.get("cashflow_expenses", [])
    for exp in cashflow_expenses:
        cur.execute("""
            INSERT INTO cashflow_expenses (id, job_id, date, category, amount, description, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE
            SET job_id = EXCLUDED.job_id, date = EXCLUDED.date, category = EXCLUDED.category,
                amount = EXCLUDED.amount, description = EXCLUDED.description, updated_at = EXCLUDED.updated_at;
        """, (exp["id"], exp.get("job_id"), exp["date"], exp.get("category", "OPERASIONAL"), exp.get("amount", 0), exp.get("description", ""), exp.get("created_at"), exp.get("updated_at")))
    if cashflow_expenses:
        cur.execute("SELECT setval('cashflow_expenses_id_seq', (SELECT COALESCE(MAX(id), 1) FROM cashflow_expenses));")
    print(f"Imported {len(cashflow_expenses)} cashflow expenses.")

    # 2.9 Catalog Products & Catalog Media
    # Step A: Insert catalog products with cover_media_id = NULL to satisfy FK
    catalog_products = data.get("catalog_products", [])
    for cp in catalog_products:
        cur.execute("""
            INSERT INTO catalog_products (id, name, slug, order_type_id, category_name, short_description,
                                         description, status, badge, collection, display_order, featured,
                                         price, min_order, production_days, sizes, material_ids,
                                         specifications, faq, seo_title, seo_description, cover_media_id,
                                         created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NULL, %s, %s)
            ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name, slug = EXCLUDED.slug, order_type_id = EXCLUDED.order_type_id,
                category_name = EXCLUDED.category_name, short_description = EXCLUDED.short_description,
                description = EXCLUDED.description, status = EXCLUDED.status, badge = EXCLUDED.badge,
                collection = EXCLUDED.collection, display_order = EXCLUDED.display_order, featured = EXCLUDED.featured,
                price = EXCLUDED.price, min_order = EXCLUDED.min_order, production_days = EXCLUDED.production_days,
                sizes = EXCLUDED.sizes, material_ids = EXCLUDED.material_ids, specifications = EXCLUDED.specifications,
                faq = EXCLUDED.faq, seo_title = EXCLUDED.seo_title, seo_description = EXCLUDED.seo_description,
                updated_at = EXCLUDED.updated_at;
        """, (
            cp["id"], cp["name"], cp["slug"], cp.get("order_type_id"), cp.get("category_name", "Lainnya"),
            cp.get("short_description", ""), cp.get("description", ""), cp.get("status", "DRAFT"),
            cp.get("badge", ""), cp.get("collection", ""), cp.get("display_order", 0), cp.get("featured", False),
            cp.get("price", 0), cp.get("min_order", 1), cp.get("production_days", 0),
            Json(cp.get("sizes", [])), Json(cp.get("material_ids", [])), cp.get("specifications", ""),
            Json(cp.get("faq", [])), cp.get("seo_title", ""), cp.get("seo_description", ""),
            cp.get("created_at"), cp.get("updated_at")
        ))
    if catalog_products:
        cur.execute("SELECT setval('catalog_products_id_seq', (SELECT COALESCE(MAX(id), 1) FROM catalog_products));")

    # Step B: Insert catalog media
    catalog_media = data.get("catalog_media", [])
    for cm in catalog_media:
        cur.execute("""
            INSERT INTO catalog_media (id, product_id, kind, filename, stored_name, mime, size, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE
            SET product_id = EXCLUDED.product_id, kind = EXCLUDED.kind, filename = EXCLUDED.filename,
                stored_name = EXCLUDED.stored_name, mime = EXCLUDED.mime, size = EXCLUDED.size;
        """, (cm["id"], cm.get("product_id"), cm["kind"], cm["filename"], cm["stored_name"], cm.get("mime", "application/octet-stream"), cm.get("size", 0), cm.get("created_at")))
    if catalog_media:
        cur.execute("SELECT setval('catalog_media_id_seq', (SELECT COALESCE(MAX(id), 1) FROM catalog_media));")
    print(f"Imported {len(catalog_media)} catalog media entries.")

    # Step C: Update cover_media_id on catalog_products
    for cp in catalog_products:
        if cp.get("cover_media_id"):
            cur.execute("""
                UPDATE catalog_products SET cover_media_id = %s WHERE id = %s;
            """, (cp["cover_media_id"], cp["id"]))
    print(f"Imported {len(catalog_products)} catalog products.")

    # 2.10 Website Settings
    ws = data.get("website_settings", {})
    if ws:
        cur.execute("""
            INSERT INTO website_settings (id, brand_name, hero_title, hero_text, about_kicker, about_title,
                                         about_text, catalog_title, whatsapp, address, instagram, primary_color,
                                         background_color, logo_media_id, nav_background_media_id,
                                         background_media_id, about_background_media_id, hero_media_ids,
                                         hero_interval_seconds, show_order_ticker, show_about, ticker_label,
                                         show_prices, updated_at)
            VALUES (1, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE
            SET brand_name = EXCLUDED.brand_name, hero_title = EXCLUDED.hero_title, hero_text = EXCLUDED.hero_text,
                about_kicker = EXCLUDED.about_kicker, about_title = EXCLUDED.about_title,
                about_text = EXCLUDED.about_text, catalog_title = EXCLUDED.catalog_title,
                whatsapp = EXCLUDED.whatsapp, address = EXCLUDED.address, instagram = EXCLUDED.instagram,
                primary_color = EXCLUDED.primary_color, background_color = EXCLUDED.background_color,
                logo_media_id = EXCLUDED.logo_media_id, nav_background_media_id = EXCLUDED.nav_background_media_id,
                background_media_id = EXCLUDED.background_media_id, about_background_media_id = EXCLUDED.about_background_media_id,
                hero_media_ids = EXCLUDED.hero_media_ids, hero_interval_seconds = EXCLUDED.hero_interval_seconds,
                show_order_ticker = EXCLUDED.show_order_ticker, show_about = EXCLUDED.show_about,
                ticker_label = EXCLUDED.ticker_label, show_prices = EXCLUDED.show_prices, updated_at = EXCLUDED.updated_at;
        """, (
            ws.get("brand_name", "IMPOSSIBLE APPAREL"), ws.get("hero_title", ""), ws.get("hero_text", ""),
            ws.get("about_kicker", "TENTANG KAMI"), ws.get("about_title", ""), ws.get("about_text", ""),
            ws.get("catalog_title", "Katalog Impossible"), ws.get("whatsapp", ""), ws.get("address", ""),
            ws.get("instagram", ""), ws.get("primary_color", "#e32127"), ws.get("background_color", "#090909"),
            ws.get("logo_media_id"), ws.get("nav_background_media_id"), ws.get("background_media_id"),
            ws.get("about_background_media_id"), Json(ws.get("hero_media_ids", [])),
            ws.get("hero_interval_seconds", 6), ws.get("show_order_ticker", True), ws.get("show_about", True),
            ws.get("ticker_label", "LIVE ORDER"), ws.get("show_prices", True), ws.get("updated_at")
        ))
        print("Imported website settings.")

    # 2.11 Marketing Settings
    ms = data.get("marketing_settings", {})
    if ms:
        cur.execute("""
            INSERT INTO marketing_settings (id, strategy_model, video_model, daily_video_limit,
                                           monthly_ai_budget_idr, usd_idr, default_duration,
                                           default_resolution, brand_voice, default_audience, updated_at)
            VALUES (1, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE
            SET strategy_model = EXCLUDED.strategy_model, video_model = EXCLUDED.video_model,
                daily_video_limit = EXCLUDED.daily_video_limit, monthly_ai_budget_idr = EXCLUDED.monthly_ai_budget_idr,
                usd_idr = EXCLUDED.usd_idr, default_duration = EXCLUDED.default_duration,
                default_resolution = EXCLUDED.default_resolution, brand_voice = EXCLUDED.brand_voice,
                default_audience = EXCLUDED.default_audience, updated_at = EXCLUDED.updated_at;
        """, (
            ms.get("strategy_model", "gemini-3.8-flash"), ms.get("video_model", "veo-3.1-lite-generate-preview"),
            ms.get("daily_video_limit", 3), ms.get("monthly_ai_budget_idr", 700000), ms.get("usd_idr", 18000),
            ms.get("default_duration", 8), ms.get("default_resolution", "720p"), ms.get("brand_voice", ""),
            ms.get("default_audience", ""), ms.get("updated_at")
        ))
        print("Imported marketing settings.")

    conn.commit()
    cur.close()
    conn.close()
    print("Database migration and data import completed successfully!")

if __name__ == "__main__":
    main()
