---
'@coongro/kit-observability': minor
---

feat: master kill-switch `OBSERVABILITY_DISABLED=1` para apagar el plugin entero por env var

Cuando `OBSERVABILITY_DISABLED=1`, `activate()` retorna temprano y el plugin no registra nada que toque la DB (bootstrap, DBSink/SpanSink, audit recorder); los crons `maintenance`/`retention` quedan no-op limpio. Palanca operacional reset-proof y 100% por variable de entorno contra el drenaje de compute de la DB (no necesita la DB arriba ni toggle por-tenant). Sin la var, comportamiento normal (COONG-226).
