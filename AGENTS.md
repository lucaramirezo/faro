<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:faro-phase-0-deviations -->
# Faro Phase 0 deviations (must internalize before editing)

1. **Production runtime: Node 22+**. Bun (1.3.13+) is **install + dev only**. Production runs `node .next/standalone/server.js`. Do not introduce Bun-only APIs in runtime code.
2. **Port: 8766** in production systemd unit; **3000** locally.
3. **Tailnet route**: `https://pei.taild21074.ts.net:8443/` (port-based, NOT sub-path `/faro`, NOT separate hostname).
4. **Pei filesystem**: `/home/luca/lwiki/` (laptop is `/home/luca/projects/lwiki/`). Override via `FARO_AGENT_ROOT` env var.
5. **SQLite on pei**: 3.53.1 built from source (`/usr/local/lib/libsqlite3.so.0`); apt-jammy's 3.51 has a WAL bug. better-sqlite3@12.9 bundles 3.53.0 patched.
6. **Caddy**: pei runs **Docker Caddy** (Duo, since 2026-03) for internal services on `:80`. Faro added the **apt Caddy binary** at `/usr/bin/caddy` for `caddy validate`, with **systemd unit masked** (`/etc/systemd/system/caddy.service → /dev/null`) to prevent conflict. `Caddyfile.faro` committed + validated (loopback `:8767 → :8766`) but **NOT in either Caddy instance's active config** in v0.1. v0.2 will `import` it into Docker Caddy + flip Tailscale Serve to `:8443 → :8767`. See [`infra/pei/caddy/README.md`](../infra/pei/caddy/README.md). **Port `:9001` is Tor — never use for faro.**
7. **GitHub mirror**: only via GitLab CI subtree push. Manual pushes from pei shell require `GIT_SSH_COMMAND="ssh -p 22 ..."` because pei's `/etc/ssh/ssh_config` forces port 2269 for GitLab. CI runner is `lwiki (pei docker)` (registered 2026-05-13, project-scoped). The `mirror-faro-to-github` job uses `image: alpine/git` with `entrypoint: [""]` override — the image's default entrypoint is `git`, which breaks GitLab Runner's `sh -c` script injection.
8. **Biome lint**: `components/ui/**` is excluded (shadcn-shipped a11y warnings). Do NOT add new code there; new components go in `components/<domain>/`.
9. **Next.js 16.2.6 deprecation**: `middleware` will be renamed to `proxy`. Track for a rename pass; current code uses `middleware.ts` and works fine.
10. **Patch B contract** (`dreams/__main__.py`): rerun mode transitions the **original** `pipeline_runs` row to `rerun_ok` after the new row is wired. Sharded review in Phase 1 must preserve this discipline — don't create rerun rows without closing the original.

See `faro/faro-prd.md` §14 "Decisions captured" for canonical references.
<!-- END:faro-phase-0-deviations -->
