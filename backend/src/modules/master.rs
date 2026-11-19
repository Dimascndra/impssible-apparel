use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{FromRow, PgPool};
use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct RawMaterial {
    pub id: i64,
    pub name: String,
    pub unit: String,
    pub unit_price: i64,
    pub note: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
pub struct RawMaterialPayload {
    pub name: String,
    pub unit: Option<String>,
    pub unit_price: Option<i64>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderTypeMaterialDetail {
    pub raw_material_id: i64,
    pub name: String,
    pub qty: f64,
    pub unit: String,
    pub unit_price: i64,
    pub subtotal: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicOrderType {
    pub id: i64,
    pub name: String,
    pub output_unit: String,
    pub selling_price: i64,
    pub note: String,
    pub materials: Vec<OrderTypeMaterialDetail>,
    pub total_hpp: i64,
    pub profit_per_unit: i64,
    pub margin_percent: f64,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
pub struct MaterialInput {
    pub raw_material_id: i64,
    pub qty: f64,
}

#[derive(Debug, Deserialize)]
pub struct OrderTypePayload {
    pub name: String,
    pub output_unit: Option<String>,
    pub selling_price: Option<i64>,
    pub note: Option<String>,
    pub materials: Option<Vec<MaterialInput>>,
}

pub async fn list_raw_materials(pool: &PgPool) -> Result<Vec<RawMaterial>, AppError> {
    let rows = sqlx::query_as::<_, RawMaterial>(
        "SELECT id, name, unit, unit_price, note, created_at, updated_at FROM raw_materials ORDER BY id ASC"
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn get_order_types_list(pool: &PgPool) -> Result<Vec<PublicOrderType>, AppError> {
    #[derive(FromRow)]
    struct OrderTypeRow {
        id: i64,
        name: String,
        output_unit: String,
        selling_price: i64,
        note: Option<String>,
        created_at: chrono::DateTime<chrono::Utc>,
        updated_at: chrono::DateTime<chrono::Utc>,
    }

    #[derive(FromRow)]
    struct OtMatRow {
        order_type_id: i64,
        raw_material_id: i64,
        name: String,
        unit: String,
        unit_price: i64,
        qty: bigdecimal::BigDecimal,
    }

    let ot_rows = sqlx::query_as::<_, OrderTypeRow>(
        "SELECT id, name, output_unit, selling_price, note, created_at, updated_at FROM order_types ORDER BY name ASC"
    )
    .fetch_all(pool)
    .await?;

    let mat_rows = sqlx::query_as::<_, OtMatRow>(
        r#"
        SELECT otm.order_type_id, otm.raw_material_id, rm.name, rm.unit, rm.unit_price, otm.qty
        FROM order_type_materials otm
        JOIN raw_materials rm ON rm.id = otm.raw_material_id
        ORDER BY otm.id ASC
        "#
    )
    .fetch_all(pool)
    .await?;

    let mut result = Vec::new();
    for ot in ot_rows {
        let mut materials = Vec::new();
        let mut total_hpp = 0i64;

        for m in mat_rows.iter().filter(|r| r.order_type_id == ot.id) {
            use bigdecimal::ToPrimitive;
            let qty_f64 = m.qty.to_f64().unwrap_or(1.0);
            let subtotal = (qty_f64 * m.unit_price as f64).round() as i64;
            total_hpp += subtotal;

            materials.push(OrderTypeMaterialDetail {
                raw_material_id: m.raw_material_id,
                name: m.name.clone(),
                qty: qty_f64,
                unit: m.unit.clone(),
                unit_price: m.unit_price,
                subtotal,
            });
        }

        let selling_price = ot.selling_price;
        let profit_per_unit = selling_price - total_hpp;
        let margin_percent = if selling_price > 0 {
            ((profit_per_unit as f64 / selling_price as f64) * 1000.0).round() / 10.0
        } else {
            0.0
        };

        result.push(PublicOrderType {
            id: ot.id,
            name: ot.name,
            output_unit: ot.output_unit,
            selling_price,
            note: ot.note.unwrap_or_default(),
            materials,
            total_hpp,
            profit_per_unit,
            margin_percent,
            created_at: ot.created_at,
            updated_at: ot.updated_at,
        });
    }

    Ok(result)
}

// Handlers
pub async fn send_raw_materials(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let rows = list_raw_materials(&state.pool).await?;
    Ok(Json(json!({ "raw_materials": rows })))
}

pub async fn create_raw_material(
    State(state): State<AppState>,
    Json(payload): Json<RawMaterialPayload>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let name = payload.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("Nama bahan baku wajib diisi.".to_string()));
    }
    let unit = payload.unit.unwrap_or_else(|| "pcs".to_string());
    let unit_price = payload.unit_price.unwrap_or(0);
    let note = payload.note.unwrap_or_default();

    let exists: Option<i64> = sqlx::query_scalar("SELECT id FROM raw_materials WHERE LOWER(name) = LOWER($1)")
        .bind(name)
        .fetch_optional(&state.pool)
        .await?;
    if exists.is_some() {
        return Err(AppError::Conflict("Nama bahan baku sudah digunakan.".to_string()));
    }

    let row = sqlx::query_as::<_, RawMaterial>(
        r#"
        INSERT INTO raw_materials (name, unit, unit_price, note, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        RETURNING id, name, unit, unit_price, note, created_at, updated_at
        "#
    )
    .bind(name)
    .bind(&unit)
    .bind(unit_price)
    .bind(&note)
    .fetch_one(&state.pool)
    .await?;

    Ok((StatusCode::CREATED, Json(json!({ "raw_material": row }))))
}

pub async fn update_raw_material(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(payload): Json<RawMaterialPayload>,
) -> Result<Json<Value>, AppError> {
    let name = payload.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("Nama bahan baku wajib diisi.".to_string()));
    }

    let exists: Option<i64> = sqlx::query_scalar("SELECT id FROM raw_materials WHERE LOWER(name) = LOWER($1) AND id != $2")
        .bind(name)
        .bind(id)
        .fetch_optional(&state.pool)
        .await?;
    if exists.is_some() {
        return Err(AppError::Conflict("Nama bahan baku sudah digunakan.".to_string()));
    }

    let unit = payload.unit.unwrap_or_else(|| "pcs".to_string());
    let unit_price = payload.unit_price.unwrap_or(0);
    let note = payload.note.unwrap_or_default();

    let row = sqlx::query_as::<_, RawMaterial>(
        r#"
        UPDATE raw_materials
        SET name = $1, unit = $2, unit_price = $3, note = $4, updated_at = NOW()
        WHERE id = $5
        RETURNING id, name, unit, unit_price, note, created_at, updated_at
        "#
    )
    .bind(name)
    .bind(&unit)
    .bind(unit_price)
    .bind(&note)
    .bind(id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Bahan baku tidak ditemukan.".to_string()))?;

    Ok(Json(json!({ "raw_material": row })))
}

pub async fn delete_raw_material(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    let used_by: Option<String> = sqlx::query_scalar(
        r#"
        SELECT ot.name
        FROM order_type_materials otm
        JOIN order_types ot ON ot.id = otm.order_type_id
        WHERE otm.raw_material_id = $1
        LIMIT 1
        "#
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;

    if let Some(ot_name) = used_by {
        return Err(AppError::Conflict(format!("Bahan masih digunakan oleh jenis order {}.", ot_name)));
    }

    let result = sqlx::query("DELETE FROM raw_materials WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Bahan baku tidak ditemukan.".to_string()));
    }

    Ok(Json(json!({ "ok": true, "deleted_id": id })))
}

pub async fn send_order_types(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let order_types = get_order_types_list(&state.pool).await?;
    Ok(Json(json!({ "order_types": order_types })))
}

pub async fn create_order_type(
    State(state): State<AppState>,
    Json(payload): Json<OrderTypePayload>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let name = payload.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("Nama jenis order wajib diisi.".to_string()));
    }

    let exists: Option<i64> = sqlx::query_scalar("SELECT id FROM order_types WHERE LOWER(name) = LOWER($1)")
        .bind(name)
        .fetch_optional(&state.pool)
        .await?;
    if exists.is_some() {
        return Err(AppError::Conflict("Nama jenis order sudah digunakan.".to_string()));
    }

    let materials = payload.materials.unwrap_or_default();
    if materials.is_empty() {
        return Err(AppError::BadRequest("Minimal satu bahan baku wajib diisi.".to_string()));
    }

    let output_unit = payload.output_unit.unwrap_or_else(|| "pcs".to_string());
    let selling_price = payload.selling_price.unwrap_or(0);
    let note = payload.note.unwrap_or_default();

    let mut tx = state.pool.begin().await?;

    let ot_id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO order_types (name, output_unit, selling_price, note, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        RETURNING id
        "#
    )
    .bind(name)
    .bind(&output_unit)
    .bind(selling_price)
    .bind(&note)
    .fetch_one(&mut *tx)
    .await?;

    for mat in &materials {
        use std::str::FromStr;
        let qty_dec = bigdecimal::BigDecimal::from_str(&mat.qty.to_string()).unwrap_or_default();
        sqlx::query(
            "INSERT INTO order_type_materials (order_type_id, raw_material_id, qty, created_at) VALUES ($1, $2, $3, NOW())"
        )
        .bind(ot_id)
        .bind(mat.raw_material_id)
        .bind(qty_dec)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    let order_types = get_order_types_list(&state.pool).await?;
    let created = order_types.into_iter().find(|ot| ot.id == ot_id).unwrap();

    Ok((StatusCode::CREATED, Json(json!({ "order_type": created }))))
}

pub async fn update_order_type(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(payload): Json<OrderTypePayload>,
) -> Result<Json<Value>, AppError> {
    let name = payload.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("Nama jenis order wajib diisi.".to_string()));
    }

    let exists: Option<i64> = sqlx::query_scalar("SELECT id FROM order_types WHERE LOWER(name) = LOWER($1) AND id != $2")
        .bind(name)
        .bind(id)
        .fetch_optional(&state.pool)
        .await?;
    if exists.is_some() {
        return Err(AppError::Conflict("Nama jenis order sudah digunakan.".to_string()));
    }

    let materials = payload.materials.unwrap_or_default();
    if materials.is_empty() {
        return Err(AppError::BadRequest("Minimal satu bahan baku wajib diisi.".to_string()));
    }

    let output_unit = payload.output_unit.unwrap_or_else(|| "pcs".to_string());
    let selling_price = payload.selling_price.unwrap_or(0);
    let note = payload.note.unwrap_or_default();

    let mut tx = state.pool.begin().await?;

    let updated = sqlx::query(
        r#"
        UPDATE order_types
        SET name = $1, output_unit = $2, selling_price = $3, note = $4, updated_at = NOW()
        WHERE id = $5
        "#
    )
    .bind(name)
    .bind(&output_unit)
    .bind(selling_price)
    .bind(&note)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    if updated.rows_affected() == 0 {
        return Err(AppError::NotFound("Jenis order tidak ditemukan.".to_string()));
    }

    sqlx::query("DELETE FROM order_type_materials WHERE order_type_id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;

    for mat in &materials {
        use std::str::FromStr;
        let qty_dec = bigdecimal::BigDecimal::from_str(&mat.qty.to_string()).unwrap_or_default();
        sqlx::query(
            "INSERT INTO order_type_materials (order_type_id, raw_material_id, qty, created_at) VALUES ($1, $2, $3, NOW())"
        )
        .bind(id)
        .bind(mat.raw_material_id)
        .bind(qty_dec)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    let order_types = get_order_types_list(&state.pool).await?;
    let ot = order_types.into_iter().find(|o| o.id == id).unwrap();

    Ok(Json(json!({ "order_type": ot })))
}

pub async fn delete_order_type(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    let result = sqlx::query("DELETE FROM order_types WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Jenis order tidak ditemukan.".to_string()));
    }

    Ok(Json(json!({ "ok": true, "deleted_id": id })))
}
