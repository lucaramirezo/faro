# faro

**Lighthouse for your agents.** A single-user, file-native HTML control center for autonomous AI workloads.

> Status: **v0.1 — scaffold complete, MVP features incoming.** PRD: [`faro-prd.md`](./faro-prd.md).

## Stack

Bun 1.3+ (package manager + dev) · **Node 22+ (production runtime)** · Next.js 16 · React 19 · TypeScript · Tailwind v4 · shadcn/ui Luma preset · Biome · better-sqlite3 · Tremor · Framer Motion · Embla · cmdk

## Local development

```bash
cp .env.example .env.local
# edit .env.local — set FARO_OWNER_LOGIN to your email
bun install
bun run migrate
bun run dev
```

Open http://localhost:3000.

> **Note**: `bun run lint` excludes `components/ui/**` via `biome.json` — shadcn ships a11y warnings in its primitives. Don't "fix" the exclude.

## Production (on pei via Tailscale)

```bash
node .next/standalone/server.js   # systemd unit: /etc/systemd/system/faro.service
```

Listens on port `8766` on the loopback. Fronted by `tailscale serve --bg --https=8443 http://127.0.0.1:8766`:

- Service URL: <https://pei.taild21074.ts.net:8443/>
- Auth: Tailscale-User-Login header (Tailnet only).

See [`infra/pei/README.md`](../infra/pei/README.md) for deploy notes.

## Architecture

See [`faro-prd.md`](./faro-prd.md) — single source of truth. Phase 0 deviations also captured in [`AGENTS.md`](./AGENTS.md).

## Mirror

This repo is mirrored from a private GitLab monorepo via CI on every push to `main`. Read-only. `memory/`, `raw/`, `wiki/` never cross the subtree boundary.

## License

TBD.
