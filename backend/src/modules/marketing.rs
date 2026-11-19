use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use axum::{
    extract::{Multipart, Path, State},
    http::header,
    http::StatusCode,
    response::Response,
    Json,
};
use base64::engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL;
use base64::Engine;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::FromRow;
use uuid::Uuid;

use crate::error::AppError;
use crate::state::AppState;

pub fn get_encryption_key(secret: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(secret);
    hasher.update(b":impossible-marketing");
    hasher.finalize().into()
}

pub fn encrypt_config(config: &Value, secret: &[u8]) -> Result<String, AppError> {
    let key = get_encryption_key(secret);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| AppError::Internal(e.to_string()))?;

    let mut iv = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut iv);
    let nonce = Nonce::from_slice(&iv);

    let json_bytes = serde_json::to_vec(config).map_err(|e| AppError::Internal(e.to_string()))?;
    let encrypted = cipher.encrypt(nonce, json_bytes.as_ref()).map_err(|e| AppError::Internal(e.to_string()))?;

    // In aes_gcm, the ciphertext has the 16-byte tag appended at the end
    if encrypted.len() < 16 {
        return Err(AppError::Internal("Enkripsi gagal".to_string()));
    }
    let tag = &encrypted[encrypted.len() - 16..];
    let ciphertext = &encrypted[..encrypted.len() - 16];

    let iv_b64 = BASE64URL.encode(iv);
    let tag_b64 = BASE64URL.encode(tag);
    let cipher_b64 = BASE64URL.encode(ciphertext);

    Ok(format!("v1.{}.{}.{}", iv_b64, tag_b64, cipher_b64))
}

pub fn decrypt_config(value: &str, secret: &[u8]) -> Value {
    let parts: Vec<&str> = value.split('.').collect();
    if parts.len() != 4 || parts[0] != "v1" {
        return json!({});
    }

    let iv = match BASE64URL.decode(parts[1]) {
        Ok(v) if v.len() == 12 => v,
        _ => return json!({}),
    };
    let tag = match BASE64URL.decode(parts[2]) {
        Ok(v) if v.len() == 16 => v,
        _ => return json!({}),
    };
    let ciphertext = match BASE64URL.decode(parts[3]) {
        Ok(v) => v,
        _ => return json!({}),
    };

    let key = get_encryption_key(secret);
    let cipher = match Aes256Gcm::new_from_slice(&key) {
        Ok(c) => c,
        Err(_) => return json!({}),
    };

    let mut combined = ciphertext;
    combined.extend_from_slice(&tag);

    let nonce = Nonce::from_slice(&iv);
    match cipher.decrypt(nonce, combined.as_ref()) {
        Ok(dec) => serde_json::from_slice(&dec).unwrap_or(json!({})),
        Err(_) => json!({}),
    }
}

// Handlers
pub async fn send_marketing_summary(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let pool = &state.pool;

    let total_posts: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM marketing_posts").fetch_one(pool).await?;
    let published_posts: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM marketing_posts WHERE status = 'PUBLISHED'").fetch_one(pool).await?;
    let draft_posts: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM marketing_posts WHERE status = 'DRAFT'").fetch_one(pool).await?;
    let scheduled_posts: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM marketing_posts WHERE status = 'SCHEDULED'").fetch_one(pool).await?;

    #[derive(FromRow)]
    struct MetricsSum {
        views: Option<i64>,
        likes: Option<i64>,
        shares: Option<i64>,
        clicks: Option<i64>,
        whatsapp_clicks: Option<i64>,
        orders: Option<i64>,
        revenue: Option<i64>,
    }

    let m = sqlx::query_as::<_, MetricsSum>(
        "SELECT SUM(views) as views, SUM(likes) as likes, SUM(shares) as shares, SUM(clicks) as clicks, SUM(whatsapp_clicks) as whatsapp_clicks, SUM(orders) as orders, SUM(revenue) as revenue FROM marketing_metrics"
    )
    .fetch_one(pool)
    .await?;

    let approved_budget: Option<i64> = sqlx::query_scalar(
        "SELECT SUM(daily_budget) FROM marketing_ads WHERE approved_budget = TRUE"
    )
    .fetch_one(pool)
    .await?;

    #[derive(FromRow)]
    struct SettingsRow {
        daily_video_limit: i32,
        monthly_ai_budget_idr: i64,
        usd_idr: i64,
    }

    let s = sqlx::query_as::<_, SettingsRow>(
        "SELECT daily_video_limit, monthly_ai_budget_idr, usd_idr FROM marketing_settings WHERE id = 1"
    )
    .fetch_optional(pool)
    .await?
    .unwrap_or(SettingsRow {
        daily_video_limit: 3,
        monthly_ai_budget_idr: 700000,
        usd_idr: 18000,
    });

    Ok(Json(json!({
        "summary": {
            "posts": {
                "total": total_posts,
                "published": published_posts,
                "draft": draft_posts,
                "scheduled": scheduled_posts
            },
            "ai_video": {
                "daily_limit": s.daily_video_limit,
                "used_today": 0,
                "remaining_today": s.daily_video_limit,
                "monthly_budget": s.monthly_ai_budget_idr,
                "usd_idr": s.usd_idr
            },
            "performance": {
                "views": m.views.unwrap_or(0),
                "likes": m.likes.unwrap_or(0),
                "shares": m.shares.unwrap_or(0),
                "clicks": m.clicks.unwrap_or(0),
                "whatsapp_clicks": m.whatsapp_clicks.unwrap_or(0),
                "orders": m.orders.unwrap_or(0),
                "revenue": m.revenue.unwrap_or(0)
            },
            "ads": {
                "approved_budget": approved_budget.unwrap_or(0),
                "draft_count": 0,
                "active_count": 0
            }
        }
    })))
}

pub async fn send_marketing_products(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    #[derive(FromRow)]
    struct ProdRow {
        id: i64,
        name: String,
        category_name: String,
        price: i64,
    }

    let rows = sqlx::query_as::<_, ProdRow>(
        "SELECT id, name, category_name, price FROM catalog_products ORDER BY id ASC"
    )
    .fetch_all(&state.pool)
    .await?;

    let products: Vec<Value> = rows.into_iter().map(|r| json!({
        "id": r.id,
        "name": r.name,
        "category": r.category_name,
        "price": r.price
    })).collect();

    Ok(Json(json!({ "products": products })))
}

// Media
pub async fn upload_marketing_media(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let mut uploaded_media = Vec::new();
    while let Some(field) = multipart.next_field().await.map_err(|e| AppError::BadRequest(e.to_string()))? {
        let filename = field.file_name().unwrap_or("media.png").to_string();
        let mime = field.content_type().unwrap_or("image/png").to_string();
        let ext = std::path::Path::new(&filename).extension().and_then(|s| s.to_str()).map(|s| format!(".{}", s.to_lowercase())).unwrap_or_default();
        let data = field.bytes().await.map_err(|e| AppError::BadRequest(e.to_string()))?;
        let stored_name = format!("{}{}", Uuid::new_v4(), ext);
        let _ = std::fs::write(state.upload_dir.join(&stored_name), &data);

        let id: i64 = sqlx::query_scalar(
            "INSERT INTO marketing_media (filename, stored_name, mime, size, source, created_at) VALUES ($1, $2, $3, $4, 'UPLOAD', NOW()) RETURNING id"
        )
        .bind(&filename)
        .bind(&stored_name)
        .bind(&mime)
        .bind(data.len() as i64)
        .fetch_one(&state.pool)
        .await?;

        let media_type = if mime.starts_with("video/") { "video" } else { "image" };
        uploaded_media.push(json!({
            "id": id,
            "filename": filename,
            "mime": mime,
            "media_type": media_type,
            "size": data.len(),
            "url": format!("/api/admin/marketing/media/{}/file", id)
        }));
    }

    Ok((StatusCode::CREATED, Json(json!({ "media": uploaded_media }))))
}

pub async fn send_marketing_media_file(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Response, AppError> {
    #[derive(FromRow)]
    struct MediaRow {
        filename: String,
        stored_name: String,
        mime: String,
    }

    let m = sqlx::query_as::<_, MediaRow>(
        "SELECT filename, stored_name, mime FROM marketing_media WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Media tidak ditemukan.".to_string()))?;

    let path = state.upload_dir.join(&m.stored_name);
    if !path.exists() {
        return Err(AppError::NotFound("Media tidak tersedia.".to_string()));
    }

    let contents = std::fs::read(&path)?;
    let response = Response::builder()
        .header(header::CONTENT_TYPE, m.mime)
        .body(contents.into())
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(response)
}

pub async fn delete_marketing_media(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    sqlx::query("DELETE FROM marketing_media WHERE id = $1").bind(id).execute(&state.pool).await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Debug, Deserialize)]
pub struct GeneratePayload {
    pub product: Option<String>,
    pub audience: Option<String>,
    pub objective: Option<String>,
    pub content_type: Option<String>,
    pub offer: Option<String>,
}

pub async fn generate_marketing_content(
    State(_state): State<AppState>,
    Json(payload): Json<GeneratePayload>,
) -> Result<Json<Value>, AppError> {
    let product = payload.product.unwrap_or_else(|| "Apparel Custom".to_string());
    let title = format!("Konten Promo {}", product);
    let hook = format!("Mau buat {} dengan kualitas premium dan desain custom bebas?", product);
    let body = format!("IMPOSSIBLE APPAREL siap wujudkan {} impian tim kamu! Bahan adem, jahitan kuat, dan garansi hasil rapi.", product);
    let cta = "Hubungi admin kami sekarang via WhatsApp!".to_string();

    Ok(Json(json!({
        "draft": {
            "title": title,
            "product_key": product,
            "product_name": product,
            "content_type": payload.content_type.unwrap_or_else(|| "PRODUCT PROOF".to_string()),
            "objective": payload.objective.unwrap_or_else(|| "ORDER WHATSAPP".to_string()),
            "audience": payload.audience.unwrap_or_default(),
            "hook": hook,
            "body": body,
            "cta": cta,
            "caption_instagram": format!("{}\n\n{}\n\n{}", hook, body, cta),
            "caption_facebook": format!("{}\n\n{}", hook, body),
            "caption_tiktok": hook,
            "caption_x": hook,
            "hashtags": ["#impossibleapparel", "#customjersey", "#konveksi"],
            "platforms": ["INSTAGRAM", "WHATSAPP"],
            "storyboard": [
                { "scene": 1, "visual": "Detail jahitan dan bahan kain", "text": "Kualitas material juara" },
                { "scene": 2, "visual": "Hasil cetak warna cerah tajam", "text": "Warna tidak mudah pudar" }
            ],
            "veo_prompt": format!("Cinematic close-up showcase of {}, athletic sports apparel, 4k ultra realistic, studio lighting", product)
        }
    })))
}

#[derive(Debug, Clone, FromRow, Serialize)]
pub struct DbMarketingPost {
    pub id: i64,
    pub title: String,
    pub product_key: Option<String>,
    pub product_name: Option<String>,
    pub content_type: Option<String>,
    pub objective: Option<String>,
    pub audience: Option<String>,
    pub hook: String,
    pub body: String,
    pub cta: Option<String>,
    pub caption_instagram: Option<String>,
    pub caption_facebook: Option<String>,
    pub caption_tiktok: Option<String>,
    pub caption_x: Option<String>,
    pub hashtags: Value,
    pub platforms: Value,
    pub media_ids: Value,
    pub storyboard: Value,
    pub veo_prompt: Option<String>,
    pub status: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

pub async fn create_marketing_post(
    State(state): State<AppState>,
    Json(payload): Json<Value>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let title = payload["title"].as_str().unwrap_or("Post Baru");
    let hook = payload["hook"].as_str().unwrap_or("");
    let body = payload["body"].as_str().unwrap_or("");
    let status = payload["status"].as_str().unwrap_or("DRAFT");

    let post = sqlx::query_as::<_, DbMarketingPost>(
        r#"
        INSERT INTO marketing_posts (title, product_key, product_name, content_type, objective,
                                    audience, hook, body, cta, caption_instagram, caption_facebook,
                                    caption_tiktok, caption_x, hashtags, platforms, media_ids,
                                    storyboard, veo_prompt, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW())
        RETURNING *
        "#
    )
    .bind(title)
    .bind(payload["product_key"].as_str())
    .bind(payload["product_name"].as_str())
    .bind(payload["content_type"].as_str())
    .bind(payload["objective"].as_str())
    .bind(payload["audience"].as_str())
    .bind(hook)
    .bind(body)
    .bind(payload["cta"].as_str())
    .bind(payload["caption_instagram"].as_str())
    .bind(payload["caption_facebook"].as_str())
    .bind(payload["caption_tiktok"].as_str())
    .bind(payload["caption_x"].as_str())
    .bind(payload.get("hashtags").unwrap_or(&json!([])))
    .bind(payload.get("platforms").unwrap_or(&json!([])))
    .bind(payload.get("media_ids").unwrap_or(&json!([])))
    .bind(payload.get("storyboard").unwrap_or(&json!([])))
    .bind(payload["veo_prompt"].as_str())
    .bind(status)
    .fetch_one(&state.pool)
    .await?;

    Ok((StatusCode::CREATED, Json(json!({ "post": post }))))
}

pub async fn update_marketing_post_status(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let status = payload["status"].as_str().unwrap_or("REVIEW");
    let post = sqlx::query_as::<_, DbMarketingPost>(
        "UPDATE marketing_posts SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *"
    )
    .bind(status)
    .bind(id)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(json!({ "post": post })))
}

pub async fn publish_marketing_post(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let post = sqlx::query_as::<_, DbMarketingPost>(
        "UPDATE marketing_posts SET status = 'PUBLISHED', published_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *"
    )
    .bind(id)
    .fetch_one(&state.pool)
    .await?;

    sqlx::query(
        "INSERT INTO marketing_publish_log (post_id, title, platform, status, created_at) VALUES ($1, $2, $3, 'PUBLISHED_MANUAL', NOW())"
    )
    .bind(id)
    .bind(&post.title)
    .bind(payload["platform"].as_str().unwrap_or("INSTAGRAM"))
    .execute(&state.pool)
    .await?;

    Ok(Json(json!({ "post": post, "publish_log": [] })))
}

#[derive(Debug, Clone, FromRow, Serialize)]
pub struct DbMarketingAd {
    pub id: i64,
    pub platform: String,
    pub name: String,
    pub objective: String,
    pub daily_budget: i64,
    pub duration_days: i32,
    pub audience: Option<String>,
    pub creative_notes: Option<String>,
    pub status: String,
    pub approved_budget: bool,
    pub approved_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

pub async fn create_marketing_ad(
    State(state): State<AppState>,
    Json(payload): Json<Value>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let name = payload["name"].as_str().unwrap_or("Rencana Iklan");
    let budget = payload["daily_budget"].as_i64().unwrap_or(0);
    let platform = payload["platform"].as_str().unwrap_or("META");
    let objective = payload["objective"].as_str().unwrap_or("WHATSAPP");
    let duration = payload["duration_days"].as_i64().unwrap_or(7) as i32;

    let ad = sqlx::query_as::<_, DbMarketingAd>(
        r#"
        INSERT INTO marketing_ads (platform, name, objective, daily_budget, duration_days, audience, creative_notes, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT', NOW(), NOW())
        RETURNING *
        "#
    )
    .bind(platform)
    .bind(name)
    .bind(objective)
    .bind(budget)
    .bind(duration)
    .bind(payload["audience"].as_str())
    .bind(payload["creative_notes"].as_str())
    .fetch_one(&state.pool)
    .await?;

    Ok((StatusCode::CREATED, Json(json!({ "ad": ad }))))
}

pub async fn approve_marketing_ad(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    let ad = sqlx::query_as::<_, DbMarketingAd>(
        "UPDATE marketing_ads SET status = 'APPROVED', approved_budget = TRUE, approved_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *"
    )
    .bind(id)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(json!({ "ad": ad })))
}

pub async fn delete_marketing_ad(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    sqlx::query("DELETE FROM marketing_ads WHERE id = $1").bind(id).execute(&state.pool).await?;
    Ok(Json(json!({ "ok": true })))
}

pub async fn create_marketing_metric(
    State(state): State<AppState>,
    Json(payload): Json<Value>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let platform = payload["platform"].as_str().unwrap_or("META");
    let date = payload["date"].as_str().unwrap_or("2026-09-03");

    let id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO marketing_metrics (platform, metric_date, views, likes, shares, whatsapp_clicks, orders, revenue, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING id
        "#
    )
    .bind(platform)
    .bind(date)
    .bind(payload["views"].as_i64().unwrap_or(0))
    .bind(payload["likes"].as_i64().unwrap_or(0))
    .bind(payload["shares"].as_i64().unwrap_or(0))
    .bind(payload["whatsapp_clicks"].as_i64().unwrap_or(0))
    .bind(payload["orders"].as_i64().unwrap_or(0))
    .bind(payload["revenue"].as_i64().unwrap_or(0))
    .fetch_one(&state.pool)
    .await?;

    Ok((StatusCode::CREATED, Json(json!({ "metric": { "id": id } }))))
}

pub async fn delete_marketing_metric(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    sqlx::query("DELETE FROM marketing_metrics WHERE id = $1").bind(id).execute(&state.pool).await?;
    Ok(Json(json!({ "ok": true })))
}

pub async fn save_marketing_connection(
    State(state): State<AppState>,
    Path(platform): Path<String>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let encrypted = encrypt_config(&payload, &state.session_secret)?;

    sqlx::query(
        r#"
        INSERT INTO marketing_connections (platform, encrypted_config, status, last_test_message, updated_at)
        VALUES ($1, $2, 'CONFIGURED', 'Konfigurasi tersimpan dan terenkripsi.', NOW())
        ON CONFLICT (platform) DO UPDATE
        SET encrypted_config = EXCLUDED.encrypted_config, status = EXCLUDED.status, updated_at = NOW()
        "#
    )
    .bind(&platform)
    .bind(&encrypted)
    .execute(&state.pool)
    .await?;

    Ok(Json(json!({
        "connection": {
            "platform": platform,
            "configured": true,
            "status": "CONFIGURED",
            "last_test_message": "Konfigurasi tersimpan dan terenkripsi."
        }
    })))
}

pub async fn delete_marketing_connection(
    State(state): State<AppState>,
    Path(platform): Path<String>,
) -> Result<Json<Value>, AppError> {
    sqlx::query("DELETE FROM marketing_connections WHERE platform = $1").bind(&platform).execute(&state.pool).await?;
    Ok(Json(json!({
        "ok": true,
        "connection": {
            "platform": platform,
            "configured": false,
            "status": "NOT_CONFIGURED"
        }
    })))
}
