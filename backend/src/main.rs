mod auth;
mod config;
mod error;
mod modules;
mod state;
mod ui;

use axum::{
    extract::{Request, State},
    http::{header, HeaderMap, Method, StatusCode},
    middleware::{self, Next},
    response::{Html, IntoResponse, Redirect, Response},
    routing::{delete, get, patch, post, put},
    Json, Router,
};
use axum_extra::extract::CookieJar;
use chrono::Utc;
use serde_json::json;
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use tower_http::trace::TraceLayer;

use crate::auth::{verify_csrf, RateLimiter};
use crate::config::AppConfig;
use crate::error::AppError;
use crate::modules::auth::{auth_login, auth_logout, auth_me, extract_session};
use crate::modules::catalog::*;
use crate::modules::customer::*;
use crate::modules::finance::*;
use crate::modules::jobs::*;
use crate::modules::marketing::*;
use crate::modules::master::*;
use crate::modules::pdf::*;
use crate::modules::tracking::*;
use crate::modules::website::*;
use crate::state::AppState;
use crate::ui::UiTemplates;

const SERVER_VERSION: &str = "FINAL-1.18.0-UNIFIED-SECURITY";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,impossible_apparel=debug".into()),
        )
        .init();

    let config = AppConfig::from_env();

    tracing::info!("Connecting to PostgreSQL database at {}", config.database_url);
    let pool = PgPoolOptions::new()
        .max_connections(25)
        .connect(&config.database_url)
        .await?;

    tracing::info!("Bundling UI templates from {:?}", config.frontend_dir);
    let ui_templates = UiTemplates::build(&config.frontend_dir).map_err(|e| e.to_string())?;
    let ui = Arc::new(ui_templates);

    let rate_limiter = Arc::new(RateLimiter::new());

    // Periodic cleanup of rate limiter entries
    let rl_cleaner = rate_limiter.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(300));
        loop {
            interval.tick().await;
            rl_cleaner.cleanup(std::time::Duration::from_secs(300)).await;
        }
    });

    let state = AppState {
        pool,
        ui,
        upload_dir: config.upload_dir.clone(),
        data_dir: config.data_dir.clone(),
        session_secret: config.session_secret.clone(),
        rate_limiter,
        started_at: Utc::now(),
        version: SERVER_VERSION,
    };

    let app = build_unified_router(state);

    let addr = format!("{}:{}", config.host, config.port);
    tracing::info!("Starting Unified Impossible Apparel Server on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

// Health check handler
async fn health_check(State(state): State<AppState>) -> impl IntoResponse {
    Json(json!({
        "ok": true,
        "version": state.version,
        "pdf": true,
        "started_at": state.started_at
    }))
}

// Public URL handler
async fn public_url(State(state): State<AppState>) -> impl IntoResponse {
    let path = state.data_dir.join("public-url.json");
    if let Ok(content) = std::fs::read_to_string(path) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
            return Json(val);
        }
    }
    Json(json!({
        "url": "",
        "note": "Tautan publik belum tersedia."
    }))
}

fn redirect_302(to: &str) -> Response {
    (StatusCode::FOUND, [(header::LOCATION, to)]).into_response()
}

fn redirect_301(to: &str) -> Response {
    (StatusCode::MOVED_PERMANENTLY, [(header::LOCATION, to)]).into_response()
}

// UI Handlers
async fn public_home_handler(
    State(s): State<AppState>,
    headers: HeaderMap,
    jar: CookieJar,
) -> Response {
    if let Some(host_val) = headers.get(header::HOST).and_then(|h| h.to_str().ok()) {
        let host = host_val.trim().to_lowercase();
        let domain = host.split(':').next().unwrap_or("").trim_end_matches('.');
        if domain == "admin.impossiblejerseyapparel.com" {
            if let Some(session) = extract_session(&jar, &s.session_secret) {
                if session.role == "admin" {
                    return Html(s.ui.admin_public.clone()).into_response();
                }
            }
            return redirect_302("/login");
        } else if domain == "desain.impossiblejerseyapparel.com" {
            if let Some(session) = extract_session(&jar, &s.session_secret) {
                if session.role == "design" || session.role == "admin" {
                    return Html(s.ui.design.clone()).into_response();
                }
            }
            return redirect_302("/login");
        }
    }
    Html(s.ui.public_site.clone()).into_response()
}

async fn login_page_handler(State(s): State<AppState>, jar: CookieJar) -> Response {
    if let Some(session) = extract_session(&jar, &s.session_secret) {
        if session.role == "admin" {
            return redirect_302("/instruksi");
        } else if session.role == "design" {
            return redirect_302("/desain");
        }
    }
    Html(s.ui.login.clone()).into_response()
}

async fn admin_page_handler(State(s): State<AppState>, jar: CookieJar) -> Response {
    if let Some(session) = extract_session(&jar, &s.session_secret) {
        if session.role == "admin" {
            return Html(s.ui.admin_public.clone()).into_response();
        }
    }
    redirect_302("/login")
}

async fn design_page_handler(State(s): State<AppState>, jar: CookieJar) -> Response {
    if let Some(session) = extract_session(&jar, &s.session_secret) {
        if session.role == "design" || session.role == "admin" {
            return Html(s.ui.design.clone()).into_response();
        }
    }
    redirect_302("/login")
}

async fn website_preview_handler(State(s): State<AppState>, jar: CookieJar) -> Response {
    if let Some(session) = extract_session(&jar, &s.session_secret) {
        if session.role == "admin" {
            return Html(s.ui.public_site.clone()).into_response();
        }
    }
    redirect_302("/login")
}

// Middleware: CSRF & Admin Auth Guard for /api/admin/*
async fn admin_guard(
    State(state): State<AppState>,
    jar: CookieJar,
    req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let session = extract_session(&jar, &state.session_secret)
        .ok_or_else(|| AppError::Unauthorized("Sesi tidak valid. Silakan login kembali.".to_string()))?;

    if session.role != "admin" {
        return Err(AppError::Forbidden("Hanya akun Admin yang diizinkan.".to_string()));
    }

    let method = req.method();
    if method == Method::POST || method == Method::PUT || method == Method::PATCH || method == Method::DELETE {
        let req_csrf = req.headers()
            .get("X-CSRF-Token")
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default();

        if !verify_csrf(&session.csrf, req_csrf) {
            return Err(AppError::Forbidden("Token CSRF tidak valid.".to_string()));
        }
    }

    Ok(next.run(req).await)
}

// Middleware: Design or Admin Auth Guard for /api/jobs...
async fn design_or_admin_guard(
    State(state): State<AppState>,
    jar: CookieJar,
    req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let session = extract_session(&jar, &state.session_secret)
        .ok_or_else(|| AppError::Unauthorized("Sesi tidak valid. Silakan login kembali.".to_string()))?;

    if session.role != "design" && session.role != "admin" {
        return Err(AppError::Forbidden("Akses ditolak.".to_string()));
    }

    let method = req.method();
    if method == Method::POST || method == Method::PUT || method == Method::PATCH || method == Method::DELETE {
        let req_csrf = req.headers()
            .get("X-CSRF-Token")
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default();

        if !verify_csrf(&session.csrf, req_csrf) {
            return Err(AppError::Forbidden("Token CSRF tidak valid.".to_string()));
        }
    }

    Ok(next.run(req).await)
}

fn build_unified_router(state: AppState) -> Router {
    // 1. Unprotected / Public UI routes
    let public_ui_routes = Router::new()
        .route("/", get(public_home_handler))
        .route("/katalog", get(|| async { redirect_301("/") }))
        .route("/katalog/", get(|| async { redirect_301("/") }))
        .route("/cek-pesanan", get(|| async { redirect_301("/#order") }))
        .route("/cek-pesanan/", get(|| async { redirect_301("/#order") }))
        .route("/website", get(|| async { redirect_301("/") }))
        .route("/website/", get(|| async { redirect_301("/") }))
        .route("/login", get(login_page_handler))
        .route("/login/", get(login_page_handler));

    // 2. Protected UI routes (Session checked in handlers -> 302 Redirect to /login)
    let protected_ui_routes = Router::new()
        .route("/instruksi", get(admin_page_handler))
        .route("/instruksi/", get(admin_page_handler))
        .route("/admin", get(admin_page_handler))
        .route("/admin/", get(admin_page_handler))
        .route("/desain", get(design_page_handler))
        .route("/desain/", get(design_page_handler))
        .route("/website-preview", get(website_preview_handler))
        .route("/website-preview/", get(website_preview_handler));

    // 3. Public API & media routes
    let public_api_routes = Router::new()
        .route("/media/:id", get(send_catalog_media))
        .route("/api/health", get(health_check))
        .route("/api/public-url", get(public_url))
        .route("/api/auth/login", post(auth_login))
        .route("/api/auth/me", get(auth_me))
        .route("/api/auth/logout", post(auth_logout))
        .route("/api/public/catalog", get(send_catalog_public))
        .route("/api/public/catalog/:slug", get(send_catalog_product_public))
        .route("/api/public/activity", get(send_public_order_activity))
        .route("/api/public/customer/login", post(customer_login))
        .route("/api/public/customer/logout", post(customer_logout))
        .route("/api/public/customer/summary", get(customer_summary))
        .route("/api/public/customer/invoices/:id/pdf", get(send_customer_invoice_pdf));

    // 4. Design & Admin shared API routes (under design_or_admin_guard)
    let design_api_routes = Router::new()
        .route("/api/jobs", get(|s: State<AppState>, jar: CookieJar| async move {
            let session = extract_session(&jar, &s.session_secret);
            let is_design = session.map(|sess| sess.role == "design").unwrap_or(true);
            let jobs = list_all_jobs(&s.pool, is_design).await?;
            Ok::<_, AppError>(Json(json!({ "jobs": jobs })))
        }))
        .route("/api/jobs/:id", patch(update_job))
        .route("/api/jobs/:id/messages", get(send_messages).post(|s, id, p| post_message(s, id, "Desain", p)))
        .route("/api/jobs/:id/upload/:kind", post(upload_job_files))
        .route("/api/files/:file_id", get(send_file))
        .layer(middleware::from_fn_with_state(state.clone(), design_or_admin_guard));

    // 5. Admin API routes (under admin_guard)
    let admin_api_routes = Router::new()
        .route("/api/website-preview/catalog", get(send_catalog_public))
        .route("/api/website-preview/activity", get(send_public_order_activity))
        .route("/api/admin/public-url", get(public_url))
        .route("/api/admin/jobs", get(send_jobs).post(create_job))
        .route("/api/admin/jobs/:id", patch(update_job))
        .route("/api/admin/jobs/:id/messages", get(send_messages).post(|s, id, p| post_message(s, id, "Instruksi", p)))
        .route("/api/admin/jobs/:id/upload/:kind", post(upload_job_files))
        .route("/api/admin/jobs/:id/customer-code", post(regenerate_customer_code))
        .route("/api/admin/tracking/:id", get(send_tracking_history).post(add_tracking))
        .route("/api/admin/invoices", get(send_invoices).post(create_invoice))
        .route("/api/admin/invoices/:id", patch(update_invoice).delete(delete_invoice))
        .route("/api/admin/invoices/:id/payments", post(add_invoice_payment))
        .route("/api/admin/invoices/:id/pdf", get(send_invoice_pdf))
        .route("/api/admin/order-types", get(send_order_types).post(create_order_type))
        .route("/api/admin/order-types/:id", put(update_order_type).delete(delete_order_type))
        .route("/api/admin/raw-materials", get(send_raw_materials).post(create_raw_material))
        .route("/api/admin/raw-materials/:id", put(update_raw_material).delete(delete_raw_material))
        .route("/api/admin/cashflow", get(send_cashflow))
        .route("/api/admin/cashflow/expenses", post(create_cashflow_expense))
        .route("/api/admin/cashflow/expenses/:id", delete(delete_cashflow_expense))
        .route("/api/admin/website/settings", get(send_website_settings).put(update_website_settings))
        .route("/api/admin/website/header-media", post(upload_header_media))
        .route("/api/admin/website/header-media/:id", delete(delete_header_media))
        .route("/api/admin/website/nav-background", post(upload_nav_background).delete(delete_nav_background))
        .route("/api/admin/website/hero-background", post(upload_hero_background).delete(delete_hero_background))
        .route("/api/admin/website/about-background", post(upload_about_background).delete(delete_about_background))
        .route("/api/admin/catalog", get(send_catalog_admin).post(create_catalog_product))
        .route("/api/admin/catalog/:id", put(update_catalog_product).delete(delete_catalog_product))
        .route("/api/admin/marketing/summary", get(send_marketing_summary))
        .route("/api/admin/marketing/products", get(send_marketing_products))
        .route("/api/admin/marketing/media", post(upload_marketing_media))
        .route("/api/admin/marketing/media/:id/file", get(send_marketing_media_file))
        .route("/api/admin/marketing/media/:id", delete(delete_marketing_media))
        .route("/api/admin/marketing/generate", post(generate_marketing_content))
        .route("/api/admin/marketing/posts", post(create_marketing_post))
        .route("/api/admin/marketing/posts/:id/status", post(update_marketing_post_status))
        .route("/api/admin/marketing/posts/:id/publish", post(publish_marketing_post))
        .route("/api/admin/marketing/ads", post(create_marketing_ad))
        .route("/api/admin/marketing/ads/:id/approve", post(approve_marketing_ad))
        .route("/api/admin/marketing/ads/:id", delete(delete_marketing_ad))
        .route("/api/admin/marketing/metrics", post(create_marketing_metric))
        .route("/api/admin/marketing/metrics/:id", delete(delete_marketing_metric))
        .route("/api/admin/marketing/connections/:platform", put(save_marketing_connection).delete(delete_marketing_connection))
        .layer(middleware::from_fn_with_state(state.clone(), admin_guard));

    Router::new()
        .merge(public_ui_routes)
        .merge(protected_ui_routes)
        .merge(public_api_routes)
        .merge(design_api_routes)
        .merge(admin_api_routes)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
