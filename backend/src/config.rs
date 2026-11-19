use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub database_url: String,
    pub port: u16,
    pub host: String,
    pub data_dir: PathBuf,
    pub upload_dir: PathBuf,
    pub frontend_dir: PathBuf,
    pub fonts_dir: PathBuf,
    pub session_secret: Vec<u8>,
}

fn resolve_dir(env_var: &str, candidates: &[&str]) -> PathBuf {
    if let Ok(val) = std::env::var(env_var) {
        let p = PathBuf::from(val);
        if p.exists() {
            return p;
        }
    }
    
    // Check relative to current executable ancestors
    if let Ok(exe) = std::env::current_exe() {
        let mut cur = exe.parent();
        while let Some(dir) = cur {
            for cand in candidates {
                let p = dir.join(cand);
                if p.exists() {
                    return p;
                }
            }
            cur = dir.parent();
        }
    }

    // Check known project root
    let root = PathBuf::from("/home/supernova/WebProject/impossible-apparelv2");
    for cand in candidates {
        let p = root.join(cand);
        if p.exists() {
            return p;
        }
    }

    for cand in candidates {
        let p = PathBuf::from(cand);
        if p.exists() {
            return p;
        }
    }
    PathBuf::from(candidates[0])
}

impl AppConfig {
    pub fn from_env() -> Self {
        // Try multiple locations for .env
        let _ = dotenvy::from_path("/home/supernova/WebProject/impossible-apparelv2/.env");
        let _ = dotenvy::from_path("/home/supernova/WebProject/impossible-apparelv2/backend/.env");
        let _ = dotenvy::dotenv();

        let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| {
            "postgres://impossible_user:impossible_secure_pass_2026@localhost:5432/impossible_apparel".to_string()
        });

        let port = std::env::var("APP_PORT")
            .or_else(|_| std::env::var("PORT"))
            .or_else(|_| std::env::var("IMP_PORT"))
            .or_else(|_| std::env::var("IMP_PUBLIC_PORT"))
            .or_else(|_| std::env::var("IMP_INTERNAL_PORT"))
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(8897);

        let host = std::env::var("APP_HOST")
            .or_else(|_| std::env::var("HOST"))
            .or_else(|_| std::env::var("IMP_HOST"))
            .or_else(|_| std::env::var("IMP_PUBLIC_HOST"))
            .unwrap_or_else(|_| "0.0.0.0".to_string());

        let data_dir = resolve_dir("IMP_DATA_DIR", &["data", "../data", "/app/data"]);
        let upload_dir = resolve_dir("IMP_UPLOAD_DIR", &["uploads", "../uploads", "/app/uploads"]);
        let frontend_dir = resolve_dir("IMP_FRONTEND_DIR", &["frontend", "../frontend", "/app/frontend"]);
        let fonts_dir = resolve_dir("IMP_FONTS_DIR", &["backend/fonts", "fonts", "../fonts", "/app/fonts"]);

        // Read or create session secret
        let secret_path = data_dir.join("session-secret.txt");
        let session_secret = if let Ok(s) = std::fs::read(&secret_path) {
            if s.len() >= 32 {
                s
            } else {
                let generated = rand::random::<[u8; 32]>().to_vec();
                let _ = std::fs::create_dir_all(&data_dir);
                let _ = std::fs::write(&secret_path, &generated);
                generated
            }
        } else {
            let generated = rand::random::<[u8; 32]>().to_vec();
            let _ = std::fs::create_dir_all(&data_dir);
            let _ = std::fs::write(&secret_path, &generated);
            generated
        };

        Self {
            database_url,
            port,
            host,
            data_dir,
            upload_dir,
            frontend_dir,
            fonts_dir,
            session_secret,
        }
    }
}
