use axum::{
    extract::{Multipart, Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::error::AppError;
use crate::state::AppState;

pub const PUBLIC_IMAGE_EXTENSIONS: &[&str] = &[".png", ".jpg", ".jpeg", ".webp", ".gif"];
pub const PUBLIC_VIDEO_EXTENSIONS: &[&str] = &[".mp4", ".webm"];

#[derive(Debug, Clone, FromRow)]
pub struct DbWebsiteSettings {
    pub id: i32,
    pub brand_name: String,
    pub hero_title: String,
    pub hero_text: String,
    pub about_kicker: String,
    pub about_title: String,
    pub about_text: String,
    pub catalog_title: String,
    pub whatsapp: Option<String>,
    pub address: Option<String>,
    pub instagram: Option<String>,
    pub primary_color: String,
    pub background_color: String,
    pub logo_media_id: Option<i64>,
    pub nav_background_media_id: Option<i64>,
    pub background_media_id: Option<i64>,
    pub about_background_media_id: Option<i64>,
    pub hero_media_ids: Value,
    pub hero_interval_seconds: i32,
    pub show_order_ticker: bool,
    pub show_about: bool,
    pub ticker_label: String,
    pub show_prices: bool,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct DbCatalogMedia {
    pub id: i64,
    pub product_id: Option<i64>,
    pub kind: String,
    pub filename: String,
    pub stored_name: String,
    pub mime: String,
    pub size: i64,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub fn public_catalog_media(media: Option<&DbCatalogMedia>) -> Option<Value> {
    media.map(|m| {
        let media_type = if m.mime.starts_with("video/") { "video" } else { "image" };
        json!({
            "id": m.id,
            "filename": m.filename,
            "mime": m.mime,
            "media_type": media_type,
            "size": m.size,
            "url": format!("/media/{}", m.id)
        })
    })
}

pub async fn get_public_website_settings(pool: &PgPool) -> Result<Value, AppError> {
    let settings = sqlx::query_as::<_, DbWebsiteSettings>(
        r#"
        SELECT id, brand_name, hero_title, hero_text, about_kicker, about_title, about_text,
               catalog_title, whatsapp, address, instagram, primary_color, background_color,
               logo_media_id, nav_background_media_id, background_media_id, about_background_media_id,
               hero_media_ids, hero_interval_seconds, show_order_ticker, show_about, ticker_label,
               show_prices, updated_at
        FROM website_settings
        WHERE id = 1
        "#
    )
    .fetch_optional(pool)
    .await?
    .unwrap_or(DbWebsiteSettings {
        id: 1,
        brand_name: "IMPOSSIBLE APPAREL".to_string(),
        hero_title: "CUSTOM APPAREL, BUILT FOR YOUR IDENTITY.".to_string(),
        hero_text: "Jersey, apparel, dan kebutuhan custom yang diproduksi dengan detail dari desain hingga selesai.".to_string(),
        about_kicker: "TENTANG KAMI".to_string(),
        about_title: "DIBUAT UNTUK IDENTITAS ANDA.".to_string(),
        about_text: "IMPOSSIBLE APPAREL membantu mewujudkan jersey dan apparel custom dari tahap desain, pemilihan bahan, produksi, hingga quality control.".to_string(),
        catalog_title: "Katalog Impossible".to_string(),
        whatsapp: Some("".to_string()),
        address: Some("".to_string()),
        instagram: Some("".to_string()),
        primary_color: "#e32127".to_string(),
        background_color: "#090909".to_string(),
        logo_media_id: None,
        nav_background_media_id: None,
        background_media_id: None,
        about_background_media_id: None,
        hero_media_ids: json!([]),
        hero_interval_seconds: 6,
        show_order_ticker: true,
        show_about: true,
        ticker_label: "LIVE ORDER".to_string(),
        show_prices: true,
        updated_at: None,
    });

    let all_media = sqlx::query_as::<_, DbCatalogMedia>(
        "SELECT id, product_id, kind, filename, stored_name, mime, size, created_at FROM catalog_media"
    )
    .fetch_all(pool)
    .await?;

    let logo = settings.logo_media_id.and_then(|id| all_media.iter().find(|m| m.id == id));
    let nav_background = settings.nav_background_media_id.and_then(|id| all_media.iter().find(|m| m.id == id));
    let background = settings.background_media_id.and_then(|id| all_media.iter().find(|m| m.id == id));
    let about_background = settings.about_background_media_id.and_then(|id| all_media.iter().find(|m| m.id == id));

    let hero_ids: Vec<i64> = serde_json::from_value(settings.hero_media_ids.clone()).unwrap_or_default();
    let hero_media: Vec<Value> = hero_ids
        .into_iter()
        .filter_map(|id| all_media.iter().find(|m| m.id == id))
        .filter_map(|m| public_catalog_media(Some(m)))
        .collect();

    Ok(json!({
        "id": settings.id,
        "brand_name": settings.brand_name,
        "hero_title": settings.hero_title,
        "hero_text": settings.hero_text,
        "about_kicker": settings.about_kicker,
        "about_title": settings.about_title,
        "about_text": settings.about_text,
        "catalog_title": settings.catalog_title,
        "whatsapp": settings.whatsapp.unwrap_or_default(),
        "address": settings.address.unwrap_or_default(),
        "instagram": settings.instagram.unwrap_or_default(),
        "primary_color": settings.primary_color,
        "background_color": settings.background_color,
        "logo_media_id": settings.logo_media_id,
        "nav_background_media_id": settings.nav_background_media_id,
        "background_media_id": settings.background_media_id,
        "about_background_media_id": settings.about_background_media_id,
        "hero_interval_seconds": settings.hero_interval_seconds,
        "show_order_ticker": settings.show_order_ticker,
        "show_about": settings.show_about,
        "ticker_label": settings.ticker_label,
        "show_prices": settings.show_prices,
        "updated_at": settings.updated_at,
        "logo": public_catalog_media(logo),
        "nav_background": public_catalog_media(nav_background),
        "background": public_catalog_media(background),
        "about_background": public_catalog_media(about_background),
        "hero_media": hero_media
    }))
}

// Handlers
pub async fn send_website_settings(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let settings = get_public_website_settings(&state.pool).await?;
    Ok(Json(json!({ "settings": settings })))
}

pub async fn update_website_settings(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<Value>, AppError> {
    let mut brand_name: Option<String> = None;
    let mut hero_title: Option<String> = None;
    let mut hero_text: Option<String> = None;
    let mut about_kicker: Option<String> = None;
    let mut about_title: Option<String> = None;
    let mut about_text: Option<String> = None;
    let mut catalog_title: Option<String> = None;
    let mut whatsapp: Option<String> = None;
    let mut address: Option<String> = None;
    let mut instagram: Option<String> = None;
    let mut primary_color: Option<String> = None;
    let mut background_color: Option<String> = None;
    let mut hero_interval_seconds: Option<i32> = None;
    let mut show_order_ticker: Option<bool> = None;
    let mut show_about: Option<bool> = None;
    let mut ticker_label: Option<String> = None;
    let mut show_prices: Option<bool> = None;
    let mut logo_upload: Option<(String, String, String, i64)> = None;

    while let Some(field) = multipart.next_field().await.map_err(|e| AppError::BadRequest(e.to_string()))? {
        let name = field.name().unwrap_or_default().to_string();
        if name == "logo" {
            let filename = field.file_name().unwrap_or("logo.png").to_string();
            let mime = field.content_type().unwrap_or("image/png").to_string();
            let data = field.bytes().await.map_err(|e| AppError::BadRequest(e.to_string()))?;
            let stored_name = format!("{}{}", Uuid::new_v4(), ".png");
            let _ = std::fs::write(state.upload_dir.join(&stored_name), &data);
            logo_upload = Some((filename, stored_name, mime, data.len() as i64));
        } else {
            let text = field.text().await.unwrap_or_default();
            match name.as_str() {
                "brand_name" => brand_name = Some(text),
                "hero_title" => hero_title = Some(text),
                "hero_text" => hero_text = Some(text),
                "about_kicker" => about_kicker = Some(text),
                "about_title" => about_title = Some(text),
                "about_text" => about_text = Some(text),
                "catalog_title" => catalog_title = Some(text),
                "whatsapp" => whatsapp = Some(text),
                "address" => address = Some(text),
                "instagram" => instagram = Some(text),
                "primary_color" => primary_color = Some(text),
                "background_color" => background_color = Some(text),
                "hero_interval_seconds" => hero_interval_seconds = text.parse().ok(),
                "show_order_ticker" => show_order_ticker = Some(text == "true" || text == "1"),
                "show_about" => show_about = Some(text == "true" || text == "1"),
                "ticker_label" => ticker_label = Some(text),
                "show_prices" => show_prices = Some(text == "true" || text == "1"),
                _ => {}
            }
        }
    }

    let mut tx = state.pool.begin().await?;

    let logo_id = if let Some((fname, sname, mime, sz)) = logo_upload {
        let id: i64 = sqlx::query_scalar(
            "INSERT INTO catalog_media (kind, filename, stored_name, mime, size, created_at) VALUES ('website-logo', $1, $2, $3, $4, NOW()) RETURNING id"
        )
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

    sqlx::query(
        r#"
        UPDATE website_settings
        SET brand_name = COALESCE($1, brand_name),
            hero_title = COALESCE($2, hero_title),
            hero_text = COALESCE($3, hero_text),
            about_kicker = COALESCE($4, about_kicker),
            about_title = COALESCE($5, about_title),
            about_text = COALESCE($6, about_text),
            catalog_title = COALESCE($7, catalog_title),
            whatsapp = COALESCE($8, whatsapp),
            address = COALESCE($9, address),
            instagram = COALESCE($10, instagram),
            primary_color = COALESCE($11, primary_color),
            background_color = COALESCE($12, background_color),
            hero_interval_seconds = COALESCE($13, hero_interval_seconds),
            show_order_ticker = COALESCE($14, show_order_ticker),
            show_about = COALESCE($15, show_about),
            ticker_label = COALESCE($16, ticker_label),
            show_prices = COALESCE($17, show_prices),
            logo_media_id = COALESCE($18, logo_media_id),
            updated_at = NOW()
        WHERE id = 1
        "#
    )
    .bind(brand_name)
    .bind(hero_title)
    .bind(hero_text)
    .bind(about_kicker)
    .bind(about_title)
    .bind(about_text)
    .bind(catalog_title)
    .bind(whatsapp)
    .bind(address)
    .bind(instagram)
    .bind(primary_color)
    .bind(background_color)
    .bind(hero_interval_seconds)
    .bind(show_order_ticker)
    .bind(show_about)
    .bind(ticker_label)
    .bind(show_prices)
    .bind(logo_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let settings = get_public_website_settings(&state.pool).await?;
    Ok(Json(json!({ "settings": settings })))
}

pub async fn upload_header_media(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let mut uploaded_ids = Vec::new();
    while let Some(field) = multipart.next_field().await.map_err(|e| AppError::BadRequest(e.to_string()))? {
        let filename = field.file_name().unwrap_or("media.jpg").to_string();
        let mime = field.content_type().unwrap_or("image/jpeg").to_string();
        let ext = std::path::Path::new(&filename)
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| format!(".{}", s.to_lowercase()))
            .unwrap_or_default();

        let data = field.bytes().await.map_err(|e| AppError::BadRequest(e.to_string()))?;
        let stored_name = format!("{}{}", Uuid::new_v4(), ext);
        let _ = std::fs::write(state.upload_dir.join(&stored_name), &data);

        let id: i64 = sqlx::query_scalar(
            "INSERT INTO catalog_media (kind, filename, stored_name, mime, size, created_at) VALUES ('website-hero', $1, $2, $3, $4, NOW()) RETURNING id"
        )
        .bind(filename)
        .bind(stored_name)
        .bind(mime)
        .bind(data.len() as i64)
        .fetch_one(&state.pool)
        .await?;

        uploaded_ids.push(id);
    }

    let current_json: Value = sqlx::query_scalar("SELECT hero_media_ids FROM website_settings WHERE id = 1")
        .fetch_one(&state.pool)
        .await?;
    let mut current_ids: Vec<i64> = serde_json::from_value(current_json).unwrap_or_default();
    current_ids.extend(uploaded_ids);

    sqlx::query("UPDATE website_settings SET hero_media_ids = $1, updated_at = NOW() WHERE id = 1")
        .bind(json!(current_ids))
        .execute(&state.pool)
        .await?;

    let settings = get_public_website_settings(&state.pool).await?;
    Ok((StatusCode::CREATED, Json(json!({ "settings": settings }))))
}

pub async fn delete_header_media(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    let current_json: Value = sqlx::query_scalar("SELECT hero_media_ids FROM website_settings WHERE id = 1")
        .fetch_one(&state.pool)
        .await?;
    let mut current_ids: Vec<i64> = serde_json::from_value(current_json).unwrap_or_default();

    if !current_ids.contains(&id) {
        return Err(AppError::NotFound("Media header tidak ditemukan.".to_string()));
    }

    current_ids.retain(|&x| x != id);

    sqlx::query("UPDATE website_settings SET hero_media_ids = $1, updated_at = NOW() WHERE id = 1")
        .bind(json!(current_ids))
        .execute(&state.pool)
        .await?;

    sqlx::query("DELETE FROM catalog_media WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await?;

    let settings = get_public_website_settings(&state.pool).await?;
    Ok(Json(json!({ "settings": settings })))
}

pub async fn upload_nav_background(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let mut media_id = None;
    while let Some(field) = multipart.next_field().await.map_err(|e| AppError::BadRequest(e.to_string()))? {
        let filename = field.file_name().unwrap_or("nav.png").to_string();
        let mime = field.content_type().unwrap_or("image/png").to_string();
        let ext = std::path::Path::new(&filename).extension().and_then(|s| s.to_str()).map(|s| format!(".{}", s.to_lowercase())).unwrap_or_default();
        let data = field.bytes().await.map_err(|e| AppError::BadRequest(e.to_string()))?;
        let stored_name = format!("{}{}", Uuid::new_v4(), ext);
        let _ = std::fs::write(state.upload_dir.join(&stored_name), &data);

        let id: i64 = sqlx::query_scalar(
            "INSERT INTO catalog_media (kind, filename, stored_name, mime, size, created_at) VALUES ('website-nav-background', $1, $2, $3, $4, NOW()) RETURNING id"
        )
        .bind(filename)
        .bind(stored_name)
        .bind(mime)
        .bind(data.len() as i64)
        .fetch_one(&state.pool)
        .await?;
        media_id = Some(id);
    }

    sqlx::query("UPDATE website_settings SET nav_background_media_id = $1, updated_at = NOW() WHERE id = 1")
        .bind(media_id)
        .execute(&state.pool)
        .await?;

    let settings = get_public_website_settings(&state.pool).await?;
    Ok((StatusCode::CREATED, Json(json!({ "settings": settings }))))
}

pub async fn delete_nav_background(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    sqlx::query("UPDATE website_settings SET nav_background_media_id = NULL, updated_at = NOW() WHERE id = 1")
        .execute(&state.pool)
        .await?;
    let settings = get_public_website_settings(&state.pool).await?;
    Ok(Json(json!({ "settings": settings })))
}

pub async fn upload_hero_background(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let mut media_id = None;
    while let Some(field) = multipart.next_field().await.map_err(|e| AppError::BadRequest(e.to_string()))? {
        let filename = field.file_name().unwrap_or("hero.jpg").to_string();
        let mime = field.content_type().unwrap_or("image/jpeg").to_string();
        let ext = std::path::Path::new(&filename).extension().and_then(|s| s.to_str()).map(|s| format!(".{}", s.to_lowercase())).unwrap_or_default();
        let data = field.bytes().await.map_err(|e| AppError::BadRequest(e.to_string()))?;
        let stored_name = format!("{}{}", Uuid::new_v4(), ext);
        let _ = std::fs::write(state.upload_dir.join(&stored_name), &data);

        let id: i64 = sqlx::query_scalar(
            "INSERT INTO catalog_media (kind, filename, stored_name, mime, size, created_at) VALUES ('website-background', $1, $2, $3, $4, NOW()) RETURNING id"
        )
        .bind(filename)
        .bind(stored_name)
        .bind(mime)
        .bind(data.len() as i64)
        .fetch_one(&state.pool)
        .await?;
        media_id = Some(id);
    }

    sqlx::query("UPDATE website_settings SET background_media_id = $1, updated_at = NOW() WHERE id = 1")
        .bind(media_id)
        .execute(&state.pool)
        .await?;

    let settings = get_public_website_settings(&state.pool).await?;
    Ok((StatusCode::CREATED, Json(json!({ "settings": settings }))))
}

pub async fn delete_hero_background(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    sqlx::query("UPDATE website_settings SET background_media_id = NULL, updated_at = NOW() WHERE id = 1")
        .execute(&state.pool)
        .await?;
    let settings = get_public_website_settings(&state.pool).await?;
    Ok(Json(json!({ "settings": settings })))
}

pub async fn upload_about_background(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let mut media_id = None;
    while let Some(field) = multipart.next_field().await.map_err(|e| AppError::BadRequest(e.to_string()))? {
        let filename = field.file_name().unwrap_or("about.webp").to_string();
        let mime = field.content_type().unwrap_or("image/webp").to_string();
        let ext = std::path::Path::new(&filename).extension().and_then(|s| s.to_str()).map(|s| format!(".{}", s.to_lowercase())).unwrap_or_default();
        let data = field.bytes().await.map_err(|e| AppError::BadRequest(e.to_string()))?;
        let stored_name = format!("{}{}", Uuid::new_v4(), ext);
        let _ = std::fs::write(state.upload_dir.join(&stored_name), &data);

        let id: i64 = sqlx::query_scalar(
            "INSERT INTO catalog_media (kind, filename, stored_name, mime, size, created_at) VALUES ('website-about-background', $1, $2, $3, $4, NOW()) RETURNING id"
        )
        .bind(filename)
        .bind(stored_name)
        .bind(mime)
        .bind(data.len() as i64)
        .fetch_one(&state.pool)
        .await?;
        media_id = Some(id);
    }

    sqlx::query("UPDATE website_settings SET about_background_media_id = $1, updated_at = NOW() WHERE id = 1")
        .bind(media_id)
        .execute(&state.pool)
        .await?;

    let settings = get_public_website_settings(&state.pool).await?;
    Ok((StatusCode::CREATED, Json(json!({ "settings": settings }))))
}

pub async fn delete_about_background(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    sqlx::query("UPDATE website_settings SET about_background_media_id = NULL, updated_at = NOW() WHERE id = 1")
        .execute(&state.pool)
        .await?;
    let settings = get_public_website_settings(&state.pool).await?;
    Ok(Json(json!({ "settings": settings })))
}
