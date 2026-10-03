# HeartMatch Security Hardening

This build applies production hardening while preserving the existing UI and API structure.

## High
- Production CORS is restricted to `APP_URL`/`RENDER_EXTERNAL_URL` plus local development origins.
- Socket.IO CORS is restricted the same way.
- JWTs now include a per-user `tokenVersion` and default to a 2-hour lifetime (`JWT_EXPIRES_IN` can be configured).
- Password changes and password resets increment `tokenVersion`, invalidating previously issued sessions.
- Profile uploads verify JPEG/PNG/WebP file signatures in addition to MIME type and the 5 MB size limit.
- Socket message/typing events have basic abuse throttling.

## Medium
- Global API rate limiting plus stricter login/signup/password-reset limits.
- `/api/turn-config` requires authentication.
- Helmet CSP and security headers are enabled; inline scripts remain allowed because the existing app uses inline scripts.
- Request bodies are capped at 1 MB.

## Low
- Explicit CSP restrictions for objects, frames, form actions, and resource origins.
- `/health` endpoint remains available for Render health checks.
- Secrets remain environment variables and are not committed.

## Render variables
Required:
- `MONGO_URI`
- `JWT_SECRET`
- `APP_URL`

Optional:
- `JWT_EXPIRES_IN` (default `2h`)
- SMTP variables for email
- TURN variables for WebRTC
- `ADMIN_EMAIL` for the existing bootstrap-admin behavior

## Important limitation
The frontend still uses bearer access tokens in browser storage for compatibility with the existing pages and Socket.IO client. A future major security revision can migrate authentication fully to short-lived in-memory access tokens plus HttpOnly refresh cookies.
