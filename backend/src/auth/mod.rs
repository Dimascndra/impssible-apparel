pub mod password;
pub mod rate_limit;

pub use rate_limit::RateLimiter;

use base64::engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL;
use base64::Engine;
use chrono::Utc;
use hmac::{Hmac, Mac};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AuthSession {
    pub username: String,
    pub role: String,
    pub exp: i64,
    pub csrf: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CustomerSession {
    pub job_id: i64,
    pub role: String,
    pub code_hash: String,
    pub exp: i64,
}

pub fn sign(value: &str, secret: &[u8]) -> String {
    let mut mac = HmacSha256::new_from_slice(secret).expect("HMAC can take key of any size");
    mac.update(value.as_bytes());
    let result = mac.finalize().into_bytes();
    BASE64URL.encode(result)
}

pub fn make_token(username: &str, role: &str, secret: &[u8]) -> String {
    let mut csrf_bytes = [0u8; 18];
    rand::thread_rng().fill_bytes(&mut csrf_bytes);
    let csrf = BASE64URL.encode(csrf_bytes);
    let exp = Utc::now().timestamp_millis() + 12 * 60 * 60 * 1000;

    let session = AuthSession {
        username: username.to_string(),
        role: role.to_string(),
        exp,
        csrf,
    };

    let payload_json = serde_json::to_string(&session).unwrap();
    let payload_b64 = BASE64URL.encode(payload_json.as_bytes());
    let signature = sign(&payload_b64, secret);
    format!("{}.{}", payload_b64, signature)
}

pub fn read_token(token: &str, secret: &[u8]) -> Option<AuthSession> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 2 {
        return None;
    }
    let payload_b64 = parts[0];
    let signature = parts[1];

    let expected_sig = sign(payload_b64, secret);
    if !bool::from(expected_sig.as_bytes().ct_eq(signature.as_bytes())) {
        return None;
    }

    let payload_bytes = BASE64URL.decode(payload_b64).ok()?;
    let session: AuthSession = serde_json::from_slice(&payload_bytes).ok()?;

    if session.exp < Utc::now().timestamp_millis() {
        return None;
    }

    Some(session)
}

pub fn make_customer_token(job_id: i64, customer_code: &str, secret: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(customer_code.as_bytes());
    let hash_hex = hex::encode(hasher.finalize());
    let code_hash = hash_hex[..16].to_string();
    let exp = Utc::now().timestamp_millis() + 7 * 24 * 60 * 60 * 1000;

    let session = CustomerSession {
        job_id,
        role: "customer".to_string(),
        code_hash,
        exp,
    };

    let payload_json = serde_json::to_string(&session).unwrap();
    let payload_b64 = BASE64URL.encode(payload_json.as_bytes());
    let signature = sign(&payload_b64, secret);
    format!("{}.{}", payload_b64, signature)
}

pub fn read_customer_token(token: &str, secret: &[u8]) -> Option<CustomerSession> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 2 {
        return None;
    }
    let payload_b64 = parts[0];
    let signature = parts[1];

    let expected_sig = sign(payload_b64, secret);
    if !bool::from(expected_sig.as_bytes().ct_eq(signature.as_bytes())) {
        return None;
    }

    let payload_bytes = BASE64URL.decode(payload_b64).ok()?;
    let session: CustomerSession = serde_json::from_slice(&payload_bytes).ok()?;

    if session.exp < Utc::now().timestamp_millis() {
        return None;
    }

    Some(session)
}

pub fn verify_csrf(session_csrf: &str, request_csrf: &str) -> bool {
    if session_csrf.is_empty() || request_csrf.is_empty() {
        return false;
    }
    session_csrf.as_bytes().ct_eq(request_csrf.as_bytes()).into()
}

pub fn get_client_ip(headers: &http::HeaderMap) -> String {
    if let Some(forwarded) = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()) {
        if let Some(first) = forwarded.split(',').next() {
            let clean = first.trim();
            if !clean.is_empty() {
                return clean.to_string();
            }
        }
    }
    if let Some(real_ip) = headers.get("x-real-ip").and_then(|v| v.to_str().ok()) {
        let clean = real_ip.trim();
        if !clean.is_empty() {
            return clean.to_string();
        }
    }
    "127.0.0.1".to_string()
}
