use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::FromRow;

use crate::error::AppError;
use crate::modules::jobs::{get_job_by_id, PRODUCTION_STAGES};
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct TrackingEntry {
    pub id: i64,
    pub stage: String,
    pub note: Option<String>,
    pub actor: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
pub struct AddTrackingPayload {
    pub stage: String,
    pub note: Option<String>,
    pub actor: Option<String>,
}

pub async fn send_tracking_history(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    let exists: Option<i64> = sqlx::query_scalar("SELECT id FROM jobs WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await?;
    if exists.is_none() {
        return Err(AppError::NotFound("SPK tidak ditemukan.".to_string()));
    }

    let history = sqlx::query_as::<_, TrackingEntry>(
        "SELECT id, stage, note, actor, created_at FROM tracking WHERE job_id = $1 ORDER BY id DESC"
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(json!({ "history": history })))
}

pub async fn add_tracking(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(payload): Json<AddTrackingPayload>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let stage = payload.stage.trim();
    if !PRODUCTION_STAGES.contains(&stage) {
        return Err(AppError::BadRequest(format!("Tahap tidak valid: {}.", stage)));
    }

    let job_row: Option<(String,)> = sqlx::query_as("SELECT status FROM jobs WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await?;
    let current_status = match job_row {
        Some((s,)) => s,
        None => return Err(AppError::NotFound("SPK tidak ditemukan.".to_string())),
    };

    let note = payload.note.unwrap_or_default();
    let actor = payload.actor.unwrap_or_else(|| "Admin Lokal".to_string());

    let mut tx = state.pool.begin().await?;

    sqlx::query(
        "INSERT INTO tracking (job_id, stage, note, actor, created_at) VALUES ($1, $2, $3, $4, NOW())"
    )
    .bind(id)
    .bind(stage)
    .bind(&note)
    .bind(&actor)
    .execute(&mut *tx)
    .await?;

    let new_status = if stage == "SELESAI" {
        "SELESAI"
    } else if current_status == "MENUNGGU" {
        "PROSES"
    } else {
        &current_status
    };

    sqlx::query("UPDATE jobs SET status = $1, updated_at = NOW() WHERE id = $2")
        .bind(new_status)
        .bind(id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    let public_job = get_job_by_id(&state.pool, id, false)
        .await?
        .ok_or_else(|| AppError::NotFound("SPK tidak ditemukan.".to_string()))?;

    Ok((StatusCode::CREATED, Json(json!({ "job": public_job }))))
}
