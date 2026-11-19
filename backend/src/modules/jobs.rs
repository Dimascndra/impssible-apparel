use axum::{
    extract::{Multipart, Path, State},
    http::header,
    http::StatusCode,
    response::Response,
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::error::AppError;
use crate::modules::master::{get_order_types_list, PublicOrderType};
use crate::state::AppState;

pub const PRODUCTION_STAGES: &[&str] = &[
    "DESAIN", "APPROVAL", "PRINTING", "PRESS", "JAHIT", "QC", "PACKING", "SELESAI",
];

pub const REFERENCE_EXTENSIONS: &[&str] = &[
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".pdf", ".cdr", ".ai", ".eps", ".svg",
    ".psd", ".zip", ".rar", ".doc", ".docx", ".xls", ".xlsx", ".txt",
];

#[derive(Debug, Clone, FromRow)]
pub struct DbJob {
    pub id: i64,
    pub spk: String,
    pub customer: String,
    pub instruction_type: String,
    pub order_type_id: Option<i64>,
    pub product: String,
    pub hpp_unit_snapshot: i64,
    pub selling_price_snapshot: i64,
    pub hpp_materials_snapshot: Value,
    pub qty: i32,
    pub deadline: Option<String>,
    pub priority: String,
    pub status: String,
    pub note: Option<String>,
    pub designer: String,
    pub computer: String,
    pub customer_code: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AttachmentPublic {
    pub id: i64,
    pub kind: String,
    pub filename: String,
    pub mime: String,
    pub size: i64,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, FromRow)]
pub struct TrackingLatest {
    pub stage: String,
    pub note: Option<String>,
    pub actor: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn build_public_job(
    job: &DbJob,
    pool: &PgPool,
    order_types: &[PublicOrderType],
    is_design_role: bool,
) -> Result<Value, AppError> {
    let attachments = sqlx::query_as::<_, AttachmentPublic>(
        "SELECT id, kind, filename, mime, size, created_at FROM attachments WHERE job_id = $1 ORDER BY id DESC"
    )
    .bind(job.id)
    .fetch_all(pool)
    .await?;

    let latest_tracking = sqlx::query_as::<_, TrackingLatest>(
        "SELECT stage, note, actor, created_at FROM tracking WHERE job_id = $1 ORDER BY id DESC LIMIT 1"
    )
    .bind(job.id)
    .fetch_optional(pool)
    .await?;

    let production = if let Some(trk) = latest_tracking {
        let stage_idx = PRODUCTION_STAGES.iter().position(|&s| s == trk.stage).unwrap_or(0);
        let progress = (((stage_idx + 1) as f64 / PRODUCTION_STAGES.len() as f64) * 100.0).round() as i32;
        json!({
            "stage": trk.stage,
            "note": trk.note.unwrap_or_default(),
            "updated_at": trk.created_at,
            "actor": trk.actor,
            "progress": progress
        })
    } else {
        json!({
            "stage": "BELUM DIMULAI",
            "note": "",
            "updated_at": Value::Null,
            "actor": "",
            "progress": 0
        })
    };

    if is_design_role {
        return Ok(json!({
            "id": job.id,
            "spk": job.spk,
            "customer": job.customer,
            "instruction_type": job.instruction_type,
            "order_type_id": job.order_type_id,
            "product": job.product,
            "qty": job.qty,
            "deadline": job.deadline,
            "priority": job.priority,
            "status": job.status,
            "note": job.note.clone().unwrap_or_default(),
            "designer": job.designer,
            "computer": job.computer,
            "created_at": job.created_at,
            "updated_at": job.updated_at,
            "attachments": attachments,
            "production": production
        }));
    }

    let ot = job.order_type_id
        .and_then(|ot_id| order_types.iter().find(|o| o.id == ot_id))
        .or_else(|| {
            let p_norm = job.product.trim().to_lowercase();
            order_types.iter().find(|o| o.name.trim().to_lowercase() == p_norm)
        });

    let hpp_unit = if job.hpp_unit_snapshot > 0 {
        job.hpp_unit_snapshot
    } else {
        ot.map(|o| o.total_hpp).unwrap_or(0)
    };

    let selling_price = if job.selling_price_snapshot > 0 {
        job.selling_price_snapshot
    } else {
        ot.map(|o| o.selling_price).unwrap_or(0)
    };

    let qty = job.qty.max(1) as i64;
    let total_hpp = hpp_unit * qty;
    let projected_revenue = selling_price * qty;
    let projected_profit = projected_revenue - total_hpp;

    let costing = json!({
        "order_type_id": job.order_type_id.or_else(|| ot.map(|o| o.id)),
        "hpp_unit": hpp_unit,
        "selling_price": selling_price,
        "total_hpp": total_hpp,
        "projected_revenue": projected_revenue,
        "projected_profit": projected_profit
    });

    Ok(json!({
        "id": job.id,
        "spk": job.spk,
        "customer": job.customer,
        "instruction_type": job.instruction_type,
        "order_type_id": job.order_type_id,
        "product": job.product,
        "hpp_unit_snapshot": job.hpp_unit_snapshot,
        "selling_price_snapshot": job.selling_price_snapshot,
        "hpp_materials_snapshot": job.hpp_materials_snapshot,
        "qty": job.qty,
        "deadline": job.deadline,
        "priority": job.priority,
        "status": job.status,
        "note": job.note.clone().unwrap_or_default(),
        "designer": job.designer,
        "computer": job.computer,
        "customer_code": job.customer_code,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
        "attachments": attachments,
        "production": production,
        "costing": costing
    }))
}

pub async fn list_all_jobs(pool: &PgPool, is_design_role: bool) -> Result<Vec<Value>, AppError> {
    let order_types = get_order_types_list(pool).await?;
    let jobs = sqlx::query_as::<_, DbJob>(
        r#"
        SELECT id, spk, customer, instruction_type, order_type_id, product,
               hpp_unit_snapshot, selling_price_snapshot, hpp_materials_snapshot,
               qty, deadline, priority, status, note, designer, computer, customer_code,
               created_at, updated_at
        FROM jobs
        ORDER BY CASE WHEN priority = 'URGENT' THEN 0 ELSE 1 END, updated_at DESC
        "#
    )
    .fetch_all(pool)
    .await?;

    let mut result = Vec::new();
    for job in &jobs {
        result.push(build_public_job(job, pool, &order_types, is_design_role).await?);
    }
    Ok(result)
}

pub async fn get_job_by_id(pool: &PgPool, id: i64, is_design_role: bool) -> Result<Option<Value>, AppError> {
    let order_types = get_order_types_list(pool).await?;
    let job = sqlx::query_as::<_, DbJob>(
        r#"
        SELECT id, spk, customer, instruction_type, order_type_id, product,
               hpp_unit_snapshot, selling_price_snapshot, hpp_materials_snapshot,
               qty, deadline, priority, status, note, designer, computer, customer_code,
               created_at, updated_at
        FROM jobs
        WHERE id = $1
        "#
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    if let Some(j) = job {
        Ok(Some(build_public_job(&j, pool, &order_types, is_design_role).await?))
    } else {
        Ok(None)
    }
}

// Handlers
pub async fn send_jobs(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let jobs = list_all_jobs(&state.pool, false).await?;
    Ok(Json(json!({ "jobs": jobs })))
}

pub async fn send_design_jobs(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let jobs = list_all_jobs(&state.pool, true).await?;
    Ok(Json(json!({ "jobs": jobs })))
}

pub async fn create_job(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let mut spk = String::new();
    let mut customer = String::new();
    let mut instruction_type = "INSTRUKSI BIASA".to_string();
    let mut order_type_id: Option<i64> = None;
    let mut product = String::new();
    let mut qty = 1i32;
    let mut deadline: Option<String> = None;
    let mut priority = "NORMAL".to_string();
    let mut note = String::new();
    let mut uploaded_files: Vec<(String, String, String, i64)> = Vec::new(); // filename, stored_name, mime, size

    while let Some(field) = multipart.next_field().await.map_err(|e| AppError::BadRequest(e.to_string()))? {
        let name = field.name().unwrap_or_default().to_string();
        if name == "files" {
            let filename = field.file_name().unwrap_or("file.dat").to_string();
            let mime = field.content_type().unwrap_or("application/octet-stream").to_string();
            let ext = std::path::Path::new(&filename)
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| format!(".{}", s.to_lowercase()))
                .unwrap_or_default();

            if REFERENCE_EXTENSIONS.contains(&ext.as_str()) {
                let data = field.bytes().await.map_err(|e| AppError::BadRequest(e.to_string()))?;
                let size = data.len() as i64;
                let stored_name = format!("{}{}", Uuid::new_v4(), ext);
                let dest_path = state.upload_dir.join(&stored_name);
                let _ = std::fs::create_dir_all(&state.upload_dir);
                let _ = std::fs::write(&dest_path, &data);
                uploaded_files.push((filename, stored_name, mime, size));
            }
        } else {
            let text = field.text().await.unwrap_or_default();
            match name.as_str() {
                "spk" => spk = text,
                "customer" => customer = text,
                "instruction_type" => instruction_type = text,
                "order_type_id" => order_type_id = text.parse().ok(),
                "product" => product = text,
                "qty" => qty = text.parse().unwrap_or(1),
                "deadline" => deadline = if text.trim().is_empty() { None } else { Some(text) },
                "priority" => priority = if text == "URGENT" { "URGENT".to_string() } else { "NORMAL".to_string() },
                "note" => note = text,
                _ => {}
            }
        }
    }

    if spk.trim().is_empty() {
        spk = format!("SPK-{}-{}", Utc::now().format("%Y%m%d"), rand::random::<u16>());
    }

    let customer_code = format!("{:08X}", rand::random::<u32>());

    let order_types = get_order_types_list(&state.pool).await?;
    let ot = order_type_id.and_then(|id| order_types.iter().find(|o| o.id == id));

    if let Some(ot_data) = ot {
        if product.trim().is_empty() {
            product = ot_data.name.clone();
        }
    }

    let (hpp_unit_snapshot, selling_price_snapshot, hpp_materials_snapshot) = if let Some(ot_data) = ot {
        (ot_data.total_hpp, ot_data.selling_price, json!(ot_data.materials))
    } else {
        (0, 0, json!([]))
    };

    let mut tx = state.pool.begin().await?;

    let job_id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO jobs (spk, customer, instruction_type, order_type_id, product,
                          hpp_unit_snapshot, selling_price_snapshot, hpp_materials_snapshot,
                          qty, deadline, priority, status, note, customer_code,
                          created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'MENUNGGU', $12, $13, NOW(), NOW())
        RETURNING id
        "#
    )
    .bind(spk)
    .bind(customer)
    .bind(instruction_type)
    .bind(order_type_id)
    .bind(product)
    .bind(hpp_unit_snapshot)
    .bind(selling_price_snapshot)
    .bind(hpp_materials_snapshot)
    .bind(qty)
    .bind(deadline)
    .bind(priority)
    .bind(note)
    .bind(customer_code)
    .fetch_one(&mut *tx)
    .await?;

    for (fname, sname, mime, sz) in uploaded_files {
        sqlx::query(
            "INSERT INTO attachments (job_id, kind, filename, stored_name, mime, size, created_at) VALUES ($1, 'reference', $2, $3, $4, $5, NOW())"
        )
        .bind(job_id)
        .bind(fname)
        .bind(sname)
        .bind(mime)
        .bind(sz)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    let public_job = get_job_by_id(&state.pool, job_id, false)
        .await?
        .ok_or_else(|| AppError::Internal("Gagal memuat job yang baru dibuat.".to_string()))?;

    Ok((StatusCode::CREATED, Json(json!({ "job": public_job }))))
}

#[derive(Debug, Deserialize)]
pub struct UpdateJobPayload {
    pub spk: Option<String>,
    pub customer: Option<String>,
    pub qty: Option<i32>,
    pub deadline: Option<String>,
    pub priority: Option<String>,
    pub status: Option<String>,
    pub note: Option<String>,
    pub designer: Option<String>,
    pub computer: Option<String>,
}

pub async fn update_job(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(payload): Json<UpdateJobPayload>,
) -> Result<Json<Value>, AppError> {
    let updated: Option<i64> = sqlx::query_scalar(
        r#"
        UPDATE jobs
        SET spk = COALESCE($2, spk),
            customer = COALESCE($3, customer),
            qty = COALESCE($4, qty),
            deadline = COALESCE($5, deadline),
            priority = COALESCE($6, priority),
            status = COALESCE($7, status),
            note = COALESCE($8, note),
            designer = COALESCE($9, designer),
            computer = COALESCE($10, computer),
            updated_at = NOW()
        WHERE id = $1
        RETURNING id
        "#
    )
    .bind(id)
    .bind(payload.spk)
    .bind(payload.customer)
    .bind(payload.qty)
    .bind(payload.deadline)
    .bind(payload.priority)
    .bind(payload.status)
    .bind(payload.note)
    .bind(payload.designer)
    .bind(payload.computer)
    .fetch_optional(&state.pool)
    .await?;

    if updated.is_none() {
        return Err(AppError::NotFound("SPK tidak ditemukan.".to_string()));
    }

    let public_job = get_job_by_id(&state.pool, id, false)
        .await?
        .ok_or_else(|| AppError::NotFound("SPK tidak ditemukan.".to_string()))?;

    Ok(Json(json!({ "job": public_job })))
}

#[derive(Debug, Serialize, FromRow)]
pub struct MessagePublic {
    pub id: i64,
    pub sender: String,
    pub body: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn send_messages(
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

    let messages = sqlx::query_as::<_, MessagePublic>(
        "SELECT id, sender, body, created_at FROM messages WHERE job_id = $1 ORDER BY id ASC"
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(json!({ "messages": messages })))
}

#[derive(Debug, Deserialize)]
pub struct PostMessagePayload {
    pub body: String,
    pub sender: Option<String>,
}

pub async fn post_message(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    default_sender: &'static str,
    Json(payload): Json<PostMessagePayload>,
) -> Result<Json<Value>, AppError> {
    let body = payload.body.trim();
    if body.is_empty() {
        return Err(AppError::BadRequest("Pesan tidak boleh kosong.".to_string()));
    }

    let sender = payload.sender.unwrap_or_else(|| default_sender.to_string());

    let msg = sqlx::query_as::<_, MessagePublic>(
        r#"
        INSERT INTO messages (job_id, sender, body, created_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING id, sender, body, created_at
        "#
    )
    .bind(id)
    .bind(sender)
    .bind(body)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(json!({ "message": msg })))
}

pub async fn upload_job_files(
    State(state): State<AppState>,
    Path((id, kind)): Path<(i64, String)>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let job_exists: Option<i64> = sqlx::query_scalar("SELECT id FROM jobs WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await?;
    if job_exists.is_none() {
        return Err(AppError::NotFound("SPK tidak ditemukan.".to_string()));
    }

    let mut accepted_count = 0;
    while let Some(field) = multipart.next_field().await.map_err(|e| AppError::BadRequest(e.to_string()))? {
        let filename = field.file_name().unwrap_or("file.dat").to_string();
        let mime = field.content_type().unwrap_or("application/octet-stream").to_string();
        let ext = std::path::Path::new(&filename)
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| format!(".{}", s.to_lowercase()))
            .unwrap_or_default();

        let okay = match kind.as_str() {
            "cdr" => ext == ".cdr",
            "preview" => mime.starts_with("image/") || mime == "application/pdf",
            _ => REFERENCE_EXTENSIONS.contains(&ext.as_str()),
        };

        if !okay {
            continue;
        }

        let data = field.bytes().await.map_err(|e| AppError::BadRequest(e.to_string()))?;
        let size = data.len() as i64;
        let stored_name = format!("{}{}", Uuid::new_v4(), ext);
        let dest_path = state.upload_dir.join(&stored_name);
        let _ = std::fs::create_dir_all(&state.upload_dir);
        let _ = std::fs::write(&dest_path, &data);

        sqlx::query(
            "INSERT INTO attachments (job_id, kind, filename, stored_name, mime, size, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())"
        )
        .bind(id)
        .bind(&kind)
        .bind(&filename)
        .bind(&stored_name)
        .bind(&mime)
        .bind(size)
        .execute(&state.pool)
        .await?;

        accepted_count += 1;
    }

    if accepted_count == 0 {
        let err_msg = match kind.as_str() {
            "cdr" => "File harus berformat .CDR.",
            "preview" => "Preview harus berupa gambar atau PDF.",
            _ => "Format lampiran tidak didukung.",
        };
        return Err(AppError::BadRequest(err_msg.to_string()));
    }

    sqlx::query("UPDATE jobs SET updated_at = NOW() WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await?;

    let public_job = get_job_by_id(&state.pool, id, false)
        .await?
        .ok_or_else(|| AppError::NotFound("SPK tidak ditemukan.".to_string()))?;

    Ok((StatusCode::CREATED, Json(json!({ "job": public_job }))))
}

pub async fn send_file(
    State(state): State<AppState>,
    Path(file_id): Path<i64>,
) -> Result<Response, AppError> {
    #[derive(FromRow)]
    struct AttachmentRow {
        filename: String,
        stored_name: String,
        mime: String,
    }

    let att = sqlx::query_as::<_, AttachmentRow>(
        "SELECT filename, stored_name, mime FROM attachments WHERE id = $1"
    )
    .bind(file_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("File tidak ditemukan.".to_string()))?;

    let file_path = state.upload_dir.join(&att.stored_name);
    if !file_path.exists() {
        return Err(AppError::NotFound("File tidak tersedia.".to_string()));
    }

    let contents = std::fs::read(&file_path)?;
    let disposition = format!("attachment; filename=\"{}\"", att.filename);

    let response = Response::builder()
        .header(header::CONTENT_TYPE, att.mime)
        .header(header::CONTENT_DISPOSITION, disposition)
        .body(contents.into())
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(response)
}

pub async fn regenerate_customer_code(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    let new_code = format!("{:08X}", rand::random::<u32>());

    let updated = sqlx::query(
        "UPDATE jobs SET customer_code = $1, updated_at = NOW() WHERE id = $2"
    )
    .bind(&new_code)
    .bind(id)
    .execute(&state.pool)
    .await?;

    if updated.rows_affected() == 0 {
        return Err(AppError::NotFound("SPK tidak ditemukan.".to_string()));
    }

    let public_job = get_job_by_id(&state.pool, id, false)
        .await?
        .ok_or_else(|| AppError::NotFound("SPK tidak ditemukan.".to_string()))?;

    Ok(Json(json!({ "customer_code": new_code, "job": public_job })))
}
