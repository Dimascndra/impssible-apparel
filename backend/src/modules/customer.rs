use std::time::Duration;
use axum::{
    extract::State,
    http::{header, HeaderMap},
    response::Response,
    Json,
};
use axum_extra::extract::CookieJar;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool};

use crate::auth::{get_client_ip, make_customer_token, read_customer_token, CustomerSession};
use crate::error::AppError;
use crate::modules::finance::list_all_invoices;
use crate::modules::jobs::{build_public_job, DbJob, PRODUCTION_STAGES};
use crate::modules::master::get_order_types_list;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct CustomerLoginPayload {
    pub spk: String,
    pub code: String,
}

pub async fn customer_login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CustomerLoginPayload>,
) -> Result<Response, AppError> {
    let spk_clean = payload.spk.trim().to_lowercase();
    let code_clean = payload.code.trim().replace(' ', "").to_uppercase();

    // Proteksi brute force rate limiting: max 10 percobaan per 60 detik per IP + SPK
    let client_ip = get_client_ip(&headers);
    let rate_key = format!("{}:{}", client_ip, spk_clean);
    state.rate_limiter.check(&rate_key, "customer_login", 10, Duration::from_secs(60)).await?;

    let job = sqlx::query_as::<_, DbJob>(
        "SELECT * FROM jobs WHERE LOWER(spk) = $1"
    )
    .bind(&spk_clean)
    .fetch_optional(&state.pool)
    .await?;

    let job = match job {
        Some(j) if j.customer_code.trim().to_uppercase() == code_clean => j,
        _ => return Err(AppError::Unauthorized("Nomor SPK atau kode akses salah.".to_string())),
    };

    let token = make_customer_token(job.id, &job.customer_code, &state.session_secret);
    let cookie_val = format!(
        "impossible_customer={}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800",
        urlencoding::encode(&token)
    );

    let body = Json(json!({ "ok": true, "spk": job.spk }));
    let response = Response::builder()
        .header(header::SET_COOKIE, cookie_val)
        .header(header::CONTENT_TYPE, "application/json")
        .body(serde_json::to_string(&body.0).unwrap().into())
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(response)
}

pub async fn customer_logout() -> Result<Response, AppError> {
    let cookie_val = "impossible_customer=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
    let body = json!({ "ok": true });
    let response = Response::builder()
        .header(header::SET_COOKIE, cookie_val)
        .header(header::CONTENT_TYPE, "application/json")
        .body(serde_json::to_string(&body).unwrap().into())
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(response)
}

pub async fn verify_customer_session(
    jar: &CookieJar,
    pool: &PgPool,
    secret: &[u8],
) -> Result<(CustomerSession, DbJob), AppError> {
    let cookie = jar.get("impossible_customer")
        .ok_or_else(|| AppError::Unauthorized("Sesi customer tidak ditemukan.".to_string()))?;

    let raw_val = urlencoding::decode(cookie.value()).map_err(|_| AppError::Unauthorized("Format cookie invalid.".to_string()))?;
    let session = read_customer_token(&raw_val, secret)
        .ok_or_else(|| AppError::Unauthorized("Sesi customer telah berakhir.".to_string()))?;

    let job = sqlx::query_as::<_, DbJob>("SELECT * FROM jobs WHERE id = $1")
        .bind(session.job_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::Unauthorized("SPK tidak ditemukan.".to_string()))?;

    let mut hasher = Sha256::new();
    hasher.update(job.customer_code.as_bytes());
    let current_hash = hex::encode(hasher.finalize());
    if session.code_hash != current_hash[..16] {
        return Err(AppError::Unauthorized("Kode akses telah diperbarui, silakan login kembali.".to_string()));
    }

    Ok((session, job))
}

pub async fn customer_summary(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<Json<Value>, AppError> {
    let (_session, job) = verify_customer_session(&jar, &state.pool, &state.session_secret).await?;

    let order_types = get_order_types_list(&state.pool).await?;
    let public_job_val = build_public_job(&job, &state.pool, &order_types, false).await?;

    #[derive(FromRow)]
    struct TrkRow {
        id: i64,
        stage: String,
        note: Option<String>,
        created_at: chrono::DateTime<chrono::Utc>,
    }

    let history = sqlx::query_as::<_, TrkRow>(
        "SELECT id, stage, note, created_at FROM tracking WHERE job_id = $1 ORDER BY id DESC"
    )
    .bind(job.id)
    .fetch_all(&state.pool)
    .await?;

    let history_json: Vec<Value> = history.into_iter().map(|h| json!({
        "id": h.id,
        "stage": h.stage,
        "note": h.note.unwrap_or_default(),
        "created_at": h.created_at
    })).collect();

    let all_invoices = list_all_invoices(&state.pool).await?;
    let customer_invoices: Vec<Value> = all_invoices
        .into_iter()
        .filter(|inv| inv.job_id == Some(job.id))
        .map(|inv| json!({
            "id": inv.id,
            "invoice_no": inv.invoice_no,
            "customer": inv.customer,
            "address": inv.address,
            "invoice_date": inv.invoice_date,
            "due_date": inv.due_date,
            "items": inv.items,
            "subtotal": inv.subtotal,
            "discount": inv.discount,
            "shipping": inv.shipping,
            "total": inv.total,
            "paid": inv.paid,
            "balance": inv.balance,
            "payment_status": inv.payment_status,
            "payments": inv.payments,
            "notes": inv.notes,
            "pdf_url": format!("/api/public/customer/invoices/{}/pdf", inv.id)
        }))
        .collect();

    Ok(Json(json!({
        "job": {
            "id": job.id,
            "spk": job.spk,
            "customer": job.customer,
            "product": job.product,
            "qty": job.qty,
            "deadline": job.deadline,
            "status": job.status,
            "production": public_job_val["production"],
            "created_at": job.created_at,
            "updated_at": job.updated_at
        },
        "history": history_json,
        "invoices": customer_invoices,
        "stages": PRODUCTION_STAGES
    })))
}
