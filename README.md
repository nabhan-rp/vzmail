# VZ Mail (`mail.vz.gay`) & VZ Links (`links.vz.gay` / `*.imy.li`)

2-in-1 local-first email service (`@imy.li` with free Gmail-style `.` and `+` aliases) and static PSL-safe Link-in-Bio (`$USERNAME.imy.li`) + Shortlinks (`imy.li/s/$URL`), built for **Cloudflare Workers + Static Assets** with **Zero VPS** and **Zero Server Mailbox Retention**.

## Architecture

- **Frontend SPA (`src/`)**: React 19 + Vite 8 + Tailwind CSS v4, lazy-loaded workspaces, browser **IndexedDB** local storage, and **Web Crypto API** encrypted backups (PBKDF2-SHA256 310k + AES-256-GCM `.enc`, plus `.eml` & `.mbox`).
- **Unified Cloudflare Worker (`cloudflare/worker-mail-links.ts`)**:
  - Serves static SPA assets via `[assets]` binding (`./dist`) while bypassing the Worker for hashed `/assets/*` bundles.
  - Handles `/api/health`, `/api/mail/*` (Pop-and-Purge ephemeral transit queue & `env.SEND_EMAIL` outbound relay), `/api/links/*`, `/s/$SLUG` HTTP 301 redirects, and `$USERNAME.imy.li` zero-cookie PSL isolation.
  - Handles inbound Cloudflare Email Routing via `email(message, env, ctx)` with bounded streaming to stay safely within the 128 MB Worker memory budget.
- **Local Dev Server (`server.ts`)**: Express + Vite middleware for local development (`npm run dev`).

## Local Development

```bash
npm install
npm run dev        # Express + Vite dev server on http://localhost:3000
npm run lint       # Typecheck frontend + Worker + Express server
npm run build      # Build production SPA into ./dist
npm run cf:dry-run # Validate Cloudflare Workers bundle & wrangler.toml
npm run cf:dev     # Run locally inside the Cloudflare Workers runtime
```

## Cloudflare Workers Deployment (`vzmail`)

Cloudflare Workers Builds (`nabhan-rp/vzmail`):
- **Build command**: `npm run build`
- **Deploy command**: `npx wrangler deploy`
- **Worker name**: `vzmail` (matched in `wrangler.toml`)

### Optional Production Bindings

Uncomment in `wrangler.toml` after provisioning in your Cloudflare Dashboard:
1. `[[send_email]]` (`SEND_EMAIL`) — after onboarding `@imy.li` under **Compute > Email Service**.
2. `[[kv_namespaces]]` (`MAIL_TRANSIT_KV` and `LINKS_KV`) — for persistent ephemeral edge transit (auto-TTL 72h, purged immediately on client ACK) and live `/s/$SLUG` 301 redirects.
3. Optional shared API protection secret:
   ```bash
   npx wrangler secret put RELAY_AUTH_TOKEN
   ```
