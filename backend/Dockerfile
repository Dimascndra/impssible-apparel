# Multi-stage Dockerfile for impossible-apparel Rust Axum Backend
FROM rust:alpine AS builder

RUN apk add --no-cache musl-dev build-base openssl-dev

WORKDIR /app/backend

COPY backend/Cargo.toml backend/Cargo.lock ./
COPY backend/src/ ./src/

RUN cargo build --release --bin impossible-apparel --bin migrate-json

# Minimal Runtime Stage
FROM alpine:3.20 AS runtime

RUN apk add --no-cache ca-certificates tzdata fontconfig curl

WORKDIR /app

COPY --from=builder /app/backend/target/release/impossible-apparel /usr/local/bin/impossible-apparel
COPY --from=builder /app/backend/target/release/migrate-json /usr/local/bin/migrate-json

RUN mkdir -p /app/uploads /app/data /app/fonts /app/frontend

EXPOSE 80

ENTRYPOINT ["/usr/local/bin/impossible-apparel"]
