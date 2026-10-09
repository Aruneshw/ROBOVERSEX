# Roboverse X

The official web arena for a robotics hackathon run by the Department of Mechatronics Engineering,
Bannari Amman Institute of Technology. Teams make a simulated ROS 2 turtlesim turtle reproduce a target drawing.

- **Level 1 — Teleop:** drive the turtle from a ROS 2 terminal (`ros2 topic pub`, `ros2 service call`, teleop keys).
- **Level 2 — Code:** write an `rclpy` node in the browser editor that draws the target.
- The server replays every submission in a sandbox and scores it; 100 % match passes.

The whole stack runs on one PC with Docker Compose (FastAPI, PostgreSQL, Redis, Next.js, Caddy, optional Cloudflare Tunnel).

## Build status

| Phase | Scope | State |
| --- | --- | --- |
| 0 | Foundation: repo tree, simulation core, design system | done |
| 1 | Backend core | pending |
| 2 | Judge pipeline | pending |
| 3 | Frontend foundation | pending |
| 4 | Level 1 (teleop) | pending |
| 5 | Level 2 (code) | pending |
| 6 | Realtime and leaderboard | pending |
| 7 | Admin | pending |
| 8 | Hardening and deployment | pending |
| 9 | Live ROS Lab (optional) | pending |

## Repository layout

```
apps/web          Next.js app (UI, Monaco, xterm.js, canvas sim, Pyodide worker)
apps/api          FastAPI app and arq worker (Phase 1+)
packages/rvx-sim  Deterministic turtlesim engine, rclpy shim, scorer and judge runner (pure Python)
packages/sql      schema.sql and seed.json
infra             Caddyfile, runner image, ROS lab image
```

## Quick start (development, Phase 0)

```bash
cp .env.example .env                       # then edit the secrets
python -m venv .venv && source .venv/bin/activate
pip install -e packages/rvx-sim pytest
pytest packages/rvx-sim                    # 11 passed

cd apps/web
npm install
npm run dev                                # http://localhost:3000
```

`npm run dev` and `npm run build` first run `scripts/copy-pyodide.mjs`, which copies the Pyodide runtime into
`public/pyodide/` and the `rvx_sim` Python files into `public/py/rvx_sim/` (no CDN needed, works offline on a LAN).

Start the data services with `make dev-data` (PostgreSQL 17 and Redis 7).

## Event-day runbook and deployment

Filled in during Phase 8 (LAN mode, Cloudflare Tunnel mode, backups, load test, runbook).
