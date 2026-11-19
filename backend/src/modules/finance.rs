use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{FromRow, PgPool};

use crate::error::AppError;
use crate::modules::master::get_order_types_list;
use crate::state::AppState;

pub const EXPENSE_CATEGORIES: &[&str] = &["BAHAN BAKU", "OPERASIONAL", "GAJI/UPAH", "LAINNYA"];

#[derive(Debug, Clone, FromRow)]
pub struct DbInvoice {
    pub id: i64,
    pub invoice_no: String,
    pub job_id: Option<i64>,
    pub customer: String,
    pub address: Option<String>,
    pub invoice_date: String,
    pub due_date: Option<String>,
    pub discount: i64,
    pub shipping: i64,
    pub paid: i64,
    pub notes: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct DbInvoiceItem {
    pub id: i64,
    pub invoice_id: i64,
    pub description: String,
    pub qty: bigdecimal::BigDecimal,
    pub price: i64,
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct DbInvoicePayment {
    pub id: i64,
    pub invoice_id: i64,
    pub receipt_no: String,
    pub amount: i64,
    pub date: String,
    pub method: String,
    pub note: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceItemPublic {
    pub description: String,
    pub qty: f64,
    pub price: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoicePaymentPublic {
    pub id: i64,
    pub receipt_no: String,
    pub amount: i64,
    pub date: String,
    pub method: String,
    pub note: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicInvoice {
    pub id: i64,
    pub invoice_no: String,
    pub job_id: Option<i64>,
    pub customer: String,
    pub address: String,
    pub invoice_date: String,
    pub due_date: Option<String>,
    pub items: Vec<InvoiceItemPublic>,
    pub subtotal: i64,
    pub discount: i64,
    pub shipping: i64,
    pub total: i64,
    pub paid: i64,
    pub balance: i64,
    pub payment_status: String,
    pub payments: Vec<InvoicePaymentPublic>,
    pub latest_payment: Option<InvoicePaymentPublic>,
    pub notes: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

pub async fn build_public_invoice(
    invoice: &DbInvoice,
    pool: &PgPool,
) -> Result<PublicInvoice, AppError> {
    use bigdecimal::ToPrimitive;

    let db_items = sqlx::query_as::<_, DbInvoiceItem>(
        "SELECT id, invoice_id, description, qty, price, sort_order FROM invoice_items WHERE invoice_id = $1 ORDER BY sort_order ASC, id ASC"
    )
    .bind(invoice.id)
    .fetch_all(pool)
    .await?;

    let mut items = Vec::new();
    let mut subtotal = 0i64;
    for it in db_items {
        let q = it.qty.to_f64().unwrap_or(1.0);
        let line_total = (q * it.price as f64).round() as i64;
        subtotal += line_total;
        items.push(InvoiceItemPublic {
            description: it.description,
            qty: q,
            price: it.price,
        });
    }

    let discount = invoice.discount.min(subtotal);
    let shipping = invoice.shipping;
    let total = (subtotal - discount + shipping).max(0);
    let paid = invoice.paid.min(total);
    let balance = (total - paid).max(0);
    let payment_status = if total > 0 && paid >= total {
        "LUNAS"
    } else if paid > 0 {
        "SEBAGIAN"
    } else {
        "BELUM BAYAR"
    };

    let db_payments = sqlx::query_as::<_, DbInvoicePayment>(
        "SELECT id, invoice_id, receipt_no, amount, date, method, note, created_at FROM invoice_payments WHERE invoice_id = $1 ORDER BY id ASC"
    )
    .bind(invoice.id)
    .fetch_all(pool)
    .await?;

    let payments: Vec<InvoicePaymentPublic> = db_payments
        .into_iter()
        .map(|p| InvoicePaymentPublic {
            id: p.id,
            receipt_no: p.receipt_no,
            amount: p.amount,
            date: p.date,
            method: p.method,
            note: p.note.unwrap_or_default(),
            created_at: p.created_at,
        })
        .collect();

    let latest_payment = payments.last().cloned();

    Ok(PublicInvoice {
        id: invoice.id,
        invoice_no: invoice.invoice_no.clone(),
        job_id: invoice.job_id,
        customer: invoice.customer.clone(),
        address: invoice.address.clone().unwrap_or_default(),
        invoice_date: invoice.invoice_date.clone(),
        due_date: invoice.due_date.clone(),
        items,
        subtotal,
        discount,
        shipping,
        total,
        paid,
        balance,
        payment_status: payment_status.to_string(),
        payments,
        latest_payment,
        notes: invoice.notes.clone().unwrap_or_default(),
        created_at: invoice.created_at,
        updated_at: invoice.updated_at,
    })
}

pub async fn list_all_invoices(pool: &PgPool) -> Result<Vec<PublicInvoice>, AppError> {
    let rows = sqlx::query_as::<_, DbInvoice>(
        "SELECT id, invoice_no, job_id, customer, address, invoice_date, due_date, discount, shipping, paid, notes, created_at, updated_at FROM invoices ORDER BY id DESC"
    )
    .fetch_all(pool)
    .await?;

    let mut result = Vec::new();
    for row in &rows {
        result.push(build_public_invoice(row, pool).await?);
    }
    Ok(result)
}

pub async fn get_invoice_by_id(pool: &PgPool, id: i64) -> Result<Option<PublicInvoice>, AppError> {
    let row = sqlx::query_as::<_, DbInvoice>(
        "SELECT id, invoice_no, job_id, customer, address, invoice_date, due_date, discount, shipping, paid, notes, created_at, updated_at FROM invoices WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    if let Some(r) = row {
        Ok(Some(build_public_invoice(&r, pool).await?))
    } else {
        Ok(None)
    }
}

// Handlers
pub async fn send_invoices(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let invoices = list_all_invoices(&state.pool).await?;
    Ok(Json(json!({ "invoices": invoices })))
}

#[derive(Debug, Deserialize)]
pub struct CreateInvoicePayload {
    pub invoice_no: Option<String>,
    pub job_id: Option<i64>,
    pub customer: String,
    pub address: Option<String>,
    pub invoice_date: Option<String>,
    pub due_date: Option<String>,
    pub items: Vec<InvoiceItemPublic>,
    pub discount: Option<i64>,
    pub shipping: Option<i64>,
    pub paid: Option<i64>,
    pub payment_date: Option<String>,
    pub payment_method: Option<String>,
    pub notes: Option<String>,
}

pub async fn create_invoice(
    State(state): State<AppState>,
    Json(payload): Json<CreateInvoicePayload>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let customer = payload.customer.trim();
    if customer.is_empty() {
        return Err(AppError::BadRequest("Nama customer wajib diisi.".to_string()));
    }
    if payload.items.is_empty() {
        return Err(AppError::BadRequest("Minimal satu item wajib diisi.".to_string()));
    }

    let invoice_date = payload.invoice_date.unwrap_or_else(|| Utc::now().format("%Y-%m-%d").to_string());
    let discount = payload.discount.unwrap_or(0);
    let shipping = payload.shipping.unwrap_or(0);
    let paid = payload.paid.unwrap_or(0);
    let notes = payload.notes.unwrap_or_default();
    let address = payload.address.unwrap_or_default();

    let mut tx = state.pool.begin().await?;

    let invoice_no = match payload.invoice_no {
        Some(no) if !no.trim().is_empty() => no,
        _ => {
            let next_id: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(id), 0) + 1 FROM invoices")
                .fetch_one(&mut *tx)
                .await?;
            format!("INV-{}-{:04}", Utc::now().format("%Y%m%d"), next_id)
        }
    };

    let invoice_id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO invoices (invoice_no, job_id, customer, address, invoice_date, due_date, discount, shipping, paid, notes, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        RETURNING id
        "#
    )
    .bind(&invoice_no)
    .bind(payload.job_id)
    .bind(customer)
    .bind(&address)
    .bind(&invoice_date)
    .bind(payload.due_date)
    .bind(discount)
    .bind(shipping)
    .bind(paid)
    .bind(&notes)
    .fetch_one(&mut *tx)
    .await?;

    for (idx, item) in payload.items.iter().enumerate() {
        use std::str::FromStr;
        let qty_dec = bigdecimal::BigDecimal::from_str(&item.qty.to_string()).unwrap_or_default();
        sqlx::query(
            "INSERT INTO invoice_items (invoice_id, description, qty, price, sort_order) VALUES ($1, $2, $3, $4, $5)"
        )
        .bind(invoice_id)
        .bind(&item.description)
        .bind(qty_dec)
        .bind(item.price)
        .bind(idx as i32)
        .execute(&mut *tx)
        .await?;
    }

    if paid > 0 {
        let receipt_no = format!("KWT-{}-001", invoice_no);
        let pdate = payload.payment_date.unwrap_or_else(|| invoice_date.clone());
        let pmethod = payload.payment_method.unwrap_or_else(|| "Tunai".to_string());

        sqlx::query(
            "INSERT INTO invoice_payments (invoice_id, receipt_no, amount, date, method, note, created_at) VALUES ($1, $2, $3, $4, $5, 'Pembayaran awal invoice', NOW())"
        )
        .bind(invoice_id)
        .bind(&receipt_no)
        .bind(paid)
        .bind(&pdate)
        .bind(&pmethod)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    let inv = get_invoice_by_id(&state.pool, invoice_id)
        .await?
        .ok_or_else(|| AppError::Internal("Gagal memuat invoice yang baru dibuat.".to_string()))?;

    Ok((StatusCode::CREATED, Json(json!({ "invoice": inv }))))
}

#[derive(Debug, Deserialize)]
pub struct UpdateInvoicePayload {
    pub invoice_no: Option<String>,
    pub customer: Option<String>,
    pub address: Option<String>,
    pub invoice_date: Option<String>,
    pub due_date: Option<String>,
    pub items: Option<Vec<InvoiceItemPublic>>,
    pub discount: Option<i64>,
    pub shipping: Option<i64>,
    pub notes: Option<String>,
}

pub async fn update_invoice(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(payload): Json<UpdateInvoicePayload>,
) -> Result<Json<Value>, AppError> {
    let mut tx = state.pool.begin().await?;

    let existing = sqlx::query_as::<_, DbInvoice>(
        "SELECT id, invoice_no, job_id, customer, address, invoice_date, due_date, discount, shipping, paid, notes, created_at, updated_at FROM invoices WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Invoice tidak ditemukan.".to_string()))?;

    if let Some(ref num) = payload.invoice_no {
        let n = num.trim();
        if n.is_empty() {
            return Err(AppError::BadRequest("Nomor invoice tidak boleh kosong.".to_string()));
        }
        let exists: Option<i64> = sqlx::query_scalar("SELECT id FROM invoices WHERE invoice_no = $1 AND id != $2")
            .bind(n)
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
        if exists.is_some() {
            return Err(AppError::Conflict("Nomor invoice sudah digunakan.".to_string()));
        }
    }

    let invoice_no = payload.invoice_no.unwrap_or(existing.invoice_no);
    let customer = payload.customer.unwrap_or(existing.customer);
    let address = payload.address.or(existing.address);
    let invoice_date = payload.invoice_date.unwrap_or(existing.invoice_date);
    let due_date = payload.due_date.or(existing.due_date);
    let discount = payload.discount.unwrap_or(existing.discount);
    let shipping = payload.shipping.unwrap_or(existing.shipping);
    let notes = payload.notes.or(existing.notes);

    sqlx::query(
        r#"
        UPDATE invoices
        SET invoice_no = $1, customer = $2, address = $3, invoice_date = $4,
            due_date = $5, discount = $6, shipping = $7, notes = $8, updated_at = NOW()
        WHERE id = $9
        "#
    )
    .bind(&invoice_no)
    .bind(&customer)
    .bind(&address)
    .bind(&invoice_date)
    .bind(&due_date)
    .bind(discount)
    .bind(shipping)
    .bind(&notes)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    if let Some(items) = payload.items {
        if items.is_empty() {
            return Err(AppError::BadRequest("Minimal satu item wajib diisi.".to_string()));
        }
        sqlx::query("DELETE FROM invoice_items WHERE invoice_id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;

        for (idx, item) in items.iter().enumerate() {
            use std::str::FromStr;
            let qty_dec = bigdecimal::BigDecimal::from_str(&item.qty.to_string()).unwrap_or_default();
            sqlx::query(
                "INSERT INTO invoice_items (invoice_id, description, qty, price, sort_order) VALUES ($1, $2, $3, $4, $5)"
            )
            .bind(id)
            .bind(&item.description)
            .bind(qty_dec)
            .bind(item.price)
            .bind(idx as i32)
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;

    let inv = get_invoice_by_id(&state.pool, id)
        .await?
        .ok_or_else(|| AppError::NotFound("Invoice tidak ditemukan.".to_string()))?;

    Ok(Json(json!({ "invoice": inv })))
}

#[derive(Debug, Deserialize)]
pub struct AddPaymentPayload {
    pub amount: i64,
    pub date: Option<String>,
    pub method: Option<String>,
    pub note: Option<String>,
}

pub async fn add_invoice_payment(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(payload): Json<AddPaymentPayload>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    if payload.amount <= 0 {
        return Err(AppError::BadRequest("Nominal pembayaran harus lebih dari 0.".to_string()));
    }

    let mut tx = state.pool.begin().await?;

    let invoice = sqlx::query_as::<_, DbInvoice>(
        "SELECT id, invoice_no, job_id, customer, address, invoice_date, due_date, discount, shipping, paid, notes, created_at, updated_at FROM invoices WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Invoice tidak ditemukan.".to_string()))?;

    let payment_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM invoice_payments WHERE invoice_id = $1")
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;

    let receipt_no = format!("KWT-{}-{:03}", invoice.invoice_no, payment_count + 1);
    let date = payload.date.unwrap_or_else(|| Utc::now().format("%Y-%m-%d").to_string());
    let method = payload.method.unwrap_or_else(|| "Tunai".to_string());
    let note = payload.note.unwrap_or_default();

    let payment = sqlx::query_as::<_, DbInvoicePayment>(
        r#"
        INSERT INTO invoice_payments (invoice_id, receipt_no, amount, date, method, note, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id, invoice_id, receipt_no, amount, date, method, note, created_at
        "#
    )
    .bind(id)
    .bind(&receipt_no)
    .bind(payload.amount)
    .bind(&date)
    .bind(&method)
    .bind(&note)
    .fetch_one(&mut *tx)
    .await?;

    let new_paid = invoice.paid + payload.amount;
    sqlx::query("UPDATE invoices SET paid = $1, updated_at = NOW() WHERE id = $2")
        .bind(new_paid)
        .bind(id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    let inv = get_invoice_by_id(&state.pool, id)
        .await?
        .ok_or_else(|| AppError::NotFound("Invoice tidak ditemukan.".to_string()))?;

    let payment_pub = InvoicePaymentPublic {
        id: payment.id,
        receipt_no: payment.receipt_no,
        amount: payment.amount,
        date: payment.date,
        method: payment.method,
        note: payment.note.unwrap_or_default(),
        created_at: payment.created_at,
    };

    Ok((StatusCode::CREATED, Json(json!({ "invoice": inv, "payment": payment_pub }))))
}

pub async fn delete_invoice(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    let mut tx = state.pool.begin().await?;

    let inv = sqlx::query_as::<_, DbInvoice>(
        "SELECT id, invoice_no, job_id, customer, address, invoice_date, due_date, discount, shipping, paid, notes, created_at, updated_at FROM invoices WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Invoice tidak ditemukan.".to_string()))?;

    let payment_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM invoice_payments WHERE invoice_id = $1")
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM invoices WHERE id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(Json(json!({
        "ok": true,
        "deleted_id": id,
        "invoice_no": inv.invoice_no,
        "customer": inv.customer,
        "removed_payment_total": inv.paid,
        "removed_payment_count": payment_count
    })))
}

// Cashflow
#[derive(Debug, Clone, FromRow)]
pub struct DbCashflowExpense {
    pub id: i64,
    pub job_id: Option<i64>,
    pub date: String,
    pub category: String,
    pub amount: i64,
    pub description: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCashflowExpensePayload {
    pub job_id: Option<i64>,
    pub date: String,
    pub category: String,
    pub amount: i64,
    pub description: String,
}

pub async fn create_cashflow_expense(
    State(state): State<AppState>,
    Json(payload): Json<CreateCashflowExpensePayload>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    if payload.amount <= 0 {
        return Err(AppError::BadRequest("Nominal pengeluaran harus lebih dari 0.".to_string()));
    }
    let cat = payload.category.trim();
    if !EXPENSE_CATEGORIES.contains(&cat) {
        return Err(AppError::BadRequest("Kategori pengeluaran tidak valid.".to_string()));
    }

    let job_info: Option<(String, String)> = if let Some(jid) = payload.job_id {
        sqlx::query_as("SELECT spk, customer FROM jobs WHERE id = $1")
            .bind(jid)
            .fetch_optional(&state.pool)
            .await?
    } else {
        None
    };

    let (spk, customer) = match job_info {
        Some((s, c)) => (s, c),
        None => (String::new(), String::new()),
    };

    let exp = sqlx::query_as::<_, DbCashflowExpense>(
        r#"
        INSERT INTO cashflow_expenses (job_id, date, category, amount, description, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        RETURNING id, job_id, date, category, amount, description, created_at, updated_at
        "#
    )
    .bind(payload.job_id)
    .bind(&payload.date)
    .bind(cat)
    .bind(payload.amount)
    .bind(&payload.description)
    .fetch_one(&state.pool)
    .await?;

    let res = json!({
        "id": exp.id,
        "type": "KELUAR",
        "job_id": exp.job_id,
        "spk": spk,
        "customer": customer,
        "date": exp.date,
        "category": exp.category,
        "amount": exp.amount,
        "description": exp.description,
        "created_at": exp.created_at,
        "updated_at": exp.updated_at
    });

    Ok((StatusCode::CREATED, Json(json!({ "expense": res }))))
}

pub async fn delete_cashflow_expense(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    let result = sqlx::query("DELETE FROM cashflow_expenses WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Pengeluaran tidak ditemukan.".to_string()));
    }

    Ok(Json(json!({ "ok": true, "deleted_id": id })))
}

pub async fn send_cashflow(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let pool = &state.pool;
    let invoices = list_all_invoices(pool).await?;

    let mut incomes = Vec::new();
    for inv in &invoices {
        let mut recorded = 0i64;
        for pay in &inv.payments {
            let amount = pay.amount.min((inv.paid - recorded).max(0));
            if amount <= 0 { continue; }
            recorded += amount;
            incomes.push(json!({
                "id": format!("payment-{}-{}", inv.id, pay.id),
                "type": "MASUK",
                "invoice_id": inv.id,
                "invoice_no": inv.invoice_no,
                "job_id": inv.job_id,
                "amount": amount,
                "date": pay.date,
                "method": pay.method,
                "description": if pay.note.is_empty() { format!("Pembayaran {}", inv.invoice_no) } else { pay.note.clone() },
                "created_at": pay.created_at
            }));
        }
        let legacy_amount = (inv.paid - recorded).max(0);
        if legacy_amount > 0 {
            incomes.push(json!({
                "id": format!("legacy-{}", inv.id),
                "type": "MASUK",
                "invoice_id": inv.id,
                "invoice_no": inv.invoice_no,
                "job_id": inv.job_id,
                "amount": legacy_amount,
                "date": inv.invoice_date,
                "method": "Pembayaran lama",
                "description": format!("Pembayaran tercatat {}", inv.invoice_no),
                "created_at": inv.updated_at
            }));
        }
    }

    #[derive(FromRow)]
    struct ExpWithJob {
        id: i64,
        job_id: Option<i64>,
        spk: Option<String>,
        customer: Option<String>,
        date: String,
        category: String,
        amount: i64,
        description: String,
        created_at: chrono::DateTime<chrono::Utc>,
        updated_at: chrono::DateTime<chrono::Utc>,
    }

    let db_expenses = sqlx::query_as::<_, ExpWithJob>(
        r#"
        SELECT e.id, e.job_id, j.spk, j.customer, e.date, e.category, e.amount, e.description, e.created_at, e.updated_at
        FROM cashflow_expenses e
        LEFT JOIN jobs j ON j.id = e.job_id
        ORDER BY e.date DESC, e.created_at DESC
        "#
    )
    .fetch_all(pool)
    .await?;

    let mut expenses = Vec::new();
    for exp in &db_expenses {
        expenses.push(json!({
            "id": exp.id,
            "type": "KELUAR",
            "job_id": exp.job_id,
            "spk": exp.spk.clone().unwrap_or_default(),
            "customer": exp.customer.clone().unwrap_or_default(),
            "date": exp.date,
            "category": exp.category,
            "amount": exp.amount,
            "description": exp.description,
            "created_at": exp.created_at,
            "updated_at": exp.updated_at
        }));
    }

    let order_types = get_order_types_list(pool).await?;
    #[derive(FromRow)]
    struct JobSimple {
        id: i64,
        spk: String,
        customer: String,
        product: String,
        qty: i32,
        order_type_id: Option<i64>,
        hpp_unit_snapshot: i64,
        selling_price_snapshot: i64,
    }

    let jobs = sqlx::query_as::<_, JobSimple>(
        "SELECT id, spk, customer, product, qty, order_type_id, hpp_unit_snapshot, selling_price_snapshot FROM jobs ORDER BY id DESC"
    )
    .fetch_all(pool)
    .await?;

    let mut per_spk = Vec::new();
    for job in &jobs {
        let job_incomes = incomes.iter().filter(|i| i["job_id"] == job.id);
        let job_income: i64 = job_incomes.map(|i| i["amount"].as_i64().unwrap_or(0)).sum();

        let job_expenses: Vec<&ExpWithJob> = db_expenses.iter().filter(|e| e.job_id == Some(job.id)).collect();
        let total_expense: i64 = job_expenses.iter().map(|e| e.amount).sum();
        let material_expense: i64 = job_expenses.iter().filter(|e| e.category == "BAHAN BAKU").map(|e| e.amount).sum();

        let ot = job.order_type_id
            .and_then(|id| order_types.iter().find(|o| o.id == id))
            .or_else(|| {
                let p_norm = job.product.trim().to_lowercase();
                order_types.iter().find(|o| o.name.trim().to_lowercase() == p_norm)
            });

        let hpp_unit = if job.hpp_unit_snapshot > 0 { job.hpp_unit_snapshot } else { ot.map(|o| o.total_hpp).unwrap_or(0) };
        let selling_price = if job.selling_price_snapshot > 0 { job.selling_price_snapshot } else { ot.map(|o| o.selling_price).unwrap_or(0) };
        let qty = job.qty.max(1) as i64;
        let total_hpp = hpp_unit * qty;
        let projected_rev = selling_price * qty;
        let projected_prof = projected_rev - total_hpp;

        let costing = json!({
            "order_type_id": job.order_type_id.or_else(|| ot.map(|o| o.id)),
            "hpp_unit": hpp_unit,
            "selling_price": selling_price,
            "total_hpp": total_hpp,
            "projected_revenue": projected_rev,
            "projected_profit": projected_prof
        });

        let invoice_val: i64 = invoices.iter().filter(|inv| inv.job_id == Some(job.id)).map(|inv| inv.total).sum();
        let projected_revenue = if invoice_val > 0 { invoice_val } else { projected_rev };
        let hpp_remaining = (total_hpp - material_expense).max(0);
        let cash_balance = job_income - total_expense;
        let available_cash = cash_balance.max(0);
        let hpp_funded = hpp_remaining.min(available_cash);
        let hpp_shortage = (hpp_remaining - available_cash).max(0);
        let profit_available = cash_balance - hpp_remaining;

        per_spk.push(json!({
            "job_id": job.id,
            "spk": job.spk,
            "customer": job.customer,
            "product": job.product,
            "qty": job.qty,
            "income": job_income,
            "expenses": total_expense,
            "material_expense": material_expense,
            "cash_balance": cash_balance,
            "hpp_required": total_hpp,
            "hpp_remaining": hpp_remaining,
            "hpp_funded": hpp_funded,
            "hpp_shortage": hpp_shortage,
            "profit_available": profit_available,
            "projected_revenue": projected_revenue,
            "projected_profit": projected_revenue - total_hpp,
            "costing": costing
        }));
    }

    let total_in: i64 = incomes.iter().map(|i| i["amount"].as_i64().unwrap_or(0)).sum();
    let total_out: i64 = expenses.iter().map(|e| e["amount"].as_i64().unwrap_or(0)).sum();
    let cash_balance = total_in - total_out;
    let hpp_required_total: i64 = per_spk.iter().map(|s| s["hpp_required"].as_i64().unwrap_or(0)).sum();
    let hpp_remaining_total: i64 = per_spk.iter().map(|s| s["hpp_remaining"].as_i64().unwrap_or(0)).sum();
    let profit_available_total = cash_balance - hpp_remaining_total;
    let projected_profit_total: i64 = per_spk.iter().map(|s| s["projected_profit"].as_i64().unwrap_or(0)).sum();

    let mut transactions = Vec::new();
    transactions.extend(incomes);
    transactions.extend(expenses);
    transactions.sort_by(|a, b| {
        let da = a["date"].as_str().unwrap_or_default();
        let db = b["date"].as_str().unwrap_or_default();
        db.cmp(da)
    });

    Ok(Json(json!({
        "summary": {
            "total_in": total_in,
            "total_out": total_out,
            "cash_balance": cash_balance,
            "hpp_required_total": hpp_required_total,
            "hpp_remaining_total": hpp_remaining_total,
            "profit_available_total": profit_available_total,
            "projected_profit_total": projected_profit_total
        },
        "per_spk": per_spk,
        "transactions": transactions,
        "categories": EXPENSE_CATEGORIES
    })))
}
