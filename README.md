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
- Pick an emoji avatar when joining; spectator mode, host controls (new round, kick), automatic host handover if the host disconnects
- Throw an emoji at another participant, animated flying from you to them
- Mini-games while you wait: guess the round's average, challenge someone to a Rock-Paper-Scissors duel, confetti on a unanimous vote — with a session trophy leaderboard
- Built-in room chat with clickable links and an emoji picker
- German/English language toggle; dark mode only, on purpose — the "light mode" button is a running joke
- Runs standalone via Bun, in Docker/Kubernetes (Helm chart included, see [charts/pp](./charts/pp)), or straight from the published image

## Screenshots

<table>
  <tr>
    <td><img src="docs/screenshots/landing.jpg" alt="Landing page: create a new room"></td>
    <td><img src="docs/screenshots/room-voting.jpg" alt="Room during voting, one participant has picked a card"></td>
    <td><img src="docs/screenshots/room-revealed.jpg" alt="Room after reveal, showing the average and recommended card"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/rps-duel.jpg" alt="Rock-Paper-Scissors duel between two participants"></td>
    <td><img src="docs/screenshots/leaderboard.jpg" alt="Session trophy leaderboard, opened after a unanimous vote"></td>
  </tr>
</table>

## Prerequisites

- [Bun](https://bun.com) v1.3 or newer (`bun --version`)

## Try it locally

```bash
bun install
bun run dev
```

The server starts with hot reload on [http://localhost:3000](http://localhost:3000).

To try the full flow (create a room, join, estimate, throw smileys) you need at least two browser windows/tabs, since each tab simulates its own participant:

1. Open `http://localhost:3000` in the first tab and click **"Neuen Room erstellen"** ("Create new room").
2. Copy the resulting URL (`http://localhost:3000/room/<id>`) — e.g. via the **"Link kopieren"** ("Copy link") button in the room.
3. Open that URL in a second tab (or an incognito window, so it gets its own `localStorage`) and enter a different name.
4. Pick a card in both tabs — once every (non-spectating) participant has voted, the room reveals automatically.
5. Click another participant's tile to throw them a smiley via the emoji picker.

An incognito window matters because the reconnect token lives in `localStorage` per room — two normal tabs in the same browser profile would otherwise reuse the same participant instead of joining a second one.

## In a container

```bash
bun run docker:build
bun run docker:run
```

Or pull the latest published release instead of building locally:

```bash
docker pull ghcr.io/kaiehrhardt/pp:latest
docker run --rm -p 3000:3000 ghcr.io/kaiehrhardt/pp:latest
```

Either way it runs on [http://localhost:3000](http://localhost:3000), in production mode, without hot reload. The port can be changed via the `PORT` environment variable (`-e PORT=8080 -p 8080:8080`).

A GitHub Actions workflow (`.github/workflows/ci.yml`) runs on feature branches and pull requests (not on `main`): it first runs the typecheck and test suite, then — only if that passes — builds the image and pushes it to GitHub Container Registry, tagged `pr-<number>` for a pull request or `<commit-sha>` for a plain branch push. No extra secrets needed — it authenticates with the workflow's built-in `GITHUB_TOKEN`. The resulting package is private by default; change its visibility under the repo's "Packages" tab if you want it public.

### Kubernetes (Helm)

```sh
helm install pp oci://ghcr.io/kaiehrhardt/charts/pp --version <chart-version>
```

See [charts/pp/README.md](./charts/pp/README.md) for values and the single-replica caveat (room state is in-memory per pod, see ADR-0001).

## Releases

Versioning is handled by [semantic-release](https://semantic-release.gitbook.io/) (`.releaserc.cjs`), driven by [Conventional Commits](https://www.conventionalcommits.org/) on `main`: `fix:` → patch, `feat:` → minor, `BREAKING CHANGE:` → major. On every push to `main`, `.github/workflows/release.yml` determines the next version, updates `package.json` and `CHANGELOG.md`, tags the commit, and creates a GitHub release. Requires a `SEMANTIC_RELEASE_TOKEN` repo secret (a PAT with `repo` scope) so the release commit can trigger the follow-up workflow below — the default `GITHUB_TOKEN` can't do that.

Once a release commit lands, `.github/workflows/release-docker.yml` builds the container image and pushes it to GHCR tagged with that version *and* `:latest` (`ghcr.io/<owner>/<repo>:<version>` / `:latest`) — so `:latest` always tracks the most recently released version, not just the latest commit on `main`. The same release run also packages and pushes the Helm chart to GHCR via the `semantic-release-helm3` plugin, keeping `Chart.yaml`'s version in sync with `package.json`.

## Tests & typecheck

```bash
bun test          # domain logic (host assignment, auto-reveal, evaluation, …)
bunx tsc --noEmit # typecheck across the whole project
```

## Project structure

```
src/
├── frontend/        # React UI (landing, join, room, card hand, emoji picker, chat)
└── backend/
    ├── domain/      # pure domain logic: Room, Participant, deck, evaluation, chat
    └── ws/          # WebSocket protocol & handler, wires the domain up to transport
```

## License

[MIT](./LICENSE)
