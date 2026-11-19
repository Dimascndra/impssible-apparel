use serde::Deserialize;
use serde_json::Value;
use sqlx::postgres::PgPoolOptions;
use std::fs::File;
use std::io::BufReader;
use std::path::PathBuf;

#[derive(Debug, Deserialize)]
struct AuthData {
    admin: Option<UserAuth>,
    design: Option<UserAuth>,
}

#[derive(Debug, Deserialize)]
struct UserAuth {
    username: Option<String>,
    hash: Option<String>,
    salt: Option<String>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _ = dotenvy::dotenv();
    let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| {
        "postgres://impossible_user:impossible_secure_pass_2026@localhost:5432/impossible_apparel".to_string()
    });

    let data_dir = std::env::var("IMP_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("data"));

    println!("Connecting to database {}...", database_url);
    let pool = PgPoolOptions::new().max_connections(5).connect(&database_url).await?;

    // 1. Auth import
    let auth_path = data_dir.join("auth.json");
    if auth_path.exists() {
        let f = File::open(&auth_path)?;
        let auth: AuthData = serde_json::from_reader(BufReader::new(f))?;

        if let Some(adm) = auth.admin {
            let u = adm.username.unwrap_or_else(|| "admin".to_string());
            let h = adm.hash.unwrap_or_default();
            let s = adm.salt.unwrap_or_default();
            sqlx::query(
                "INSERT INTO users (username, password_hash, salt, role) VALUES ($1, $2, $3, 'admin') ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, salt = EXCLUDED.salt"
            )
            .bind(u)
            .bind(h)
            .bind(s)
            .execute(&pool)
            .await?;
        }

        if let Some(des) = auth.design {
            let u = des.username.unwrap_or_else(|| "desain".to_string());
            let h = des.hash.unwrap_or_default();
            let s = des.salt.unwrap_or_default();
            sqlx::query(
                "INSERT INTO users (username, password_hash, salt, role) VALUES ($1, $2, $3, 'design') ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, salt = EXCLUDED.salt"
            )
            .bind(u)
            .bind(h)
            .bind(s)
            .execute(&pool)
            .await?;
        }
        println!("Auth users successfully migrated.");
    }

    // 2. Data import
    let db_path = data_dir.join("impossible-apparel.json");
    if db_path.exists() {
        let f = File::open(&db_path)?;
        let json_val: Value = serde_json::from_reader(BufReader::new(f))?;

        // Raw Materials
        if let Some(rms) = json_val["raw_materials"].as_array() {
            for rm in rms {
                let id = rm["id"].as_i64().unwrap_or(0);
                let name = rm["name"].as_str().unwrap_or_default();
                let unit = rm["unit"].as_str().unwrap_or("pcs");
                let price = rm["unit_price"].as_i64().unwrap_or(0);
                let note = rm["note"].as_str();

                sqlx::query(
                    r#"
                    INSERT INTO raw_materials (id, name, unit, unit_price, note)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (id) DO UPDATE
                    SET name = EXCLUDED.name, unit = EXCLUDED.unit, unit_price = EXCLUDED.unit_price, note = EXCLUDED.note
                    "#
                )
                .bind(id)
                .bind(name)
                .bind(unit)
                .bind(price)
                .bind(note)
                .execute(&pool)
                .await?;
            }
            sqlx::query("SELECT setval('raw_materials_id_seq', (SELECT COALESCE(MAX(id), 1) FROM raw_materials))").execute(&pool).await?;
            println!("Migrated {} raw materials.", rms.len());
        }

        // Order Types
        if let Some(ots) = json_val["order_types"].as_array() {
            for ot in ots {
                let id = ot["id"].as_i64().unwrap_or(0);
                let name = ot["name"].as_str().unwrap_or_default();
                let unit = ot["output_unit"].as_str().unwrap_or("pcs");
                let price = ot["selling_price"].as_i64().unwrap_or(0);
                let note = ot["note"].as_str();

                sqlx::query(
                    r#"
                    INSERT INTO order_types (id, name, output_unit, selling_price, note)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (id) DO UPDATE
                    SET name = EXCLUDED.name, output_unit = EXCLUDED.output_unit, selling_price = EXCLUDED.selling_price, note = EXCLUDED.note
                    "#
                )
                .bind(id)
                .bind(name)
                .bind(unit)
                .bind(price)
                .bind(note)
                .execute(&pool)
                .await?;

                if let Some(mats) = ot["materials"].as_array() {
                    for m in mats {
                        let rm_id = m["raw_material_id"].as_i64().unwrap_or(0);
                        let qty = m["qty"].as_f64().unwrap_or(1.0);
                        use std::str::FromStr;
                        let qty_dec = bigdecimal::BigDecimal::from_str(&qty.to_string()).unwrap_or_default();
                        sqlx::query(
                            "INSERT INTO order_type_materials (order_type_id, raw_material_id, qty) VALUES ($1, $2, $3) ON CONFLICT (order_type_id, raw_material_id) DO UPDATE SET qty = EXCLUDED.qty"
                        )
                        .bind(id)
                        .bind(rm_id)
                        .bind(qty_dec)
                        .execute(&pool)
                        .await?;
                    }
                }
            }
            sqlx::query("SELECT setval('order_types_id_seq', (SELECT COALESCE(MAX(id), 1) FROM order_types))").execute(&pool).await?;
            println!("Migrated {} order types.", ots.len());
        }

        // Jobs
        if let Some(jobs) = json_val["jobs"].as_array() {
            for j in jobs {
                let id = j["id"].as_i64().unwrap_or(0);
                let spk = j["spk"].as_str().unwrap_or_default();
                let customer = j["customer"].as_str().unwrap_or_default();
                let itype = j["instruction_type"].as_str().unwrap_or("INSTRUKSI BIASA");
                let ot_id = j["order_type_id"].as_i64();
                let product = j["product"].as_str().unwrap_or_default();
                let hpp_snap = j["hpp_unit_snapshot"].as_i64().unwrap_or(0);
                let sell_snap = j["selling_price_snapshot"].as_i64().unwrap_or(0);
                let mat_snap = &j["hpp_materials_snapshot"];
                let qty = j["qty"].as_i64().unwrap_or(1) as i32;
                let deadline = j["deadline"].as_str();
                let priority = j["priority"].as_str().unwrap_or("NORMAL");
                let status = j["status"].as_str().unwrap_or("MENUNGGU");
                let note = j["note"].as_str();
                let designer = j["designer"].as_str().unwrap_or_default();
                let computer = j["computer"].as_str().unwrap_or_default();
                let code = j["customer_code"].as_str().unwrap_or_default();

                sqlx::query(
                    r#"
                    INSERT INTO jobs (id, spk, customer, instruction_type, order_type_id, product,
                                      hpp_unit_snapshot, selling_price_snapshot, hpp_materials_snapshot,
                                      qty, deadline, priority, status, note, designer, computer, customer_code)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                    ON CONFLICT (id) DO UPDATE
                    SET spk = EXCLUDED.spk, customer = EXCLUDED.customer, status = EXCLUDED.status, updated_at = NOW()
                    "#
                )
                .bind(id)
                .bind(spk)
                .bind(customer)
                .bind(itype)
                .bind(ot_id)
                .bind(product)
                .bind(hpp_snap)
                .bind(sell_snap)
                .bind(mat_snap)
                .bind(qty)
                .bind(deadline)
                .bind(priority)
                .bind(status)
                .bind(note)
                .bind(designer)
                .bind(computer)
                .bind(code)
                .execute(&pool)
                .await?;
            }
            sqlx::query("SELECT setval('jobs_id_seq', (SELECT COALESCE(MAX(id), 1) FROM jobs))").execute(&pool).await?;
            println!("Migrated {} jobs.", jobs.len());
        }
    }

    println!("Migration complete!");
    Ok(())
}
