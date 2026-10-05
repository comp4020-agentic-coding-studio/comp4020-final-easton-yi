# ADR-0005 · Opaque server sessions, owner/editor roles checked in the coordinator

Status: accepted (P1/P3).

**Context.** AUTH-01..05: accounts without email, invitations, removal that
takes effect immediately, private works, public frozen exhibits.

**Decision.** Handle + display name + password (async scrypt with stored
parameters; N=2^15, r=8, p=3 after M-004), and a one-use recovery code stored
only as a digest. Sessions are opaque 32-byte tokens in an HttpOnly,
SameSite=Lax cookie (Secure in production), stored as SHA-256 digests, with
30-day absolute and 7-day idle expiry. Mutations need the same Origin and a
per-session CSRF token; the WebSocket checks Origin and the cookie on upgrade,
then needs the CSRF token as its first message. Every privileged operation
re-reads membership in coordinator order. Non-members get the same 404 as
"doesn't exist". One active invitation per work (hashed, 7 days, 3 distinct
accounts, token in the URL fragment). Editing is a per-account lease, so a
second window observes until it takes over.

**Rejected.** JWT or localStorage tokens: they can't be revoked instantly and
they're exposed to scripts. Email recovery: it needs an external service the
course setup doesn't have.

**Cost.** Losing both the password and the recovery code means losing the
account, and the UI says so. Hash cost is bounded by memory (one hash at a
time; logins queue, p95 1.2 s under a 9-login storm, M-006).
