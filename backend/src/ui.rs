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
        let logo_path = ui_dir.join("assets/impossible-logo.png");
        let logo_bytes = std::fs::read(&logo_path)?;
        let logo_data = format!("data:image/png;base64,{}", BASE64.encode(&logo_bytes));

        let link_regex = Regex::new(r#"(?i)<link\s+rel="stylesheet"\s+href="[^"]+">\s*"#)?;
        let script_regex = Regex::new(r#"(?i)<script\s+src="[^"]+"></script>\s*"#)?;
        let logo_attr_regex = Regex::new(r#"(?i)src="/(?:instruksi/)?assets/impossible-logo\.png(?:\?[^"]*)?"#)?;
        let logo_ref_regex = Regex::new(r#"(?i)/(?:instruksi/)?assets/impossible-logo\.png(?:\?[^\"'`]*)?"#)?;
        let close_script_regex = Regex::new(r#"(?i)</script"#)?;

        let inline_page = |rel_html: &str, scripts: &[&str], css_files: &[&str]| -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
            let mut css_combined = String::new();
            for css_file in css_files {
                let css_content = std::fs::read_to_string(ui_dir.join("assets").join(css_file))?;
                css_combined.push_str(&css_content);
                css_combined.push('\n');
            }

            let mut html = std::fs::read_to_string(ui_dir.join(rel_html))?;
            html = link_regex.replace_all(&html, "").to_string();
            html = html.replace("</head>", &format!("<style>{}</style></head>", css_combined));
            html = script_regex.replace_all(&html, "").to_string();
            html = logo_attr_regex.replace_all(&html, format!("src=\"{}\"", logo_data).as_str()).to_string();

            let mut js_combined = String::new();
            for js_file in scripts {
                let js_content = std::fs::read_to_string(ui_dir.join("assets").join(js_file))?;
                js_combined.push_str(&js_content);
                js_combined.push('\n');
            }
            let mut js = close_script_regex.replace_all(&js_combined, "<\\/script").to_string();
            js = logo_ref_regex.replace_all(&js, logo_data.as_str()).to_string();

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
