use std::path::PathBuf;
use std::sync::Arc;
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use crate::auth::RateLimiter;
use crate::ui::UiTemplates;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub ui: Arc<UiTemplates>,
    pub upload_dir: PathBuf,
    pub data_dir: PathBuf,
    pub session_secret: Vec<u8>,
    pub rate_limiter: Arc<RateLimiter>,
    pub started_at: DateTime<Utc>,
    pub version: &'static str,
}
