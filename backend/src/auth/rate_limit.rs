use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use crate::error::AppError;

#[derive(Clone, Default)]
pub struct RateLimiter {
    attempts: Arc<Mutex<HashMap<(String, String), Vec<Instant>>>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            attempts: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Check if the request is within rate limits.
    /// If limit is exceeded, returns AppError::TooManyRequests.
    /// Otherwise, records the attempt timestamp and returns Ok(()).
    pub async fn check(
        &self,
        key: &str,
        group: &str,
        max_attempts: usize,
        window: Duration,
    ) -> Result<(), AppError> {
        let now = Instant::now();
        let cutoff = now.checked_sub(window).unwrap_or(now);

        let mut lock = self.attempts.lock().await;
        let entry = lock.entry((key.to_string(), group.to_string())).or_default();
        entry.retain(|&time| time > cutoff);

        if entry.len() >= max_attempts {
            return Err(AppError::TooManyRequests(
                "Terlalu banyak percobaan login/permintaan. Harap tunggu beberapa saat sebelum mencoba lagi.".to_string(),
            ));
        }

        entry.push(now);
        Ok(())
    }

    pub async fn cleanup(&self, window: Duration) {
        let now = Instant::now();
        let cutoff = now.checked_sub(window).unwrap_or(now);
        let mut lock = self.attempts.lock().await;
        lock.retain(|_, timestamps| {
            timestamps.retain(|&t| t > cutoff);
            !timestamps.is_empty()
        });
    }
}
