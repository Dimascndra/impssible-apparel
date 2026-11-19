#!/usr/bin/env bash
set -e

BASE_INTERNAL="http://127.0.0.1:18897"
BASE_PUBLIC="http://127.0.0.1:18898"

echo "=== 1. Health Check ==="
curl -sf "$BASE_INTERNAL/api/health" | jq .
curl -sf "$BASE_PUBLIC/api/health" | jq .

echo -e "\n=== 2. UI Pages Inlining Check ==="
echo -n "Checking /instruksi... "
curl -sf "$BASE_INTERNAL/instruksi" | grep -q "IA_ADMIN_MODE=\"internal\"" && echo "OK (Inlined Admin Internal)"
echo -n "Checking /katalog... "
curl -sf "$BASE_PUBLIC/katalog" | grep -q "Katalog Impossible" && echo "OK (Inlined Public Catalog)"
echo -n "Checking /login... "
curl -sf "$BASE_PUBLIC/login" | grep -q "login-page" && echo "OK (Inlined Login Page)"

echo -e "\n=== 3. Public Catalog & Activity ==="
echo "Catalog Products Count:"
curl -sf "$BASE_PUBLIC/api/public/catalog" | jq '.products | length'
echo "Live Activity Events Count:"
curl -sf "$BASE_PUBLIC/api/public/activity" | jq '.events | length'

echo -e "\n=== 4. Master Data (Internal) ==="
echo "Raw Materials Count:"
curl -sf "$BASE_INTERNAL/api/raw-materials" | jq '.raw_materials | length'
echo "Order Types Count:"
curl -sf "$BASE_INTERNAL/api/order-types" | jq '.order_types | length'

echo -e "\n=== 5. Jobs & SPK (Internal) ==="
echo "Jobs Count:"
curl -sf "$BASE_INTERNAL/api/jobs" | jq '.jobs | length'
echo "First Job Customer & Product:"
curl -sf "$BASE_INTERNAL/api/jobs" | jq '.jobs[0] | {id, spk, customer, product, costing}'

echo -e "\n=== 6. Finance & Invoices (Internal) ==="
echo "Invoices Count:"
curl -sf "$BASE_INTERNAL/api/invoices" | jq '.invoices | length'
echo "Cashflow Balance:"
curl -sf "$BASE_INTERNAL/api/cashflow" | jq '.summary'

echo -e "\n=== 7. Authentication (Public Gateway) ==="
COOKIE_JAR="/tmp/imp_cookies.txt"
rm -f "$COOKIE_JAR"

echo "Login Admin:"
LOGIN_RES=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE_PUBLIC/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"d.candra","password":"impossible2026!"}')
echo "$LOGIN_RES" | jq .

echo "Verifikasi /api/auth/me:"
curl -s -b "$COOKIE_JAR" "$BASE_PUBLIC/api/auth/me" | jq .

echo -e "\n=== 8. Customer Portal & Vector PDF Generation ==="
CUST_JAR="/tmp/imp_cust_cookies.txt"
rm -f "$CUST_JAR"

echo "Login Customer (SPK bos erik):"
curl -s -c "$CUST_JAR" -X POST "$BASE_PUBLIC/api/public/customer/login" \
  -H "Content-Type: application/json" \
  -d '{"spk":"SPK-20261015-90875","code":"12D2A03E"}' | jq .

echo "Summary Customer:"
curl -s -b "$CUST_JAR" "$BASE_PUBLIC/api/public/customer/summary" | jq '{job: .job.spk, customer: .job.customer, invoices: (.invoices | length), history_steps: (.history | length)}'

echo "Generate Invoice PDF via Rust printpdf:"
curl -s -b "$CUST_JAR" "$BASE_PUBLIC/api/public/customer/invoices/3/pdf" -o /tmp/test_invoice.pdf
file /tmp/test_invoice.pdf

echo "Generate Kwitansi PDF via Rust printpdf:"
curl -s "$BASE_INTERNAL/api/invoices/3/pdf?type=kwitansi" -o /tmp/test_kwitansi.pdf
file /tmp/test_kwitansi.pdf

echo -e "\n=== SEMUA PENGUJIAN CURL SELESAI DENGAN SUKSES ==="
