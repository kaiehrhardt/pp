<div align="center">

# 🃏 Planning Poker

[![Release](https://github.com/kaiehrhardt/pp/actions/workflows/release.yml/badge.svg)](https://github.com/kaiehrhardt/pp/actions/workflows/release.yml)
[![semantic-release](https://img.shields.io/badge/semantic--release-e10079?logo=semantic-release&logoColor=white)](https://github.com/semantic-release/semantic-release)
[![Bun](https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white)](https://bun.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

</div>

A web app for teams to estimate work together via Planning Poker in real time — built with Bun, React, and TypeScript. The UI defaults to German but can be switched to English at any time. See [CONTEXT.md](./CONTEXT.md) for the domain model and [docs/adr/](./docs/adr/) for the architectural decisions.

## Features

- Open a room, share the link, join in seconds — no accounts, no setup
- Fibonacci deck (1–55, plus ☕ and ?), with automatic reveal once everyone's voted
- Average + closest-card recommendation shown after every reveal
- Pick an emoji avatar when joining; spectator mode, host controls (new round, kick), automatic host handover if the host disconnects (given back on reconnect, unless the stand-in host has already acted)
- Throw an emoji at another participant, animated flying from you to them
- Mini-games while you wait: guess the round's average, challenge someone to a Rock-Paper-Scissors duel, confetti on a unanimous vote — with a session trophy leaderboard
- Built-in room chat with clickable links and an emoji picker
- German/English language toggle; dark mode only, on purpose — the "light mode" button is a running joke
- Runs standalone via Bun, via Docker Compose (single host, includes Turso + Redis), in Kubernetes (Helm chart included, see [charts/pp](./charts/pp)), or straight from the published image

## Screenshots

<table>
  <tr>
    <td><img src="docs/screenshots/landing.jpg" alt="Landing page: create a new room"></td>
    <td><img src="docs/screenshots/room-voting.jpg" alt="Room during voting, one participant has picked a card"></td>
    <td><img src="docs/screenshots/room-revealed.jpg" alt="Room after reveal, showing the average and recommended card"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/rps-duel.jpg" alt="Rock-Paper-Scissors duel between two participants, playable even after a reveal"></td>
    <td><img src="docs/screenshots/leaderboard.jpg" alt="Session trophy leaderboard, opened after a unanimous vote"></td>
    <td><img src="docs/screenshots/session-evaluation.jpg" alt="Session Evaluation widget: rounds, reactions thrown, duels played, trophies won"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/chat.jpg" alt="Room chat with a clickable link"></td>
    <td><img src="docs/screenshots/room-full.jpg" alt="A room at its 15-participant capacity"></td>
  </tr>
</table>

## Prerequisites

- [Bun](https://bun.com) v1.3 or newer (`bun --version`)
- A reachable Redis (or [Valkey](https://valkey.io)) instance — the app pings it at boot and won't start without one. `redis-server` locally, or see [Docker Compose](#docker-compose) below for a zero-setup option.
- No Turso account needed for local dev: `TURSO_DATABASE_URL` defaults to a local file (`file:./dev.db`), created automatically on first run.

## Try it locally

```bash
bun install
bun run dev
```

The server starts with hot reload on [http://localhost:3000](http://localhost:3000). Room state is stored in `./dev.db` (a local libSQL file, gitignored) and cross-connection events flow through your local Redis.

The backend logs to stdout/stderr — readable `[LEVEL] msg {meta}` lines outside production, structured JSON lines (one object per line, for log aggregators) when `NODE_ENV=production`. Verbosity defaults to `debug` outside production and `info` in production; override with `LOG_LEVEL=debug|info|warn|error`.

To try the full flow (create a room, join, estimate, throw smileys) you need at least two browser windows/tabs, since each tab simulates its own participant:

1. Open `http://localhost:3000` in the first tab and click **"Neuen Room erstellen"** ("Create new room").
2. Copy the resulting URL (`http://localhost:3000/room/<id>`) — e.g. via the **"Link kopieren"** ("Copy link") button in the room.
3. Open that URL in a second tab (or an incognito window, so it gets its own `localStorage`) and enter a different name.
4. Pick a card in both tabs — once every (non-spectating) participant has voted, the room reveals automatically.
5. Click another participant's tile to throw them a smiley via the emoji picker.

An incognito window matters because the reconnect token lives in `localStorage` per room — two normal tabs in the same browser profile would otherwise reuse the same participant instead of joining a second one.

## Docker Compose

The easiest way to run the whole stack (app + Turso via a local [sqld](https://github.com/tursodatabase/libsql) server + Redis) on one host — either for local debugging or as a lightweight alternative to Kubernetes:

```bash
bun run compose       # production-like, builds from source: docker-compose.yml alone
bun run compose:dev   # debugging: adds docker-compose.dev.yml on top (hot reload, live-mounted src)
bun run compose:prod  # production, no local build: docker-compose.prod.yml, pulls ghcr.io/kaiehrhardt/pp:latest
```

Runs on [http://localhost:3000](http://localhost:3000) either way. `compose` is what a plain `docker compose up` gives you too — the dev overlay is a separate, explicitly-named file (not the auto-loading `docker-compose.override.yml`) so a single-host operator never gets a hot-reload build by accident. `compose:prod` is a standalone file (not an overlay — Compose can't remove the base file's `build:` key) meant to be copied to a host on its own, with no need for a full clone of this repo; edit its `image:` line to pin a specific released version instead of floating on `:latest`. Room state persists in a named volume (`sqld-data`) across `docker compose restart`/`down` (not `down -v`). See [ADR-0003](./docs/adr/0003-turso-and-redis-for-horizontal-scaling.md) for why Turso and Redis are there at all.

## In a single container

```bash
bun run docker:build
```

This builds just the app image — it still needs a reachable Turso (or `sqld`) database and Redis instance, since there's no in-memory fallback (see [ADR-0003](./docs/adr/0003-turso-and-redis-for-horizontal-scaling.md)). `bun run docker:run` (and the equivalent `docker run ghcr.io/kaiehrhardt/pp:latest` using the published image) will crash-loop without `-e REDIS_URL=...` reachable from inside the container, e.g.:

```bash
docker run --rm -p 3000:3000 \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -e TURSO_DATABASE_URL=http://host.docker.internal:8080 \
  ghcr.io/kaiehrhardt/pp:latest
```

Unless `TURSO_DATABASE_URL` is set, it falls back to an in-container local file (`file:./dev.db`) that's lost when the container is removed — fine for a quick check, not for anything you want to keep. For anything beyond a one-off, use [Docker Compose](#docker-compose) above instead, which wires all of this up for you. The port can be changed via the `PORT` environment variable (`-e PORT=8080 -p 8080:8080`).

A GitHub Actions workflow (`.github/workflows/ci.yml`) runs on feature branches and pull requests (not on `main`): it first runs the typecheck and test suite, then — only if that passes — builds the image and pushes it to GitHub Container Registry, tagged `pr-<number>` for a pull request or `<commit-sha>` for a plain branch push. No extra secrets needed — it authenticates with the workflow's built-in `GITHUB_TOKEN`. The resulting package is private by default; change its visibility under the repo's "Packages" tab if you want it public.

### Kubernetes (Helm)

```sh
helm install pp oci://ghcr.io/kaiehrhardt/charts/pp --version <chart-version>
```

See [charts/pp/README.md](./charts/pp/README.md) for values — multi-replica deployments need Turso and Redis wired up (room state lives in Turso, cross-pod events flow through Redis; see [ADR-0003](./docs/adr/0003-turso-and-redis-for-horizontal-scaling.md)), either an external `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN`/`REDIS_URL` via `extraEnv`, or `redis.enabled`/`sqld.enabled` to bundle minimal in-cluster instances of both.

## Releases

Versioning is handled by [semantic-release](https://semantic-release.gitbook.io/) (`.releaserc.cjs`), driven by [Conventional Commits](https://www.conventionalcommits.org/) on `main`: `fix:` → patch, `feat:` → minor, `BREAKING CHANGE:` → major. On every push to `main`, `.github/workflows/release.yml` determines the next version, updates `package.json` and `CHANGELOG.md`, tags the commit, and creates a GitHub release. Requires a `SEMANTIC_RELEASE_TOKEN` repo secret (a PAT with `repo` scope) so the release commit can trigger the follow-up workflow below — the default `GITHUB_TOKEN` can't do that.

Once a release commit lands, `.github/workflows/release-docker.yml` builds the container image and pushes it to GHCR tagged with that version *and* `:latest` (`ghcr.io/<owner>/<repo>:<version>` / `:latest`) — so `:latest` always tracks the most recently released version, not just the latest commit on `main`. Released images are multi-arch (`linux/amd64` + `linux/arm64`, the latter cross-built via QEMU emulation) — `docker pull`/`docker run` picks the right one automatically. Images built for pull requests or plain branch pushes (`.github/workflows/ci.yml`, tagged `pr-<number>`/`<commit-sha>`) stay `linux/amd64`-only, to keep that feedback loop fast. The same release run also packages and pushes the Helm chart to GHCR via the `semantic-release-helm3` plugin, keeping `Chart.yaml`'s version in sync with `package.json`.

## Tests & typecheck

```bash
bun test          # domain logic, persistence, cross-pod Redis relay, and the e2e suite below — needs a reachable Redis (see Prerequisites)
bun test:e2e      # just the Playwright e2e suite (needs Chromium: `bunx playwright install chromium`, once)
bunx tsc --noEmit # typecheck across the whole project
```

`e2e/` drives the real app (server + bundled frontend) in a headless Chromium browser via [Playwright](https://playwright.dev), covering the core room flow (create → join → vote → reveal) end to end rather than unit-testing individual modules.

## Architecture

### Components

A single `Bun.serve()` process (`src/backend/index.ts`) handles everything — HTTP routes, the WebSocket upgrade, and serving the bundled frontend. There's no separate API server, build step, or reverse proxy in front of the app logic itself.

```mermaid
flowchart LR
    FE["React UI<br/>(src/frontend)"]

    subgraph Pod["Bun.serve process"]
        HTTP["HTTP routes<br/>/, /room/*, /api/*"]
        WS["WS handler<br/>(ws/handler.ts)"]
        Channel["roomChannel<br/>(ws/roomChannel.ts)"]
        Store["RoomStore<br/>(domain/store.ts)"]
        Domain["Pure domain logic<br/>(domain/room.ts, duel.ts, deck.ts)"]
    end

    Turso[("Turso / libSQL<br/>rooms, participants,<br/>chat_messages,<br/>round_evaluations")]
    Redis[("Redis<br/>pub/sub: room:<id>:events")]

    FE -- "fetch: create/check room" --> HTTP
    FE -- "WebSocket: vote, chat,<br/>reactions, duel commands" --> WS
    WS --> Store
    WS --> Channel
    Store --> Domain
    Store <--> Turso
    Channel <--> Redis
    Channel -- "roomState / reaction /<br/>duel events" --> FE
```

`RoomStore` is the only thing that talks to Turso, and it's the sole owner of Room/Participant/Chat state — nothing else mutates it directly (see [ADR-0003](./docs/adr/0003-turso-and-redis-for-horizontal-scaling.md)). `roomChannel` is the only thing that talks to Redis, fanning a room's events out to every WebSocket connection for that room, on any pod.

### Horizontal scaling

Because Room state lives in Turso rather than in-process memory, any pod can serve any participant — a client's WebSocket connection doesn't need to land on "its" room's original pod. Cross-pod delivery (a vote cast against pod A reaching a participant connected to pod B) goes through one Redis pub/sub channel per room.

```mermaid
flowchart TB
    ClientA["Browser A"]
    ClientB["Browser B"]

    Svc["Service / Ingress"]

    subgraph Cluster["Kubernetes Deployment (replicaCount pods)"]
        PodA["Pod A"]
        PodB["Pod B"]
    end

    Turso[("Turso (libSQL)<br/>durable Room/Participant/Chat state")]
    Redis[("Redis<br/>cross-pod pub/sub")]

    ClientA --> Svc --> PodA
    ClientB --> Svc --> PodB
    PodA <--> Turso
    PodB <--> Turso
    PodA <--> Redis
    PodB <--> Redis
```

A single-replica deployment needs neither Turso nor Redis reachable from more than one place, but the app still requires both at boot regardless of replica count — there's deliberately no in-memory fallback path (ADR-0003 superseded the single-instance design of [ADR-0001](./docs/adr/0001-in-memory-single-instance-state.md)).

### Real-time state sync across pods

A mutation (e.g. casting a vote) is written to Turso first, then published once to Redis; every pod subscribed to that room's channel — including the one that made the write — relays the resulting `roomState` to its own locally-connected sockets.

```mermaid
sequenceDiagram
    participant A as Participant A
    participant Pod1 as Pod 1
    participant Turso
    participant Redis
    participant Pod2 as Pod 2
    participant B as Participant B

    A->>Pod1: WS "vote" {card}
    Pod1->>Turso: UPDATE participants.vote
    Turso-->>Pod1: updated Room
    opt everyone has voted
        Pod1->>Turso: reveal() + INSERT round_evaluations
    end
    Pod1->>Redis: PUBLISH room:<id>:events (roomSnapshot)
    Redis-->>Pod1: relay (local subscriber too)
    Redis-->>Pod2: relay
    Pod1-->>A: roomState (WS)
    Pod2-->>B: roomState (WS)
```

### Duels: the deliberate exception

Everything above assumes durable, Turso-backed state — Duels are the one piece of Room state that stays purely ephemeral, living only in the memory of whichever pod first received the challenge (ADR-0003). Cross-pod moves/responses are relayed as one-off command messages over the same Redis channel, routed to whichever pod actually owns that Duel; every other subscriber just ignores them.

```mermaid
sequenceDiagram
    participant A as Challenger
    participant Pod1 as Pod 1 (owns the Duel)
    participant Redis
    participant Pod2 as Pod 2
    participant B as Opponent

    A->>Pod1: WS "duelChallenge"
    Note over Pod1: Duel held in Pod 1's memory only<br/>(never written to Turso)
    Pod1->>Redis: PUBLISH unicast "duelChallenge"
    Redis-->>Pod2: relay
    Pod2-->>B: duelChallenge (WS)

    B->>Pod2: WS "duelRespond" {accept: true}
    Pod2->>Redis: PUBLISH duelCommand envelope
    Redis-->>Pod1: relay
    Note over Pod2: Pod 2 also receives its own<br/>publish, but doesn't own this<br/>Duel, so it's a no-op there
    Pod1->>Redis: PUBLISH unicast "duelStarted" (both sides)
    Redis-->>Pod1: relay
    Redis-->>Pod2: relay
    Pod1-->>A: duelStarted (WS)
    Pod2-->>B: duelStarted (WS)
```

Only a completed Duel's *outcome* is durable: the winner's Trophy (`participants.trophy_count`) and a room-wide tally of completed Duels (`rooms.duels_completed`, shown in the Session Evaluation widget) — never the moves, score-in-progress, or challenge itself.

### Data model

```mermaid
erDiagram
    ROOMS ||--o{ PARTICIPANTS : has
    ROOMS ||--o{ CHAT_MESSAGES : has
    ROOMS ||--o{ ROUND_EVALUATIONS : has

    ROOMS {
        text id PK
        text host_id
        text pending_host_id
        text phase
        int created_at
        int empty_since
        int reactions_thrown
        int duels_completed
    }
    PARTICIPANTS {
        text id PK
        text room_id FK
        text token
        text name
        int is_spectator
        int trophy_count
        int connected
    }
    CHAT_MESSAGES {
        text id PK
        text room_id FK
        text participant_id
        text text
        int sent_at
    }
    ROUND_EVALUATIONS {
        text id PK
        text room_id FK
        real average
        text recommended_card
        int revealed_at
    }
```

Duels have no table here on purpose — see above. `reactions_thrown`/`duels_completed` are plain counters (bumped alongside the mutation that causes them), not event logs; nothing records *which* emoji was thrown or *who* played which Duel.

## Project structure

```
src/
├── frontend/        # React UI (landing, join, room, card hand, emoji picker, chat)
└── backend/
    ├── domain/      # pure domain logic (Room, Participant, deck, evaluation, chat)
    │                # + db.ts/schema.sql/store.ts: the Turso-backed persistence layer
    ├── redis/       # Bun.redis pub/sub wrapper (publisher + reconnect-safe subscriber)
    └── ws/          # WebSocket protocol & handler; roomChannel.ts relays state and
                      # duel commands across pods over Redis
e2e/                 # Playwright end-to-end tests, driven through bun test
```

## License

[MIT](./LICENSE)
