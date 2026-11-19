#!/usr/bin/env bash
set -e

PORT="${APP_PORT:-8897}"
BASE_URL="http://127.0.0.1:${PORT}"
COOKIE_JAR_ADMIN="/tmp/impossible_admin_cookies.txt"
COOKIE_JAR_DESIGN="/tmp/impossible_design_cookies.txt"
COOKIE_JAR_CUSTOMER="/tmp/impossible_customer_cookies.txt"
rm -f "$COOKIE_JAR_ADMIN" "$COOKIE_JAR_DESIGN" "$COOKIE_JAR_CUSTOMER"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "  [${GREEN}PASS${NC}] $1"; }
fail() { echo -e "  [${RED}FAIL${NC}] $1"; exit 1; }
info() { echo -e "${BLUE}==>${NC} ${YELLOW}$1${NC}"; }

info "1. PENGUJIAN HALAMAN PUBLIK & PUBLIC API (TANPA LOGIN)"
# GET / -> 200 OK
CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/")
[ "$CODE" = "200" ] && pass "GET / mengembalikan 200 OK (Public Landing)" || fail "GET / mengembalikan $CODE"

# GET /katalog -> 200 OK
CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/katalog")
[ "$CODE" = "200" ] && pass "GET /katalog mengembalikan 200 OK" || fail "GET /katalog mengembalikan $CODE"

# GET /cek-pesanan -> 200 OK
CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/cek-pesanan")
[ "$CODE" = "200" ] && pass "GET /cek-pesanan mengembalikan 200 OK" || fail "GET /cek-pesanan mengembalikan $CODE"

# GET /login -> 200 OK
CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/login")
[ "$CODE" = "200" ] && pass "GET /login mengembalikan 200 OK" || fail "GET /login mengembalikan $CODE"

# GET /api/health -> 200 OK + version
HEALTH_RES=$(curl -s "${BASE_URL}/api/health")
OK_VAL=$(echo "$HEALTH_RES" | grep -o '"ok":true' || true)
[ -n "$OK_VAL" ] && pass "GET /api/health mengembalikan ok:true" || fail "Health check failed: $HEALTH_RES"

# GET /api/public/catalog -> 200 OK
CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/public/catalog")
[ "$CODE" = "200" ] && pass "GET /api/public/catalog mengembalikan 200 OK" || fail "Catalog public failed: $CODE"

info "2. PENGUJIAN REDIRECTION 302 & PROTEKSI AKSES TANPA SESI"
# GET /instruksi tanpa login -> 302 Found to /login
RES_HEADER=$(curl -s -I "${BASE_URL}/instruksi")
HTTP_STATUS=$(echo "$RES_HEADER" | grep -i "^HTTP" | awk '{print $2}')
LOCATION=$(echo "$RES_HEADER" | grep -i "^location:" | awk '{print $2}' | tr -d '\r\n')
[ "$HTTP_STATUS" = "302" ] && [ "$LOCATION" = "/login" ] && pass "GET /instruksi tanpa login -> 302 redirect ke /login" || fail "GET /instruksi: status=$HTTP_STATUS location=$LOCATION"

# GET /admin tanpa login -> 302 Found to /login
RES_HEADER=$(curl -s -I "${BASE_URL}/admin")
HTTP_STATUS=$(echo "$RES_HEADER" | grep -i "^HTTP" | awk '{print $2}')
LOCATION=$(echo "$RES_HEADER" | grep -i "^location:" | awk '{print $2}' | tr -d '\r\n')
[ "$HTTP_STATUS" = "302" ] && [ "$LOCATION" = "/login" ] && pass "GET /admin tanpa login -> 302 redirect ke /login" || fail "GET /admin: status=$HTTP_STATUS location=$LOCATION"

# GET /desain tanpa login -> 302 Found to /login
RES_HEADER=$(curl -s -I "${BASE_URL}/desain")
HTTP_STATUS=$(echo "$RES_HEADER" | grep -i "^HTTP" | awk '{print $2}')
LOCATION=$(echo "$RES_HEADER" | grep -i "^location:" | awk '{print $2}' | tr -d '\r\n')
[ "$HTTP_STATUS" = "302" ] && [ "$LOCATION" = "/login" ] && pass "GET /desain tanpa login -> 302 redirect ke /login" || fail "GET /desain: status=$HTTP_STATUS location=$LOCATION"

# GET /api/admin/jobs tanpa auth -> 401 Unauthorized
CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/admin/jobs")
[ "$CODE" = "401" ] && pass "GET /api/admin/jobs tanpa auth -> 401 Unauthorized" || fail "GET /api/admin/jobs status=$CODE"

# GET /api/jobs tanpa auth -> 401 Unauthorized
CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/jobs")
[ "$CODE" = "401" ] && pass "GET /api/jobs tanpa auth -> 401 Unauthorized" || fail "GET /api/jobs status=$CODE"

# POST /api/admin/invoices tanpa auth -> 401 Unauthorized
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/api/admin/invoices" -H "Content-Type: application/json" -d '{}')
[ "$CODE" = "401" ] && pass "POST /api/admin/invoices tanpa auth -> 401 Unauthorized" || fail "POST status=$CODE"

info "3. PENGUJIAN PROTEKSI BRUTE FORCE RATE LIMITING"
# Simulasikan 10 percobaan login gagal beruntun dengan IP dummy (via header X-Forwarded-For agar tidak memblokir test lain)
TEST_BRUTE_IP="198.51.100.99"
for i in {1..10}; do
  curl -s -o /dev/null -X POST "${BASE_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: ${TEST_BRUTE_IP}" \
    -d '{"username":"hacker","password":"wrongpassword"}'
done
# Percobaan ke-11 harus mengembalikan 429 Too Many Requests
BRUTE_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-For: ${TEST_BRUTE_IP}" \
  -d '{"username":"hacker","password":"wrongpassword"}')
[ "$BRUTE_CODE" = "429" ] && pass "Percobaan login berulang ke-11 diblokir dengan HTTP 429 Too Many Requests!" || fail "Rate limit gagal: kode=$BRUTE_CODE"

info "4. PENGUJIAN LOGIN ADMIN & KEAMANAN COOKIE / CSRF"
# Login Admin
LOGIN_RES=$(curl -s -i -X POST "${BASE_URL}/api/auth/login" \
  -c "$COOKIE_JAR_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"username":"d.candra","password":"impossible2026!"}')

LOGIN_CODE=$(echo "$LOGIN_RES" | grep -i "^HTTP" | awk '{print $2}')
[ "$LOGIN_CODE" = "200" ] && pass "Login Admin d.candra sukses (200 OK)" || fail "Login admin gagal: $LOGIN_RES"

# Verifikasi Cookie HttpOnly & SameSite=Lax
COOKIE_HEADER=$(echo "$LOGIN_RES" | grep -i "set-cookie:" || true)
echo "$COOKIE_HEADER" | grep -qi "httponly" && pass "Cookie memiliki atribut HttpOnly" || fail "Cookie tidak memiliki HttpOnly!"
echo "$COOKIE_HEADER" | grep -qi "samesite=lax" && pass "Cookie memiliki atribut SameSite=Lax" || fail "Cookie tidak memiliki SameSite=Lax!"

# Ambil CSRF Token via /api/auth/me
ME_RES=$(curl -s -b "$COOKIE_JAR_ADMIN" "${BASE_URL}/api/auth/me")
ADMIN_CSRF=$(echo "$ME_RES" | sed -n 's/.*"csrf":"\([^"]*\)".*/\1/p')
ADMIN_ROLE=$(echo "$ME_RES" | sed -n 's/.*"role":"\([^"]*\)".*/\1/p')
[ "$ADMIN_ROLE" = "admin" ] && [ -n "$ADMIN_CSRF" ] && pass "Sesi admin aktif, CSRF token didapatkan: ${ADMIN_CSRF:0:8}..." || fail "/api/auth/me gagal: $ME_RES"

# Verifikasi akses halaman admin dengan cookie
CODE=$(curl -s -b "$COOKIE_JAR_ADMIN" -o /dev/null -w "%{http_code}" "${BASE_URL}/instruksi")
[ "$CODE" = "200" ] && pass "GET /instruksi dengan sesi Admin -> 200 OK" || fail "GET /instruksi gagal: $CODE"

CODE=$(curl -s -b "$COOKIE_JAR_ADMIN" -o /dev/null -w "%{http_code}" "${BASE_URL}/admin")
[ "$CODE" = "200" ] && pass "GET /admin dengan sesi Admin -> 200 OK" || fail "GET /admin gagal: $CODE"

# Uji CSRF Guard: Mutasi POST tanpa CSRF token -> 403 Forbidden
CSRF_REJECT=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/api/admin/raw-materials" \
  -b "$COOKIE_JAR_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Kain Uji Tanpa CSRF","unit":"meter","unit_price":25000,"note":"test"}')
[ "$CSRF_REJECT" = "403" ] && pass "Mutasi POST tanpa X-CSRF-Token ditolak dengan 403 Forbidden" || fail "CSRF bypass terdeteksi! Kode=$CSRF_REJECT"

# Uji CSRF Guard: Mutasi POST dengan CSRF token palsu -> 403 Forbidden
CSRF_FAKE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/api/admin/raw-materials" \
  -b "$COOKIE_JAR_ADMIN" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: token_palsu_123" \
  -d '{"name":"Kain Uji CSRF Palsu","unit":"meter","unit_price":25000,"note":"test"}')
[ "$CSRF_FAKE" = "403" ] && pass "Mutasi POST dengan X-CSRF-Token palsu ditolak dengan 403 Forbidden" || fail "CSRF palsu lolos! Kode=$CSRF_FAKE"

info "5. PENGUJIAN PARITAS ALUR BISNIS LENGKAP"

# A. Buat Master Bahan Baku (Raw Material)
TIMESTAMP=$(date +%s)
RM_NAME="Kain Dryfit Hexagon ${TIMESTAMP}"
RM_RES=$(curl -s -X POST "${BASE_URL}/api/admin/raw-materials" \
  -b "$COOKIE_JAR_ADMIN" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: ${ADMIN_CSRF}" \
  -d "{\"name\":\"${RM_NAME}\",\"unit\":\"meter\",\"unit_price\":35000,\"note\":\"Bahan premium breathable\"}")
RM_ID=$(echo "$RM_RES" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -n 1)
[ -n "$RM_ID" ] && pass "Bahan Baku berhasil dibuat (ID: $RM_ID, Nama: $RM_NAME)" || fail "Gagal membuat bahan baku: $RM_RES"

# B. Buat Master Jenis Order (Order Type dengan komposisi bahan baku & HPP otomatis)
OT_NAME="Jersey Futsal Full Printing ${TIMESTAMP}"
OT_RES=$(curl -s -X POST "${BASE_URL}/api/admin/order-types" \
  -b "$COOKIE_JAR_ADMIN" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: ${ADMIN_CSRF}" \
  -d "{\"name\":\"${OT_NAME}\",\"output_unit\":\"pcs\",\"selling_price\":150000,\"note\":\"Paket atasan full print\",\"materials\":[{\"raw_material_id\":${RM_ID},\"qty\":1.5}]}")
OT_ID=$(echo "$OT_RES" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -n 1)
[ -n "$OT_ID" ] && pass "Jenis Order berhasil dibuat (ID: $OT_ID, Nama: $OT_NAME)" || fail "Gagal membuat jenis order: $OT_RES"

# C. Buat SPK / Job Baru (HPP terhitung otomatis dari bahan baku, terbit SPK & customer_code 8 digit)
JOB_RES=$(curl -s -X POST "${BASE_URL}/api/admin/jobs" \
  -b "$COOKIE_JAR_ADMIN" \
  -H "X-CSRF-Token: ${ADMIN_CSRF}" \
  -F "customer=FC Livasya Juara" \
  -F "instruction_type=INSTRUKSI BIASA" \
  -F "order_type_id=${OT_ID}" \
  -F "product=${OT_NAME}" \
  -F "qty=24" \
  -F "deadline=2026-12-01" \
  -F "priority=URGENT" \
  -F "note=Logo bordir dada kiri, nama nomor punggung warna emas.")

JOB_ID=$(echo "$JOB_RES" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -n 1)
SPK_NO=$(echo "$JOB_RES" | sed -n 's/.*"spk":"\([^"]*\)".*/\1/p' | head -n 1)
CUST_CODE=$(echo "$JOB_RES" | sed -n 's/.*"customer_code":"\([^"]*\)".*/\1/p' | head -n 1)
HPP_UNIT=$(echo "$JOB_RES" | sed -n 's/.*"hpp_unit":\([0-9]*\).*/\1/p' | head -n 1)

[ -n "$JOB_ID" ] && [ -n "$SPK_NO" ] && [ -n "$CUST_CODE" ] && [ "$HPP_UNIT" -gt 0 ] && \
  pass "SPK berhasil dibuat: SPK=${SPK_NO}, ID=${JOB_ID}, CustomerCode=${CUST_CODE}, HPP=${HPP_UNIT}/pcs" || \
  fail "Gagal membuat SPK: $JOB_RES"

# D. Uji Kirim Pesan Internal SPK (Chat Instruksi)
MSG_RES=$(curl -s -X POST "${BASE_URL}/api/admin/jobs/${JOB_ID}/messages" \
  -b "$COOKIE_JAR_ADMIN" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: ${ADMIN_CSRF}" \
  -d '{"body":"Mohon prioritas desain, mockup selesai sebelum jam 15:00."}')
echo "$MSG_RES" | grep -qi "message" && pass "Pesan internal SPK berhasil terkirim" || fail "Kirim pesan SPK gagal: $MSG_RES"

# E. Uji Alur Tracking Produksi (8 Tahapan: DESAIN -> APPROVAL -> PRINTING -> PRESS -> JAHIT -> QC -> PACKING -> SELESAI)
for STAGE in "DESAIN" "APPROVAL" "PRINTING" "PRESS" "JAHIT" "QC" "PACKING" "SELESAI"; do
  TRK_RES=$(curl -s -X POST "${BASE_URL}/api/admin/tracking/${JOB_ID}" \
    -b "$COOKIE_JAR_ADMIN" \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: ${ADMIN_CSRF}" \
    -d "{\"stage\":\"${STAGE}\",\"note\":\"Proses ${STAGE} selesai dan diverifikasi.\",\"actor\":\"Supervisor\"}")
  echo "$TRK_RES" | grep -qi "job" || fail "Tracking stage $STAGE gagal: $TRK_RES"
done
pass "Semua 8 tahapan tracking produksi berhasil dicatat (100% Progress Selesai)"

# F. Uji Alur Keuangan: Buat Invoice
INV_RES=$(curl -s -X POST "${BASE_URL}/api/admin/invoices" \
  -b "$COOKIE_JAR_ADMIN" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: ${ADMIN_CSRF}" \
  -d "{\"job_id\":${JOB_ID},\"customer\":\"FC Livasya Juara\",\"address\":\"Majalengka, Jawa Barat\",\"invoice_date\":\"2026-11-20\",\"due_date\":\"2026-11-27\",\"discount\":50000,\"shipping\":25000,\"paid\":0,\"notes\":\"DP 50%\",\"items\":[{\"description\":\"Jersey Futsal Full Print\",\"qty\":24,\"price\":150000}]}")
INV_ID=$(echo "$INV_RES" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -n 1)
INV_NO=$(echo "$INV_RES" | sed -n 's/.*"invoice_no":"\([^"]*\)".*/\1/p' | head -n 1)
[ -n "$INV_ID" ] && [ -n "$INV_NO" ] && pass "Invoice berhasil terbit: ${INV_NO} (ID: ${INV_ID})" || fail "Buat invoice gagal: $INV_RES"

# G. Uji Catat Pembayaran & Kwitansi Bertahap
PAY_RES=$(curl -s -X POST "${BASE_URL}/api/admin/invoices/${INV_ID}/payments" \
  -b "$COOKIE_JAR_ADMIN" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: ${ADMIN_CSRF}" \
  -d "{\"amount\":1800000,\"date\":\"2026-11-20\",\"method\":\"TRANSFER BCA\",\"note\":\"Uang Muka 50%\"}")
echo "$PAY_RES" | grep -qi "KWT-" && pass "Pembayaran tercatat & otomatis terbit Nomor Kwitansi: $(echo "$PAY_RES" | grep -o 'KWT-[^"]*')" || fail "Pembayaran gagal: $PAY_RES"

# H. Uji Cetak PDF Vektor Invoice & Kwitansi
INV_PDF_HEADER=$(curl -s "${BASE_URL}/api/admin/invoices/${INV_ID}/pdf?type=invoice" -b "$COOKIE_JAR_ADMIN" | head -c 4)
[ "$INV_PDF_HEADER" = "%PDF" ] && pass "Cetak PDF Vektor Invoice valid (%PDF)" || fail "Invoice PDF gagal: header='$INV_PDF_HEADER'"

KWT_PDF_HEADER=$(curl -s "${BASE_URL}/api/admin/invoices/${INV_ID}/pdf?type=kwitansi" -b "$COOKIE_JAR_ADMIN" | head -c 4)
[ "$KWT_PDF_HEADER" = "%PDF" ] && pass "Cetak PDF Vektor Kwitansi valid (%PDF)" || fail "Kwitansi PDF gagal: header='$KWT_PDF_HEADER'"

# I. Uji Catat Cashflow Pengeluaran
CF_RES=$(curl -s -X POST "${BASE_URL}/api/admin/cashflow/expenses" \
  -b "$COOKIE_JAR_ADMIN" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: ${ADMIN_CSRF}" \
  -d "{\"job_id\":${JOB_ID},\"category\":\"BAHAN BAKU\",\"amount\":840000,\"date\":\"2026-11-20\",\"description\":\"Pembelian kain dryfit roll\"}")
echo "$CF_RES" | grep -qi "expense" && pass "Pencatatan cashflow pengeluaran sukses" || fail "Cashflow gagal: $CF_RES"

# J. Uji Manajemen Katalog & Publikasi
CAT_RES=$(curl -s -X POST "${BASE_URL}/api/admin/catalog" \
  -b "$COOKIE_JAR_ADMIN" \
  -H "X-CSRF-Token: ${ADMIN_CSRF}" \
  -F "name=Koleksi Jersey Custom 2026" \
  -F "slug=jersey-custom-2026-${TIMESTAMP}" \
  -F "category_name=JERSEY" \
  -F "price=150000" \
  -F "description=Jersey futsal dan sepakbola premium anti gerah." \
  -F "status=PUBLISH")
echo "$CAT_RES" | grep -qi "product" && pass "Produk katalog berhasil dibuat dan dipublikasikan" || fail "Buat katalog gagal: $CAT_RES"

info "6. PENGUJIAN ROLE DESAIN & SENSOR DATA RAHASIA"
# Login Desain
DESIGN_LOGIN=$(curl -s -i -X POST "${BASE_URL}/api/auth/login" \
  -c "$COOKIE_JAR_DESIGN" \
  -H "Content-Type: application/json" \
  -d '{"username":"desain","password":"impossible2026!"}')
DESIGN_CODE=$(echo "$DESIGN_LOGIN" | grep -i "^HTTP" | awk '{print $2}')
[ "$DESIGN_CODE" = "200" ] && pass "Login Desainer sukses (200 OK)" || fail "Login desainer gagal: $DESIGN_LOGIN"

# Ambil CSRF Desain
DESIGN_ME=$(curl -s -b "$COOKIE_JAR_DESIGN" "${BASE_URL}/api/auth/me")
DESIGN_CSRF=$(echo "$DESIGN_ME" | sed -n 's/.*"csrf":"\([^"]*\)".*/\1/p')
DESIGN_ROLE=$(echo "$DESIGN_ME" | sed -n 's/.*"role":"\([^"]*\)".*/\1/p')
[ "$DESIGN_ROLE" = "design" ] && pass "Sesi role design terverifikasi" || fail "Role mismatch: $DESIGN_ME"

# Desain buka /desain -> 200 OK
CODE=$(curl -s -b "$COOKIE_JAR_DESIGN" -o /dev/null -w "%{http_code}" "${BASE_URL}/desain")
[ "$CODE" = "200" ] && pass "Desainer dapat membuka /desain (200 OK)" || fail "Buka /desain gagal: $CODE"

# Desain buka /instruksi -> 302 Redirect ke /login (Ditolak)
CODE=$(curl -s -b "$COOKIE_JAR_DESIGN" -o /dev/null -w "%{http_code}" "${BASE_URL}/instruksi")
[ "$CODE" = "302" ] && pass "Desainer ditolak mengakses /instruksi -> 302 Redirect" || fail "Desain bisa buka /instruksi: $CODE"

# Desain akses API Admin -> 403 Forbidden
CODE=$(curl -s -b "$COOKIE_JAR_DESIGN" -o /dev/null -w "%{http_code}" "${BASE_URL}/api/admin/jobs")
[ "$CODE" = "403" ] && pass "Desainer ditolak mengakses /api/admin/jobs (403 Forbidden)" || fail "Desain bisa akses admin jobs: $CODE"

# Sensor Data: Desain ambil /api/jobs -> pastikan hpp_unit & customer_code tidak bocor
JOBS_FOR_DESIGN=$(curl -s -b "$COOKIE_JAR_DESIGN" "${BASE_URL}/api/jobs")
TARGET_JOB_DESIGN=$(echo "$JOBS_FOR_DESIGN" | grep -o "{\"id\":${JOB_ID},[^}]*}" || true)
echo "$TARGET_JOB_DESIGN" | grep -q "hpp_unit" && fail "Kebocoran data! HPP unit bocor ke Desainer: $TARGET_JOB_DESIGN" || pass "Data sensor aman: HPP unit TIDAK dikirim ke Desainer"
echo "$TARGET_JOB_DESIGN" | grep -q "customer_code" && fail "Kebocoran data! Customer code bocor ke Desainer: $TARGET_JOB_DESIGN" || pass "Data sensor aman: Customer code TIDAK dikirim ke Desainer"

# Desainer perbarui status & PIC via PATCH /api/jobs/:id
PATCH_RES=$(curl -s -X PATCH "${BASE_URL}/api/jobs/${JOB_ID}" \
  -b "$COOKIE_JAR_DESIGN" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: ${DESIGN_CSRF}" \
  -d '{"status":"PROSES","designer":"Andi Desain","computer":"PC-DESAIN-01"}')
echo "$PATCH_RES" | grep -qi "Andi Desain" && pass "Desainer berhasil update status, PIC Desain, & Komputer kerja" || fail "Update job oleh desainer gagal: $PATCH_RES"

# Desainer kirim pesan chat
DMSG_RES=$(curl -s -X POST "${BASE_URL}/api/jobs/${JOB_ID}/messages" \
  -b "$COOKIE_JAR_DESIGN" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: ${DESIGN_CSRF}" \
  -d '{"body":"Mockup CorelDraw sedang diproses."}')
echo "$DMSG_RES" | grep -qi "message" && pass "Desainer berhasil mengirim pesan chat SPK" || fail "Pesan desainer gagal: $DMSG_RES"

# Desainer unggah file CorelDraw (.cdr)
TMP_CDR="/tmp/test_desain_${TIMESTAMP}.cdr"
echo "RIFF-COREL-DRAW-VECTOR-MOCK-BINARY" > "$TMP_CDR"
UPLOAD_RES=$(curl -s -X POST "${BASE_URL}/api/jobs/${JOB_ID}/upload/cdr" \
  -b "$COOKIE_JAR_DESIGN" \
  -H "X-CSRF-Token: ${DESIGN_CSRF}" \
  -F "files=@${TMP_CDR};filename=desain_final_${TIMESTAMP}.cdr")
rm -f "$TMP_CDR"
echo "$UPLOAD_RES" | grep -qi "desain_final" && pass "Desainer berhasil mengunggah file CorelDraw (.cdr)" || fail "Upload CDR gagal: $UPLOAD_RES"

info "7. PENGUJIAN CUSTOMER PORTAL (CEK PESANAN MANDIRI)"
# Login Customer via SPK + Kode Akses 8 karakter
CUST_LOGIN=$(curl -s -i -X POST "${BASE_URL}/api/public/customer/login" \
  -c "$COOKIE_JAR_CUSTOMER" \
  -H "Content-Type: application/json" \
  -d "{\"spk\":\"${SPK_NO}\",\"code\":\"${CUST_CODE}\"}")
CUST_LCODE=$(echo "$CUST_LOGIN" | grep -i "^HTTP" | awk '{print $2}')
[ "$CUST_LCODE" = "200" ] && pass "Customer berhasil login dengan SPK ${SPK_NO} dan Kode Akses ${CUST_CODE}" || fail "Customer login gagal: $CUST_LOGIN"

# Ambil ringkasan pesanan customer
CUST_SUM=$(curl -s -b "$COOKIE_JAR_CUSTOMER" "${BASE_URL}/api/public/customer/summary")
CUST_STAGE=$(echo "$CUST_SUM" | sed -n 's/.*"stage":"\([^"]*\)".*/\1/p' | head -n 1)
[ "$CUST_STAGE" = "SELESAI" ] && pass "Customer melihat status produksi real-time: SELESAI (100%)" || fail "Customer summary gagal: $CUST_SUM"

# Customer unduh PDF invoice resmi
CUST_PDF=$(curl -s -b "$COOKIE_JAR_CUSTOMER" "${BASE_URL}/api/public/customer/invoices/${INV_ID}/pdf" | head -c 4)
[ "$CUST_PDF" = "%PDF" ] && pass "Customer berhasil mengunduh dokumen PDF Invoice resmi" || fail "Customer PDF invoice gagal: header='$CUST_PDF'"

# Customer logout
CUST_LOGOUT=$(curl -s -X POST "${BASE_URL}/api/public/customer/logout" -b "$COOKIE_JAR_CUSTOMER")
echo "$CUST_LOGOUT" | grep -qi "ok" && pass "Customer berhasil logout dari portal" || fail "Customer logout gagal: $CUST_LOGOUT"

rm -f "$COOKIE_JAR_ADMIN" "$COOKIE_JAR_DESIGN" "$COOKIE_JAR_CUSTOMER"

echo ""
echo -e "${GREEN}========================================================================${NC}"
echo -e "${GREEN}  SEMUA PENGUJIAN KEAMANAN & PARITAS ALUR BISNIS 100% SUKSES & VALID!   ${NC}"
echo -e "${GREEN}========================================================================${NC}"
