---
'@coongro/kit-observability': minor
---

feat(COONG-202): DBSink persiste solo WARN+ por default (observability cost-aware)

El DBSink se creaba sin `minLevel` → default DEBUG → persistía TODO a
`log_entries`, incluidos los ~93% de spans INFO del otel-bridge (un log por cada
middleware/handler/query). Medido: ~12 filas a la DB por request, millones de
filas y varios GB de ruido.

Ahora `minLevel` es configurable vía `OBSERVABILITY_DB_MIN_LEVEL` (default
**WARN**). Con WARN, core-logging filtra INFO/DEBUG antes del sink y solo se
persisten spans escalados a WARN por duración (requests lentos) + warnings +
errores — la señal real del dashboard. Bajable a `info`/`debug` para debugging.

Verificado en vivo: 50 requests normales pasaron de +619 filas a **+0**, mientras
los errores se siguen persistiendo. La auditoría no se ve afectada (va por
`audit_events`). Cambio de comportamiento por default (de DEBUG a WARN) → minor.
