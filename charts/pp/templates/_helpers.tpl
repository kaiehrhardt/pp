{{/*
Expand the name of the chart.
*/}}
{{- define "pp.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "pp.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "pp.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "pp.labels" -}}
helm.sh/chart: {{ include "pp.chart" . }}
{{ include "pp.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "pp.selectorLabels" -}}
app.kubernetes.io/name: {{ include "pp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Selector labels scoped to the app's own pods. The bundled redis/sqld pods (see
redis-deployment.yaml, sqld-deployment.yaml) share the base selector labels above, and
sqld's container port is even named "http" like the app's — so any Service/selector
that uses the base labels alone would pick up sqld/redis pods as backends too. Every
selector that must resolve to app pods only (the app's Service, Deployment, and
PodDisruptionBudget) uses this instead.
*/}}
{{- define "pp.appSelectorLabels" -}}
{{ include "pp.selectorLabels" . }}
app.kubernetes.io/component: app
{{- end }}

{{/*
Create the name of the service account to use.
*/}}
{{- define "pp.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "pp.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
