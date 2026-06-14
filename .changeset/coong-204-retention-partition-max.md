---
'@coongro/kit-observability': patch
---

fix(COONG-204): la retención de particiones usa el máximo de los thresholds, no el mínimo

`register.ts` calculaba la retención de particiones de `log_entries` con
`Math.min(debug, warn, error)` y se la pasaba a pg_partman, que dropea la
**partición entera** (todos los niveles de ese día). Con `DEBUG=2/WARN=14/ERROR=30`
eso dropeaba las particiones a los 2 días, **borrando los ERROR que debían vivir 30**.

Ahora usa `Math.max`: pg_partman sólo dropea cuando expiró el nivel que más tiempo
se conserva, y el DELETE fino de `retention.ts` hace la limpieza por-nivel dentro de
las particiones vivas. Verificado con un test de integración nuevo (un ERROR de hace
5 días sobrevive al ciclo retention + maintenance con thresholds dispares).
