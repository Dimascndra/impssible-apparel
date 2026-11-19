use rand::RngCore;

pub fn verify_password(password: &str, salt_hex: &str, expected_hash_hex: &str) -> bool {
    let salt = match hex::decode(salt_hex) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let expected_hash = match hex::decode(expected_hash_hex) {
        Ok(h) => h,
        Err(_) => return false,
    };

    // Node.js crypto.scryptSync(password, salt, 64) uses default N=16384 (log_n=14), r=8, p=1, maxmem=32MB
    let params = match scrypt::Params::new(14, 8, 1, 64) {
        Ok(p) => p,
        Err(_) => return false,
    };

    let mut output = [0u8; 64];
    if scrypt::scrypt(password.as_bytes(), &salt, &params, &mut output).is_ok() {
        if bool::from(subtle::ConstantTimeEq::ct_eq(&output[..], &expected_hash[..])) {
            return true;
        }
    }

    false
}

pub fn hash_password(password: &str) -> (String, String) {
    let mut salt = [0u8; 24];
    rand::thread_rng().fill_bytes(&mut salt);
    let params = scrypt::Params::new(14, 8, 1, 64).unwrap();
    let mut output = [0u8; 64];
    scrypt::scrypt(password.as_bytes(), &salt, &params, &mut output).unwrap();
    (hex::encode(salt), hex::encode(output))
}
