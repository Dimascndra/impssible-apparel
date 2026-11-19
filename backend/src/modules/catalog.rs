use axum::{
    extract::{Multipart, Path, State},
    http::header,
    http::StatusCode,
    response::Response,
    Json,
};
use chrono::Utc;
use serde_json::{json, Value};
use sqlx::FromRow;
use uuid::Uuid;

use crate::error::AppError;
use crate::modules::master::{get_order_types_list, list_raw_materials, RawMaterial};
use crate::modules::website::{get_public_website_settings, public_catalog_media, DbCatalogMedia};
use crate::state::AppState;

#[derive(Debug, Clone, FromRow)]
pub struct DbCatalogProduct {
    pub id: i64,
    pub name: String,
    pub slug: String,
    pub order_type_id: Option<i64>,
    pub category_name: String,
    pub short_description: Option<String>,
    pub description: Option<String>,
    pub status: String,
    pub badge: Option<String>,
    pub collection: Option<String>,
    pub display_order: i32,
    pub featured: bool,
    pub price: i64,
    pub min_order: i32,
    pub production_days: i32,
    pub sizes: Value,
    pub material_ids: Value,
    pub specifications: Option<String>,
    pub faq: Value,
    pub seo_title: Option<String>,
    pub seo_description: Option<String>,
    pub cover_media_id: Option<i64>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

pub fn slugify(value: &str) -> String {
    let lower = value.trim().to_lowercase();
    let re = regex::Regex::new(r"[^a-z0-9]+").unwrap();
    let slug = re.replace_all(&lower, "-").trim_matches('-').to_string();
    if slug.is_empty() {
        format!("produk-{}", Utc::now().timestamp_millis())
    } else {
        slug[..slug.len().min(120)].to_string()
    }
}

pub async fn build_public_catalog_product(
    prod: &DbCatalogProduct,
    all_media: &[DbCatalogMedia],
    raw_materials: &[RawMaterial],
    order_types: &[crate::modules::master::PublicOrderType],
) -> Value {
    let ot = prod.order_type_id.and_then(|id| order_types.iter().find(|o| o.id == id));
    let category = ot.map(|o| o.name.clone()).unwrap_or_else(|| {
        if prod.category_name.is_empty() { "Lainnya".to_string() } else { prod.category_name.clone() }
    });
    let price = if prod.price > 0 { prod.price } else { ot.map(|o| o.selling_price).unwrap_or(0) };

    let mat_ids: Vec<i64> = serde_json::from_value(prod.material_ids.clone()).unwrap_or_default();
    let materials: Vec<Value> = mat_ids
        .into_iter()
        .filter_map(|id| raw_materials.iter().find(|rm| rm.id == id))
        .map(|rm| {
            json!({
                "id": rm.id,
                "name": rm.name,
                "unit": rm.unit,
                "note": rm.note.clone().unwrap_or_default()
            })
        })
        .collect();

    let product_media: Vec<&DbCatalogMedia> = all_media.iter().filter(|m| m.product_id == Some(prod.id)).collect();
    let cover = prod.cover_media_id
        .and_then(|cid| product_media.iter().find(|m| m.id == cid).copied())
        .or_else(|| product_media.iter().find(|m| m.kind == "cover").copied())
        .or_else(|| product_media.first().copied());

    let gallery: Vec<Value> = product_media
        .iter()
        .filter(|m| cover.map(|c| c.id != m.id).unwrap_or(true))
        .filter_map(|m| public_catalog_media(Some(m)))
        .collect();

    json!({
        "id": prod.id,
        "name": prod.name,
        "slug": prod.slug,
        "order_type_id": prod.order_type_id,
        "category": category,
        "category_name": prod.category_name,
        "price": price,
        "short_description": prod.short_description.clone().unwrap_or_default(),
        "description": prod.description.clone().unwrap_or_default(),
        "status": prod.status,
        "badge": prod.badge.clone().unwrap_or_default(),
        "collection": prod.collection.clone().unwrap_or_default(),
        "display_order": prod.display_order,
        "featured": prod.featured,
        "min_order": prod.min_order,
        "production_days": prod.production_days,
        "sizes": prod.sizes,
        "material_ids": prod.material_ids,
        "materials": materials,
        "specifications": prod.specifications.clone().unwrap_or_default(),
        "faq": prod.faq,
        "seo_title": prod.seo_title.clone().unwrap_or_default(),
        "seo_description": prod.seo_description.clone().unwrap_or_default(),
        "cover_media_id": prod.cover_media_id,
        "cover": public_catalog_media(cover),
        "gallery": gallery,
        "created_at": prod.created_at,
        "updated_at": prod.updated_at
    })
}

// Handlers
pub async fn send_catalog_media(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Response, AppError> {
    let media = sqlx::query_as::<_, DbCatalogMedia>(
        "SELECT id, product_id, kind, filename, stored_name, mime, size, created_at FROM catalog_media WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Media tidak ditemukan.".to_string()))?;

    let path = state.upload_dir.join(&media.stored_name);
    if !path.exists() {
        return Err(AppError::NotFound("Media tidak tersedia.".to_string()));
    }

    let contents = std::fs::read(&path)?;
    let response = Response::builder()
        .header(header::CONTENT_TYPE, media.mime)
        .body(contents.into())
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(response)
}

pub async fn send_catalog_public(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let pool = &state.pool;
    let products = sqlx::query_as::<_, DbCatalogProduct>(
        "SELECT * FROM catalog_products WHERE status = 'PUBLISH' ORDER BY display_order ASC, id DESC"
    )
    .fetch_all(pool)
    .await?;

    let all_media = sqlx::query_as::<_, DbCatalogMedia>(
        "SELECT id, product_id, kind, filename, stored_name, mime, size, created_at FROM catalog_media"
    )
    .fetch_all(pool)
    .await?;

    let raw_materials = list_raw_materials(pool).await?;
    let order_types = get_order_types_list(pool).await?;

    let mut pub_products = Vec::new();
    for p in &products {
        pub_products.push(build_public_catalog_product(p, &all_media, &raw_materials, &order_types).await);
    }

    let settings = get_public_website_settings(pool).await?;
    Ok(Json(json!({ "products": pub_products, "settings": settings })))
}

pub async fn send_catalog_product_public(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> Result<Json<Value>, AppError> {
    let pool = &state.pool;
    let prod = sqlx::query_as::<_, DbCatalogProduct>(
        "SELECT * FROM catalog_products WHERE status = 'PUBLISH' AND slug = $1"
    )
    .bind(slug)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Produk tidak ditemukan.".to_string()))?;

    let all_media = sqlx::query_as::<_, DbCatalogMedia>(
        "SELECT id, product_id, kind, filename, stored_name, mime, size, created_at FROM catalog_media"
    )
    .fetch_all(pool)
    .await?;

    let raw_materials = list_raw_materials(pool).await?;
    let order_types = get_order_types_list(pool).await?;

    let p = build_public_catalog_product(&prod, &all_media, &raw_materials, &order_types).await;
    let settings = get_public_website_settings(pool).await?;

    Ok(Json(json!({ "product": p, "settings": settings })))
}

pub async fn send_public_order_activity(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let pool = &state.pool;

    #[derive(FromRow)]
    struct TrkEvt {
        id: i64,
        stage: String,
        product: String,
        qty: i32,
        created_at: chrono::DateTime<chrono::Utc>,
    }

    let trk_events = sqlx::query_as::<_, TrkEvt>(
        r#"
        SELECT t.id, t.stage, j.product, j.qty, t.created_at
        FROM tracking t
        JOIN jobs j ON j.id = t.job_id
        ORDER BY t.created_at DESC
        LIMIT 20
        "#
    )
    .fetch_all(pool)
    .await?;

    let mut events = Vec::new();
    for t in trk_events {
        let msg = if t.stage == "SELESAI" {
            format!("Order {} · {} pcs telah selesai diproduksi", t.product, t.qty)
        } else {
            format!("Order {} · {} pcs masuk tahap {}", t.product, t.qty, t.stage)
        };
        events.push(json!({
            "id": format!("tracking-{}", t.id),
            "type": "tracking",
            "stage": t.stage,
            "message": msg,
            "created_at": t.created_at
        }));
    }

    #[derive(FromRow)]
    struct JobEvt {
        id: i64,
        product: String,
        qty: i32,
        created_at: chrono::DateTime<chrono::Utc>,
    }

    let job_events = sqlx::query_as::<_, JobEvt>(
        "SELECT id, product, qty, created_at FROM jobs ORDER BY created_at DESC LIMIT 20"
    )
    .fetch_all(pool)
    .await?;

    for j in job_events {
        events.push(json!({
            "id": format!("order-{}", j.id),
            "type": "order",
            "stage": "ORDER MASUK",
            "message": format!("Order {} · {} pcs telah masuk antrean", j.product, j.qty),
            "created_at": j.created_at
        }));
    }

    events.sort_by(|a, b| {
        let da = a["created_at"].as_str().unwrap_or_default();
        let db = b["created_at"].as_str().unwrap_or_default();
        db.cmp(da)
    });
    events.truncate(30);

    Ok(Json(json!({ "events": events, "updated_at": Utc::now() })))
}

pub async fn send_catalog_admin(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let pool = &state.pool;
    let products = sqlx::query_as::<_, DbCatalogProduct>(
        "SELECT * FROM catalog_products ORDER BY display_order ASC, id DESC"
    )
    .fetch_all(pool)
    .await?;

    let all_media = sqlx::query_as::<_, DbCatalogMedia>(
        "SELECT id, product_id, kind, filename, stored_name, mime, size, created_at FROM catalog_media"
    )
    .fetch_all(pool)
    .await?;

    let raw_materials = list_raw_materials(pool).await?;
    let order_types = get_order_types_list(pool).await?;

    let mut result = Vec::new();
    for p in &products {
        result.push(build_public_catalog_product(p, &all_media, &raw_materials, &order_types).await);
    }

    Ok(Json(json!({
        "products": result,
        "order_types": order_types,
        "raw_materials": raw_materials
    })))
}

pub async fn create_catalog_product(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let mut name = String::new();
    let mut slug = String::new();
    let mut order_type_id: Option<i64> = None;
    let mut category_name = "Lainnya".to_string();
    let mut short_description = String::new();
    let mut description = String::new();
    let mut status = "DRAFT".to_string();
    let mut badge = String::new();
    let mut collection = String::new();
    let mut display_order = 0i32;
    let mut featured = false;
    let mut price = 0i64;
    let mut min_order = 1i32;
    let mut production_days = 0i32;
    let mut sizes: Vec<String> = Vec::new();
    let mut material_ids: Vec<i64> = Vec::new();
    let mut specifications = String::new();
    let mut faq: Vec<Value> = Vec::new();
    let mut seo_title = String::new();
    let mut seo_description = String::new();

    let mut cover_upload: Option<(String, String, String, i64)> = None;
    let mut gallery_uploads: Vec<(String, String, String, i64)> = Vec::new();

    while let Some(field) = multipart.next_field().await.map_err(|e| AppError::BadRequest(e.to_string()))? {
        let field_name = field.name().unwrap_or_default().to_string();
        if field_name == "cover" {
            let filename = field.file_name().unwrap_or("cover.png").to_string();
            let mime = field.content_type().unwrap_or("image/png").to_string();
            let ext = std::path::Path::new(&filename).extension().and_then(|s| s.to_str()).map(|s| format!(".{}", s.to_lowercase())).unwrap_or_default();
            let data = field.bytes().await.map_err(|e| AppError::BadRequest(e.to_string()))?;
            let stored_name = format!("{}{}", Uuid::new_v4(), ext);
            let _ = std::fs::write(state.upload_dir.join(&stored_name), &data);
            cover_upload = Some((filename, stored_name, mime, data.len() as i64));
        } else if field_name == "gallery" {
            let filename = field.file_name().unwrap_or("gallery.png").to_string();
            let mime = field.content_type().unwrap_or("image/png").to_string();
            let ext = std::path::Path::new(&filename).extension().and_then(|s| s.to_str()).map(|s| format!(".{}", s.to_lowercase())).unwrap_or_default();
            let data = field.bytes().await.map_err(|e| AppError::BadRequest(e.to_string()))?;
            let stored_name = format!("{}{}", Uuid::new_v4(), ext);
            let _ = std::fs::write(state.upload_dir.join(&stored_name), &data);
            gallery_uploads.push((filename, stored_name, mime, data.len() as i64));
        } else {
            let text = field.text().await.unwrap_or_default();
            match field_name.as_str() {
                "name" => name = text,
                "slug" => slug = text,
                "order_type_id" => order_type_id = text.parse().ok(),
                "category_name" => category_name = text,
                "short_description" => short_description = text,
                "description" => description = text,
                "status" => status = if text == "PUBLISH" { "PUBLISH".to_string() } else { "DRAFT".to_string() },
                "badge" => badge = text,
                "collection" => collection = text,
                "display_order" => display_order = text.parse().unwrap_or(0),
                "featured" => featured = text == "true" || text == "1",
                "price" => price = text.parse().unwrap_or(0),
                "min_order" => min_order = text.parse().unwrap_or(1),
                "production_days" => production_days = text.parse().unwrap_or(0),
                "sizes" => {
                    sizes = text.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
                }
                "material_ids" => {
                    if let Ok(ids) = serde_json::from_str::<Vec<i64>>(&text) {
                        material_ids = ids;
                    }
                }
                "specifications" => specifications = text,
                "faq" => {
                    for line in text.lines() {
                        if let Some((q, a)) = line.split_once('|') {
                            faq.push(json!({ "question": q.trim(), "answer": a.trim() }));
                        }
                    }
                }
                "seo_title" => seo_title = text,
                "seo_description" => seo_description = text,
                _ => {}
            }
        }
    }

    if name.trim().is_empty() {
        return Err(AppError::BadRequest("Nama produk wajib diisi.".to_string()));
    }

    let mut final_slug = if slug.trim().is_empty() { slugify(&name) } else { slugify(&slug) };
    let mut suffix = 2;
    while sqlx::query_scalar::<_, i64>("SELECT id FROM catalog_products WHERE slug = $1")
        .bind(&final_slug)
        .fetch_optional(&state.pool)
        .await?
        .is_some()
    {
        final_slug = format!("{}-{}", slugify(&name), suffix);
        suffix += 1;
    }

    let mut tx = state.pool.begin().await?;

    let product_id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO catalog_products (name, slug, order_type_id, category_name, short_description,
                                     description, status, badge, collection, display_order, featured,
                                     price, min_order, production_days, sizes, material_ids,
                                     specifications, faq, seo_title, seo_description, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW(), NOW())
        RETURNING id
        "#
    )
    .bind(name)
    .bind(final_slug)
    .bind(order_type_id)
    .bind(category_name)
    .bind(short_description)
    .bind(description)
    .bind(status)
    .bind(badge)
    .bind(collection)
    .bind(display_order)
    .bind(featured)
    .bind(price)
    .bind(min_order)
    .bind(production_days)
    .bind(json!(sizes))
    .bind(json!(material_ids))
    .bind(specifications)
    .bind(json!(faq))
    .bind(seo_title)
    .bind(seo_description)
    .fetch_one(&mut *tx)
    .await?;

    let cover_id = if let Some((fname, sname, mime, sz)) = cover_upload {
        let id: i64 = sqlx::query_scalar(
            "INSERT INTO catalog_media (product_id, kind, filename, stored_name, mime, size, created_at) VALUES ($1, 'cover', $2, $3, $4, $5, NOW()) RETURNING id"
        )
        .bind(product_id)
        .bind(fname)
        .bind(sname)
        .bind(mime)
        .bind(sz)
        .fetch_one(&mut *tx)
        .await?;
        Some(id)
    } else {
        None
    };

    if let Some(cid) = cover_id {
        sqlx::query("UPDATE catalog_products SET cover_media_id = $1 WHERE id = $2")
            .bind(cid)
            .bind(product_id)
            .execute(&mut *tx)
            .await?;
    }

    for (fname, sname, mime, sz) in gallery_uploads {
        sqlx::query(
            "INSERT INTO catalog_media (product_id, kind, filename, stored_name, mime, size, created_at) VALUES ($1, 'gallery', $2, $3, $4, $5, NOW())"
        )
        .bind(product_id)
        .bind(fname)
        .bind(sname)
        .bind(mime)
        .bind(sz)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    let prod = sqlx::query_as::<_, DbCatalogProduct>("SELECT * FROM catalog_products WHERE id = $1")
        .bind(product_id)
        .fetch_one(&state.pool)
        .await?;

    let all_media = sqlx::query_as::<_, DbCatalogMedia>("SELECT * FROM catalog_media").fetch_all(&state.pool).await?;
    let raw_materials = list_raw_materials(&state.pool).await?;
    let order_types = get_order_types_list(&state.pool).await?;
    let p = build_public_catalog_product(&prod, &all_media, &raw_materials, &order_types).await;

    Ok((StatusCode::CREATED, Json(json!({ "product": p }))))
}

pub async fn update_catalog_product(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    mut multipart: Multipart,
) -> Result<Json<Value>, AppError> {
    let mut name: Option<String> = None;
    let mut slug: Option<String> = None;
    let mut order_type_id: Option<i64> = None;
    let mut category_name: Option<String> = None;
    let mut short_description: Option<String> = None;
    let mut description: Option<String> = None;
    let mut status: Option<String> = None;
    let mut badge: Option<String> = None;
    let mut collection: Option<String> = None;
    let mut display_order: Option<i32> = None;
    let mut featured: Option<bool> = None;
    let mut price: Option<i64> = None;
    let mut min_order: Option<i32> = None;
    let mut production_days: Option<i32> = None;
    let mut sizes: Option<Vec<String>> = None;
    let mut material_ids: Option<Vec<i64>> = None;
    let mut specifications: Option<String> = None;
    let mut faq: Option<Vec<Value>> = None;
    let mut seo_title: Option<String> = None;
    let mut seo_description: Option<String> = None;

    let mut cover_upload: Option<(String, String, String, i64)> = None;

    while let Some(field) = multipart.next_field().await.map_err(|e| AppError::BadRequest(e.to_string()))? {
        let field_name = field.name().unwrap_or_default().to_string();
        if field_name == "cover" {
            let filename = field.file_name().unwrap_or("cover.png").to_string();
            let mime = field.content_type().unwrap_or("image/png").to_string();
            let ext = std::path::Path::new(&filename).extension().and_then(|s| s.to_str()).map(|s| format!(".{}", s.to_lowercase())).unwrap_or_default();
            let data = field.bytes().await.map_err(|e| AppError::BadRequest(e.to_string()))?;
            let stored_name = format!("{}{}", Uuid::new_v4(), ext);
            let _ = std::fs::write(state.upload_dir.join(&stored_name), &data);
            cover_upload = Some((filename, stored_name, mime, data.len() as i64));
        } else {
            let text = field.text().await.unwrap_or_default();
            match field_name.as_str() {
                "name" => name = Some(text),
                "slug" => slug = Some(text),
                "order_type_id" => order_type_id = text.parse().ok(),
                "category_name" => category_name = Some(text),
                "short_description" => short_description = Some(text),
                "description" => description = Some(text),
                "status" => status = Some(if text == "PUBLISH" { "PUBLISH".to_string() } else { "DRAFT".to_string() }),
                "badge" => badge = Some(text),
                "collection" => collection = Some(text),
                "display_order" => display_order = text.parse().ok(),
                "featured" => featured = Some(text == "true" || text == "1"),
                "price" => price = text.parse().ok(),
                "min_order" => min_order = text.parse().ok(),
                "production_days" => production_days = text.parse().ok(),
                "sizes" => {
                    sizes = Some(text.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect());
                }
                "material_ids" => {
                    if let Ok(ids) = serde_json::from_str::<Vec<i64>>(&text) {
                        material_ids = Some(ids);
                    }
                }
                "specifications" => specifications = Some(text),
                "faq" => {
                    let mut list = Vec::new();
                    for line in text.lines() {
                        if let Some((q, a)) = line.split_once('|') {
                            list.push(json!({ "question": q.trim(), "answer": a.trim() }));
                        }
                    }
                    faq = Some(list);
                }
                "seo_title" => seo_title = Some(text),
                "seo_description" => seo_description = Some(text),
                _ => {}
            }
        }
    }

    let mut tx = state.pool.begin().await?;

    let existing = sqlx::query_as::<_, DbCatalogProduct>("SELECT * FROM catalog_products WHERE id = $1")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::NotFound("Produk tidak ditemukan.".to_string()))?;

    let final_slug = match slug {
        Some(s) if !s.trim().is_empty() => slugify(&s),
        _ => existing.slug,
    };

    let cover_id = if let Some((fname, sname, mime, sz)) = cover_upload {
        let cid: i64 = sqlx::query_scalar(
            "INSERT INTO catalog_media (product_id, kind, filename, stored_name, mime, size, created_at) VALUES ($1, 'cover', $2, $3, $4, $5, NOW()) RETURNING id"
        )
        .bind(id)
        .bind(fname)
        .bind(sname)
        .bind(mime)
        .bind(sz)
        .fetch_one(&mut *tx)
        .await?;
        Some(cid)
    } else {
        existing.cover_media_id
    };

    sqlx::query(
        r#"
        UPDATE catalog_products
        SET name = COALESCE($1, name),
            slug = $2,
            order_type_id = COALESCE($3, order_type_id),
            category_name = COALESCE($4, category_name),
            short_description = COALESCE($5, short_description),
            description = COALESCE($6, description),
            status = COALESCE($7, status),
            badge = COALESCE($8, badge),
            collection = COALESCE($9, collection),
            display_order = COALESCE($10, display_order),
            featured = COALESCE($11, featured),
            price = COALESCE($12, price),
            min_order = COALESCE($13, min_order),
            production_days = COALESCE($14, production_days),
            sizes = COALESCE($15, sizes),
            material_ids = COALESCE($16, material_ids),
            specifications = COALESCE($17, specifications),
            faq = COALESCE($18, faq),
            seo_title = COALESCE($19, seo_title),
            seo_description = COALESCE($20, seo_description),
            cover_media_id = $21,
            updated_at = NOW()
        WHERE id = $22
        "#
    )
    .bind(name)
    .bind(final_slug)
    .bind(order_type_id)
    .bind(category_name)
    .bind(short_description)
    .bind(description)
    .bind(status)
    .bind(badge)
    .bind(collection)
    .bind(display_order)
    .bind(featured)
    .bind(price)
    .bind(min_order)
    .bind(production_days)
    .bind(sizes.map(|s| json!(s)))
    .bind(material_ids.map(|m| json!(m)))
    .bind(specifications)
    .bind(faq.map(|f| json!(f)))
    .bind(seo_title)
    .bind(seo_description)
    .bind(cover_id)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let prod = sqlx::query_as::<_, DbCatalogProduct>("SELECT * FROM catalog_products WHERE id = $1")
        .bind(id)
        .fetch_one(&state.pool)
        .await?;

    let all_media = sqlx::query_as::<_, DbCatalogMedia>("SELECT * FROM catalog_media").fetch_all(&state.pool).await?;
    let raw_materials = list_raw_materials(&state.pool).await?;
    let order_types = get_order_types_list(&state.pool).await?;
    let p = build_public_catalog_product(&prod, &all_media, &raw_materials, &order_types).await;

    Ok(Json(json!({ "product": p })))
}

pub async fn delete_catalog_product(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    let result = sqlx::query("DELETE FROM catalog_products WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Produk tidak ditemukan.".to_string()));
    }

    Ok(Json(json!({ "ok": true, "deleted_id": id })))
}
