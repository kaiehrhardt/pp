# pp (Planning Poker)

Helm chart for [Planning Poker](https://github.com/kaiehrhardt/pp).

## Important: single replica only

Room state (participants, votes, chat) lives in each pod's memory — there is no shared
or external store. If a room is created on one pod, a request routed to a different
pod won't know about it. Do **not** set `replicaCount` above `1` or enable
`autoscaling.enabled` unless the app has since gained a shared backing store; both
will silently break rooms for anyone unlucky enough to land on the wrong pod.

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
| `autoscaling.enabled` | `false` | Deliberately off, see caveat above |

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
