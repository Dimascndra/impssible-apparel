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
use sqlx::FromRow;

use crate::auth::password::verify_password;
use crate::auth::{get_client_ip, make_token, read_token, AuthSession};
use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct LoginPayload {
    pub username: String,
    pub password: String,
}

#[derive(Debug, FromRow)]
pub struct DbUser {
    pub id: i32,
    pub username: String,
    pub password_hash: String,
    pub salt: String,
    pub role: String,
}

pub fn get_host_domain_role(headers: &axum::http::HeaderMap) -> &'static str {
    if let Some(host_val) = headers.get(header::HOST).and_then(|h| h.to_str().ok()) {
        let host = host_val.trim().to_lowercase();
        let domain = host.split(':').next().unwrap_or("").trim_end_matches('.');
        if domain == "desain.impossiblejerseyapparel.com" {
            return "design";
        } else if domain == "admin.impossiblejerseyapparel.com" {
            return "admin";
        } else if domain == "impossiblejerseyapparel.com" {
            return "public";
        }
    }
    "legacy"
}

pub async fn auth_login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<LoginPayload>,
) -> Result<Response, AppError> {
    let username = payload.username.trim();
    let password = &payload.password;

    // Proteksi brute force rate limiting: max 10 percobaan per 60 detik per IP + username
    let client_ip = get_client_ip(&headers);
    let rate_key = format!("{}:{}", client_ip, username.to_lowercase());
    state.rate_limiter.check(&rate_key, "auth_login", 10, Duration::from_secs(60)).await?;

    let user = sqlx::query_as::<_, DbUser>(
        "SELECT id, username, password_hash, salt, role FROM users WHERE LOWER(username) = LOWER($1)"
    )
    .bind(username)
    .fetch_optional(&state.pool)
    .await?;

    let user = match user {
        Some(u) => u,
        None => return Err(AppError::Unauthorized("Username atau password salah.".to_string())),
    };

    if !verify_password(password, &user.salt, &user.password_hash) {
        return Err(AppError::Unauthorized("Username atau password salah.".to_string()));
    }

    let token = make_token(&user.username, &user.role, &state.session_secret);
    let session = read_token(&token, &state.session_secret);
    let csrf = session.map(|s| s.csrf).unwrap_or_default();
    let cookie_val = format!(
        "impossible_session={}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200",
        token
    );

    let body = json!({
        "ok": true,
        "username": user.username,
        "role": user.role,
        "csrf": csrf,
        "user": {
            "username": user.username,
            "role": user.role
        }
    });

    let response = Response::builder()
        .header(header::SET_COOKIE, cookie_val)
        .header(header::CONTENT_TYPE, "application/json")
        .body(serde_json::to_string(&body).unwrap().into())
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(response)
}

pub async fn auth_me(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<Json<Value>, AppError> {
    let cookie = jar.get("impossible_session")
        .ok_or_else(|| AppError::Unauthorized("Sesi tidak valid.".to_string()))?;

    let session = read_token(cookie.value(), &state.session_secret)
        .ok_or_else(|| AppError::Unauthorized("Sesi tidak valid.".to_string()))?;

    Ok(Json(json!({
        "ok": true,
        "username": session.username,
        "role": session.role,
        "csrf": session.csrf,
        "user": {
            "username": session.username,
            "role": session.role
        }
    })))
}

pub async fn auth_logout() -> Result<Response, AppError> {
    let cookie_val = "impossible_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
    let body = json!({ "ok": true });

    let response = Response::builder()
        .header(header::SET_COOKIE, cookie_val)
        .header(header::CONTENT_TYPE, "application/json")
        .body(serde_json::to_string(&body).unwrap().into())
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(response)
}

pub fn extract_session(jar: &CookieJar, secret: &[u8]) -> Option<AuthSession> {
    let cookie = jar.get("impossible_session")?;
    read_token(cookie.value(), secret)
}
