---
"@coongro/kit-observability": minor
---

Frontend redesign + audit-view UX (COONG-118 + COONG-146 plugin side):

- Schema v3: audit_events.request_id column for cross-table correlation
  with log_entries.request_id and log_spans.trace_id. Migration v2→v3
  idempotent.
- AuditLog.record/query thread requestId through; /audit endpoint accepts
  ?request_id= filter.
- activate() registers AuditLog as the global audit recorder via
  setAuditRecorder() — apps/api can call recordAudit() without a hard
  dependency on this plugin.
- Stream / Issues / Trace views ported with shared component foundation
  (PageHeader, ResultsBar, StickyTh, FilterChip variants, dropdowns,
  cross-view navigation helpers).
- Audit view UX: target column wraps multi-line (no truncation),
  meta column +N is now an interactive expand/collapse, action chip
  colors classified by verb substring (covers tenant.created,
  plugin.installed, cron.handler_failed, etc.), target chip colors by
  the verb embedded in entityId (calendar.events.create → green), tenant
  column shows resolved tenant name, actor cell shows tenant name as
  context, hover icons cross-link to Stream and Trace by request_id
  (Trace button only visible when requestId is OTel hex format).
