use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use regex::Regex;
use std::path::Path;

#[derive(Clone, Debug)]
pub struct UiTemplates {
    pub admin_internal: String,
    pub admin_public: String,
    pub design: String,
    pub login: String,
    pub public_site: String,
}

impl UiTemplates {
    pub fn build(ui_dir: &Path) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let dist_index = ui_dir.join("dist/index.html");
        if dist_index.exists() {
            tracing::info!("Using modern React Vite SPA build from {:?}", dist_index);
            let index_html = std::fs::read_to_string(&dist_index)?;
            return Ok(Self {
                admin_internal: index_html.clone(),
                admin_public: index_html.clone(),
                design: index_html.clone(),
                login: index_html.clone(),
                public_site: index_html,
            });
        }

        // Fallback to legacy assets bundling if dist does not exist
        let logo_path = ui_dir.join("assets/impossible-logo.png");
        let logo_data = if logo_path.exists() {
            let logo_bytes = std::fs::read(&logo_path)?;
            format!("data:image/png;base64,{}", BASE64.encode(&logo_bytes))
        } else {
            String::new()
        };

        let link_regex = Regex::new(r#"(?i)<link\s+rel="stylesheet"\s+href="[^"]+">\s*"#)?;
        let script_regex = Regex::new(r#"(?i)<script\s+src="[^"]+"></script>\s*"#)?;
        let logo_attr_regex = Regex::new(r#"(?i)src="/(?:instruksi/)?assets/impossible-logo\.png(?:\?[^"]*)?"#)?;
        let logo_ref_regex = Regex::new(r#"(?i)/(?:instruksi/)?assets/impossible-logo\.png(?:\?[^\"'`]*)?"#)?;
        let close_script_regex = Regex::new(r#"(?i)</script"#)?;

        let inline_page = |rel_html: &str, scripts: &[&str], css_files: &[&str]| -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
            let html_path = ui_dir.join(rel_html);
            if !html_path.exists() {
                return Ok("<!doctype html><html><head><title>Impossible Apparel</title></head><body><h1>Frontend build required. Please run npm run build in frontend directory.</h1></body></html>".to_string());
            }

            let mut css_combined = String::new();
            for css_file in css_files {
                let css_path = ui_dir.join("assets").join(css_file);
                if css_path.exists() {
                    let css_content = std::fs::read_to_string(css_path)?;
                    css_combined.push_str(&css_content);
                    css_combined.push('\n');
                }
            }

            let mut html = std::fs::read_to_string(&html_path)?;
            html = link_regex.replace_all(&html, "").to_string();
            html = html.replace("</head>", &format!("<style>{}</style></head>", css_combined));
            html = script_regex.replace_all(&html, "").to_string();
            if !logo_data.is_empty() {
                html = logo_attr_regex.replace_all(&html, format!("src=\"{}\"", logo_data).as_str()).to_string();
            }

            let mut js_combined = String::new();
            for js_file in scripts {
                let js_path = ui_dir.join("assets").join(js_file);
                if js_path.exists() {
                    let js_content = std::fs::read_to_string(js_path)?;
                    js_combined.push_str(&js_content);
                    js_combined.push('\n');
                }
            }
            let mut js = close_script_regex.replace_all(&js_combined, "<\\/script").to_string();
            if !logo_data.is_empty() {
                js = logo_ref_regex.replace_all(&js, logo_data.as_str()).to_string();
            }

            html = html.replace("</body>", &format!("<script>{}</script></body>", js));
            Ok(html)
        };

        let admin_page = inline_page(
            "instruksi/index.html",
            &["common.js", "instruction.js", "marketing.js"],
            &["app.css", "marketing.css"],
        )?;

        let admin_internal = admin_page.replace("</head>", "<script>window.IA_ADMIN_MODE=\"internal\";</script></head>");
        let admin_public = admin_page.replace("</head>", "<script>window.IA_ADMIN_MODE=\"public\";</script></head>");

        let design = inline_page(
            "desain/index.html",
            &["common.js", "design.js"],
            &["app.css"],
        )?;

        let login = inline_page(
            "login.html",
            &["common.js", "login.js"],
            &["app.css"],
        )?;

        let public_site = inline_page(
            "public/index.html",
            &["public-site.js"],
            &["public-site.css", "location-v13.css"],
        )?;

        Ok(Self {
            admin_internal,
            admin_public,
            design,
            login,
            public_site,
        })
    }
}
