# HeartMatch Security Audit & Hardening — October 2026

## Scope
Audited the uploaded HeartMatch source, including Express APIs, MongoDB/Mongoose models,
JWT authentication, Socket.IO chat/WebRTC signaling, profile uploads, admin routes,
password reset/email verification, and browser-side data handling.

This is a source-code security review and hardening pass. It is not a penetration test
of a deployed production instance and cannot guarantee that no vulnerabilities remain.

## Findings and fixes

### A. Authentication
- Passwords were already hashed with bcrypt.
- JWT authentication was present.
- FIXED: JWTs now carry a `tokenVersion`; the server checks it on HTTP and Socket.IO.
- FIXED: password changes and password resets increment `tokenVersion`, invalidating old sessions.
- Login/signup/forgot-password are rate-limited.
- Remaining architectural risk: JWTs are stored in browser localStorage. An XSS vulnerability could steal them.
  A future migration to Secure/HttpOnly/SameSite cookies would reduce this risk.

### B. Authorization / IDOR
- Chat access already required a mutual match and block checks.
- WebRTC signaling already checked mutual matches.
- FIXED: online-status and typing events now require a valid mutual-match relationship and block checks.
- Admin routes use server-side `isAdmin` authorization.
- ObjectId validation is present on sensitive endpoints.

### C. CORS
- FIXED: wildcard CORS (`*`) was removed.
- Production now requires `ALLOWED_ORIGINS` (or `APP_URL`) to match the requesting origin.
- Development can remain permissive only when no allowlist is configured.

### D. CSRF
- The application uses bearer tokens rather than authentication cookies, so classic cookie CSRF is not the primary authentication mechanism.
- Do not switch to cookie authentication without adding CSRF protection.

### E. Database / MongoDB
- Mongoose schemas use strict fields/enums in key models.
- FIXED: public user queries no longer return email, admin flag, tokenVersion, preferences, or private chat backgrounds.
- FIXED: interests are capped and validated.
- Request body size is limited.
- Message content has a 5 MB schema ceiling.
- Database indexes exist for unique likes/blocks and expiring reset/verification records.

### F. Data exposure
- HIGH: Discover/Matches/Chat previously selected `-password` only, which still exposed email and other private fields.
- FIXED: public/match/chat responses now use privacy-safe projections.

### G. File upload
- Profile uploads are memory-limited to 5 MB and restricted to JPEG/PNG/WebP MIME types.
- FIXED: server now checks file magic bytes, not only the client-supplied MIME type.
- Profile images are stored in GridFS.
- Attachment data is now restricted to an explicit allowlist of media/file MIME types and data-URL format.
- Attachment payloads are capped.

### H. HTTP headers
- FIXED: Helmet security headers are enabled.
- FIXED: a baseline Content Security Policy is enabled.
- `frame-ancestors`, `object-src`, `base-uri`, and `form-action` are restricted.
- Note: the site still uses some inline scripts, so the CSP uses `unsafe-inline`. A nonce-based CSP would be stronger.

### I. Rate limiting / abuse
- FIXED: authentication endpoints are rate-limited.
- FIXED: state-changing `/api/*` traffic receives an API limiter.
- Socket.IO still deserves a dedicated distributed rate limiter for very high-traffic production deployments.

### J. Secrets
- No `.env` file is included in the secure delivery.
- Added `server/.env.example`.
- Production secrets must live in Render/environment variables, not source control.
- TURN credentials are expected from environment variables.
- The bundled `.git` history is excluded from the secure delivery ZIP so old commits are not accidentally shipped.

### K. TURN configuration
- FIXED: `/api/turn-config` now requires authentication.
- TURN credentials are not hard-coded in source.

### L. WebSocket authentication
- Socket.IO verifies JWTs and active accounts.
- FIXED: Socket.IO now also checks JWT `tokenVersion`, matching HTTP auth behavior.

### M. Message authorization
- Messages require a mutual match and block checks.
- Sender identity comes from the authenticated socket, not client input.
- Unsend verifies that the authenticated user is the sender.

### N. Notifications
- Notification creation is server-side.
- Notification messages use server-side user names rather than trusting client-supplied sender identity.

### O. Password reset
- Reset tokens are cryptographically random.
- Only SHA-256 hashes are stored.
- Tokens expire and are deleted after use.
- FIXED: successful reset invalidates existing JWT sessions.

### P. Profile/password changes
- FIXED: successful password change invalidates existing JWT sessions.
- Profile fields are allowlisted.
- User ID format and uniqueness are checked.

### Q. Privacy
- FIXED: email/private settings were being exposed by generic `-password` projections.
- Chat backgrounds are kept on the authenticated user's record and are not returned in public projections.

### R. Reporting
- Report reason is capped at 500 characters.
- Admin-only report management remains protected.

### S. Socket.IO payloads
- Maximum Socket.IO packet size reduced.
- Attachment data is validated before storage.
- Do not treat Socket.IO as trusted input: every event must continue to validate sender, target and payload.

### T. XSS
- Client code contains an escaping helper and several dynamic renderers use it.
- Attachment rendering is now backed by server-side MIME/data validation.
- CSP provides another layer.
- Residual risk: because some pages use inline JavaScript and `innerHTML`, future features must continue using `HM.esc()` for untrusted values.

### U. User IDs
- User ID format is restricted to lowercase letters, numbers, dot, underscore and hyphen.
- FIXED: fallback user-ID generation uses cryptographic randomness instead of `Math.random()`.

### V. WebRTC signaling
- Call offer/answer/ICE/reject/end events require a mutual match and no block.
- TURN configuration now requires authentication.
- Signaling is still metadata/signaling only; WebRTC media remains peer-to-peer.

### W. Account deletion
- User-related likes, blocks, messages, notifications, reports and token records are deleted.
- FIXED: account deletion now attempts to remove the user's GridFS profile-image object.

### X. Availability / abuse
- API and auth rate limits reduce straightforward brute-force/abuse traffic.
- For multi-instance Render deployment, in-memory rate limits are not shared between instances; use a shared limiter/store if scaling horizontally.

### Y. Dependencies
- `helmet`, `express-rate-limit`, bcrypt, JWT, Mongoose and Socket.IO are present.
- Run `npm audit` in the server directory before production deployment and keep the lockfile current.

### Z. Deployment checklist
1. Set `NODE_ENV=production`.
2. Set a long random `JWT_SECRET`.
3. Set `MONGO_URI` securely.
4. Set `APP_URL` to the HTTPS production origin.
5. Set `ALLOWED_ORIGINS` to the exact HTTPS frontend origin(s).
6. Set SMTP and TURN credentials only as environment variables.
7. Do not commit `.env`.
8. Use HTTPS.
9. Run `npm audit`.
10. Test two real accounts for authorization/IDOR, blocking, chat, calls, password reset, and account deletion.

## Feature update: Like notifications / Like Back
- When a user sends a `like` and there is no mutual like, the recipient receives a `type: like` notification.
- The notification contains only the sender's display name and links to the sender's profile; it does not expose email/private fields.
- Duplicate like notifications are prevented per sender/recipient pair.
- `GET /api/likes/status/:userId` is authenticated and reports only the relationship state needed by the profile UI.
- When viewing a profile of someone who already liked the current user, the Like button changes to **Like Back**.
- Clicking Like Back uses the existing authorized like endpoint; if the other user already liked the current user, the server creates the existing match flow.
