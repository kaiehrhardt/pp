# pp (Planning Poker)

Helm chart for [Planning Poker](https://github.com/kaiehrhardt/pp).

## Multi-replica: requires Turso and Redis

Room state (participants, votes, chat) lives in Turso (libSQL), with cross-pod
WebSocket delivery over Redis pub/sub — see
[ADR-0003](../../docs/adr/0003-turso-and-redis-for-horizontal-scaling.md). Wire up both
before running more than one replica — without them the app falls back to a local file
with no shared state, and requests routed to different pods won't agree on what rooms
exist. `helm install` prints a warning in `NOTES.txt` if it detects this. Two ways to do it:

- **Bring your own**: set `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `REDIS_URL` via
  `extraEnv` (see the worked example in `values.yaml`), pointing at hosted Turso and a
  managed Redis.
- **Bundle minimal in-cluster instances**: set `redis.enabled: true` and/or
  `sqld.enabled: true` (Turso's own open-source server) — `REDIS_URL`/
  `TURSO_DATABASE_URL` get wired up automatically, no `extraEnv` needed. Single Pod
  each, no HA, no auth; `sqld` gets a `PersistentVolumeClaim` (`sqld.persistence.size`,
  default `1Gi`) so data survives pod restarts. Fine for small/self-hosted
  deployments — reach for a managed Turso/Redis instead if you need real durability
  guarantees, backups, or scale beyond one node's worth of storage.

These two approaches mix freely per-dependency (e.g. bundle Redis but use hosted Turso).

Duels (the RPS mini-game) are the one exception: they stay ephemeral and pod-local by
design, relayed cross-pod over the same Redis channel rather than persisted — a duel
in progress is lost if its owning pod restarts, same as today's existing
disconnect-cancels-the-duel behavior, just with a new trigger.

Duels (the RPS mini-game) are the one exception: they stay ephemeral and pod-local by
design, relayed cross-pod over the same Redis channel rather than persisted — a duel
in progress is lost if its owning pod restarts, same as today's existing
disconnect-cancels-the-duel behavior, just with a new trigger.

## Installing from GHCR

```sh
helm install pp oci://ghcr.io/kaiehrhardt/charts/pp --version <chart-version>
```

`Chart.yaml`'s `version`/`appVersion` are kept in sync with `package.json` by the
[`semantic-release-helm3`](https://github.com/nflaig/semantic-release-helm) plugin
(configured in `.releaserc.cjs`), which also packages and pushes the chart to GHCR as
part of the normal `semantic-release` run in `.github/workflows/release.yml` — there's
no separate Helm release workflow.

## Values

See [values.yaml](values.yaml) for the full list. Notable ones:

| Key | Default | Description |
| --- | --- | --- |
| `image.repository` | `ghcr.io/kaiehrhardt/pp` | Container image |
| `image.tag` | chart `appVersion` | Override to pin a specific app version |
| `service.type` / `service.port` | `ClusterIP` / `80` | Service in front of the app |
| `ingress.enabled` | `false` | Set `true` and fill in `ingress.hosts` to expose the app |
| `resources` | 100m/128Mi requests, 500m/256Mi limits | Pod resource sizing |
| `replicaCount` / `autoscaling` | `2` / enabled, 2-3 replicas | Requires Turso + Redis, see caveat above |
| `logLevel` | `""` (app defaults to `info`) | Set `debug`/`warn`/`error` to override backend log verbosity |
| `extraEnv` | `[]` | Set `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `REDIS_URL` here for an external Turso/Redis |
| `redis.enabled` / `sqld.enabled` | `false` / `false` | Bundle a minimal in-cluster Redis / Turso (sqld) instead |

If you put an nginx ingress controller in front of this app, raise
`nginx.ingress.kubernetes.io/proxy-read-timeout` / `proxy-send-timeout` (see the
commented example in `values.yaml`) — the app's WebSocket connections are otherwise
liable to get cut by the controller's default idle timeout.

## Testing

```sh
helm lint charts/pp
helm unittest charts/pp     # requires: helm plugin install https://github.com/helm-unittest/helm-unittest
helm template charts/pp     # render manifests without installing
```

CI additionally spins up a kind cluster and smoke-tests a real install on every pull
request (see `.github/workflows/ci.yml`, job `helm-chart`).
