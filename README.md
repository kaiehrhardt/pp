# Planning Poker

A web app for teams to estimate work together via Planning Poker in real time — built with Bun, React, and TypeScript. The UI itself is in German. See [CONTEXT.md](./CONTEXT.md) for the domain model and [docs/adr/](./docs/adr/) for the architectural decisions.

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

Runs on [http://localhost:3000](http://localhost:3000) as well — in production mode, without hot reload. The port can be changed via the `PORT` environment variable (`-e PORT=8080 -p 8080:8080`).

A GitHub Actions workflow (`.github/workflows/docker-build.yml`) builds the image on every push/PR to `main`. On pushes to `main` it also publishes to GitHub Container Registry as `ghcr.io/<owner>/<repo>:latest` and `:<commit-sha>` (pull requests only build, to avoid publishing untested images). No extra secrets needed — it authenticates with the workflow's built-in `GITHUB_TOKEN`. The resulting package is private by default; change its visibility under the repo's "Packages" tab if you want it public.

## Releases

Versioning is handled by [semantic-release](https://semantic-release.gitbook.io/) (`.releaserc.cjs`), driven by [Conventional Commits](https://www.conventionalcommits.org/) on `main`: `fix:` → patch, `feat:` → minor, `BREAKING CHANGE:` → major. On every push to `main`, `.github/workflows/release.yml` determines the next version, updates `package.json` and `CHANGELOG.md`, tags the commit, and creates a GitHub release. Requires a `SEMANTIC_RELEASE_TOKEN` repo secret (a PAT with `repo` scope) so the release commit can trigger the follow-up workflow below — the default `GITHUB_TOKEN` can't do that.

Once a release commit lands, `.github/workflows/release-docker.yml` builds the container image and pushes it to GHCR tagged with that version (`ghcr.io/<owner>/<repo>:<version>`), on top of the `:latest`/`:<sha>` tags `docker-build.yml` already pushes on every push to `main`.

## Tests & typecheck

```bash
bun test          # domain logic (host assignment, auto-reveal, evaluation, …)
bunx tsc --noEmit # typecheck across the whole project
```

## Project structure

```
src/
├── client/          # React UI (landing, join, room, card hand, emoji picker)
└── server/
    ├── domain/      # pure domain logic: Room, Participant, deck, evaluation
    └── ws/          # WebSocket protocol & handler, wires the domain up to transport
```

## License

[MIT](./LICENSE)
