# nginx-proxy-manager rate limiting (§25) — complementary reverse-proxy layer

**Status: documented, NOT yet applied.** Requires the real VPS/
`nginx-proxy-manager` instance from deferred task 0.8/4.7 (see
`pb_migrations/README.md`) — cannot be tested live in this session.

## Why this exists alongside PocketBase's own native rate limiter

Phase 4 task 4.3's primary, **tested and live-verified** fix is
PocketBase's own built-in rate limiter
(`pb_migrations/1787760050_rate_limiting_settings.js`) — SDD.md §25's
premise that PocketBase has no built-in per-endpoint rate limiting turned
out to be wrong for v0.40.1. That fix alone already satisfies §25's real
goal (mitigating brute force against login and API abuse) at the
application layer, with zero dependency on the VPS.

This document is the complementary, defense-in-depth layer §25 originally
asked for at the reverse-proxy level. It is still worth doing once the VPS
exists because:

- It rejects abusive traffic **before** it reaches the PocketBase process
  at all (saves CPU/DB work on pure floods, not just auth attempts).
- It is a second independent layer — if the PocketBase-level limiter is
  ever accidentally disabled (e.g. a future migration bug, a manual admin
  panel change), this layer still holds.

## Required first step: configure `trustedProxy` before relying on IP-based limits

Both this reverse-proxy layer AND PocketBase's own native limiter
(`app.settings().rateLimits`, which also buckets by client IP) depend on
PocketBase seeing the REAL client IP, not `nginx-proxy-manager`'s own IP.
Confirm and configure `app.settings().trustedProxy.headers` (e.g. trust
`X-Forwarded-For` from `nginx-proxy-manager`'s actual container/host IP)
as part of the real VPS deployment (task 0.8/4.7) — this cannot be set
correctly without knowing the real network topology, so it is
intentionally not guessed in `pb_migrations/1787760050_rate_limiting_settings.js`.
Without this, every request could appear to originate from the same IP
(the proxy's), and ANY IP-keyed rate limit — this one or PocketBase's own
— would throttle all 6 real users off a single shared bucket instead of
limiting each abusive source individually.

## Custom Nginx Configuration snippets

`nginx-proxy-manager` (NPM) supports two extension points relevant here:

1. **`/data/nginx/custom/http_top.conf`** — included inside NPM's
   generated `http {}` block. `limit_req_zone` directives MUST live here
   (they are only valid at the `http` context level, not per-server).
2. **Proxy Host → Edit → Advanced → "Custom Nginx Configuration"** —
   injected inside that specific proxy host's `server {}` block. This is
   where the actual `limit_req` directives go, scoped per route.

### `http_top.conf` (shared zones, define once)

```nginx
# Rate limiting zones (SDD.md §25) — shared across all insumoso2 proxy
# hosts. Keyed by client IP (requires trustedProxy configured correctly
# above, or these effectively key by the proxy's own IP instead).
limit_req_zone $binary_remote_addr zone=insumoso2_auth:10m rate=20r/m;
limit_req_zone $binary_remote_addr zone=insumoso2_api:10m rate=120r/m;
```

### `api.insumoso2.com` proxy host → Advanced → Custom Nginx Configuration

```nginx
location /api/collections/users/auth-with-password {
    limit_req zone=insumoso2_auth burst=5 nodelay;
    limit_req_status 429;
    proxy_pass $forward_scheme://$server:$port;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /api/ {
    limit_req zone=insumoso2_api burst=30 nodelay;
    limit_req_status 429;
    proxy_pass $forward_scheme://$server:$port;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

**Caveats, to resolve when this is actually applied (not guessable now):**

- The exact `proxy_pass`/header directives above are the standard NPM
  reverse-proxy pattern, but MUST be checked against whatever NPM version
  is actually running on the VPS and its exact generated config for this
  proxy host (NPM auto-generates a base `location /` block per proxy host;
  these snippets add more specific `location` blocks, which nginx matches
  with higher precedence — verify there's no conflict once applied).
- Rate numbers here (`20r/m` auth, `120r/m` general) are a starting point
  matching the same reasoning as the PocketBase-level `*:auth` retune in
  `1787760050_rate_limiting_settings.js` (meaningfully protective without
  locking out a 6-user business) — tune based on real observed traffic
  once live.
- This layer and PocketBase's own native limiter are independent; neither
  depends on the other being correctly configured, but BOTH depend on
  `trustedProxy` (this layer implicitly, via nginx's own `$binary_remote_addr`
  needing the real client IP if load-balanced/chained further — not a
  concern for a single nginx-proxy-manager hop directly facing the
  internet, only relevant if another proxy sits in front of NPM itself).
