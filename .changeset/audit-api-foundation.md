---
"@coongro/kit-observability": minor
---

Audit API: nueva clase `AuditLog` con `record(entry)` (fire-and-forget con error logging) y `query(filters)` (filtros multidimensionales por tenant/actor/action/entity/fechas/limit). Tabla `audit_events` propia (no particionada, retención indefinida) con bootstrap migration v1→v2 idempotente. Endpoint `GET /audit` con validación estricta de fechas. `patchIssueStatus` registra eventos audit automáticamente. Documentación completa de la divergencia con el spec original (audit_events vs log_entries con category/immutable) en Plugin-Kit-Observability.html.
