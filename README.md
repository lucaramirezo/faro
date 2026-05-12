# faro

**Lighthouse for your agents.** A single-user, file-native HTML control center for autonomous AI workloads.

> Status: **v0.1 — scaffold complete, MVP features incoming.** PRD: [`faro-prd.md`](./faro-prd.md).

## Stack

Bun 1.3+ (package manager) · Node 22+ (runtime) · Next.js 16 · React 19 · TypeScript · Tailwind v4 · shadcn/ui Luma preset · Biome · better-sqlite3 · Tremor · Framer Motion · Embla · cmdk

## Local development

```bash
cp .env.example .env.local
# edit .env.local — set FARO_OWNER_LOGIN to your email
bun install
bun run migrate
bun run dev
```

Open http://localhost:3000.

## Architecture

See [`faro-prd.md`](./faro-prd.md) — single source of truth.

## Mirror

This repo is mirrored from a private GitLab monorepo via CI on every push to `main`. Read-only.

## License

TBD.
