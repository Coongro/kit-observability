# Observability y el consumo de la DB (Neon)

Este plugin persiste telemetría (spans + logs) en la base de negocio. En un
Postgres serverless con cuota (Neon free/Launch) eso tiene un costo real de
**compute** y **storage**. Esta guía es para cuando la DB se queda sin compute,
el storage crece sin control, o querés bajar el consumo sin perder la señal útil.

> **Por qué pasa (la mecánica de Neon):** el compute se factura por **CU-hora de
> tiempo activo** y la DB **auto-suspende (scale-to-zero) tras ~5 min sin
> queries**. Cualquier proceso que escriba a la DB más seguido que cada 5 min la
> mantiene despierta 24/7. El otel-bridge de observability emite un `LogEntry`
> por cada span (un span por middleware, handler y query) y el DBSink los
> flushea cada `batchIntervalMs`: ese caudal continuo es lo que impide que la DB
> duerma. No lo determina el tráfico de usuarios, sino el escritor de fondo más
> frecuente.

---

## Me estoy quedando sin compute / la DB no duerma nunca → cortá el drenaje

En orden, de la palanca más contundente a la más quirúrgica. Todas son **env
vars** (Railway → servicio API → Variables, en **prod Y staging**) y toman
efecto al **reiniciar/redeploy** el servicio.

| Palanca | Env var | Efecto |
|---|---|---|
| **Master kill-switch del plugin** | `OBSERVABILITY_DISABLED=1` | `activate()` retorna temprano: **nada** que toque la DB (sin bootstrap, sin DBSink/SpanSink, sin crons, sin audit). Se lee directo de env (no vía `loadConfig`), así que es **reset-proof** y no necesita la DB arriba ni enumerar tenants. Es la forma más segura de cortar del todo sin desinstalar. |
| **Apagar OTel en el core** | `OTEL_DISABLED=1` | Skippea el SDK de OTel al boot → sin spans → el bridge no recibe nada → se corta el grueso de las escrituras. Corta el drenaje aunque el plugin siga activo. Leído en `apps/api/src/instrumentation.bootstrap.ts` (compara `=== '1'`, tiene que ser exactamente `1`). |
| **Subir el piso de persistencia** | `OBSERVABILITY_DB_MIN_LEVEL=error` | El DBSink ya default-ea a **WARN** (solo persiste requests lentos + warnings + errores; el ~93% de spans INFO rápidos no entra). Subirlo a `error`/`fatal` reduce aún más las escrituras residuales sin apagar el plugin. |
| **No mantener viva la DB desde el core** | `DATABASE_KEEPALIVE_MS=0` (o ausente) | Si está `>0` hace un `SELECT 1` periódico que **impide** que la DB duerma — autogol independiente de observability. El default en código ya es `0`; verificá que nadie lo haya seteado "para que no se duerma". |

**Verificá que OTel quedó apagado:** en los logs del API al boot debe aparecer

```
[otel] OTEL_DISABLED=1 — instrumentation skipped
```

Si no aparece → typo en la env var o el servicio no se reinició.

**Garantía dura (necesita la DB arriba):** desactivar el plugin por tenant vía
API — saca DBSink + crons + audit + bootstrap:

```
PATCH /api/tenants/:tenantId/plugins/<pluginId>/status   body {"isActive": false}
```

(guard `ApiKeyGuard`, header `x-api-key`; descubrí los tenants con `GET /api/tenants`).
El Dev Panel **no** sirve en prod (404 por `DevOnlyGuard`). Preferí el
`OBSERVABILITY_DISABLED=1`, que hace lo mismo sin depender de la DB.

> **La cuota del mes ya consumida NO se resetea** con estos cambios. Si el ciclo
> ya se agotó, levantar prod requiere esperar el reset del free tier o subir de
> plan. Clave: dejá `OBSERVABILITY_DISABLED=1` / `OTEL_DISABLED=1` puestos
> **antes** del reset, así el ciclo nuevo no se vuelve a quemar desde el día 1.

---

## ¿Es observability el culpable? → diagnóstico

Antes de tocar nada, confirmá si el problema es **compute** (la DB no duerme) o
**storage** (GB de logs). En el **SQL Editor** de la consola de Neon:

```sql
-- Tamaño total de la DB. < 300 MB → storage no es el problema; apuntá a compute.
SELECT pg_size_pretty(pg_database_size(current_database())) AS db_total;
```

```sql
-- Tamaño por schema. Si el schema `observability` domina → es el culpable de storage.
SELECT schemaname AS schema,
       pg_size_pretty(sum(pg_total_relation_size(relid))) AS tamano,
       sum(pg_total_relation_size(relid)) AS bytes
FROM pg_catalog.pg_statio_user_tables
GROUP BY schemaname
ORDER BY bytes DESC
LIMIT 15;
```

```sql
-- Top tablas (incluye particiones). Buscá log_spans / log_entries y sus log_*_pNNNN.
SELECT schemaname AS schema, relname AS tabla,
       pg_size_pretty(pg_total_relation_size(relid)) AS tamano,
       pg_total_relation_size(relid) AS bytes
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 25;
```

**Compute** no es SQL, es el gráfico: Neon → **Monitoring** → CPU/compute.
Línea activa casi 24/7 → keep-awake (observability o el dispatcher, ver abajo).
Línea plana con picos cada hora → la DB sí duerme → compute no es el problema.

Para **atribuir** el write load dentro de la DB, agrupá por `source` tras un rato
de tráfico: si `otel-bridge` domina, el bridge+DBSink es el driver del volumen.

---

## Bajar el storage sin perder la señal (tuning fino)

El default (`OBSERVABILITY_DB_MIN_LEVEL=WARN`) ya guarda **señal, no ruido**:
requests lentos (spans escalados a WARN por duración), warnings y errores. Para
acotar aún más lo que sí se guarda:

| Env var | Default | Para qué |
|---|---|---|
| `OBSERVABILITY_DB_MIN_LEVEL` | `warn` | Piso de persistencia en `log_entries`. `error` = aún menos filas. |
| `OBSERVABILITY_BATCH_INTERVAL_MS` | `200` | Subilo a `2000`–`5000` → menos round-trips de INSERT por hora activa (menos compute). Los errores igual flushean sync. |
| `OBSERVABILITY_RETENTION_DAYS_DEBUG` / `_WARN` / `_ERROR` | sin límite (`null`) | Días que sobreviven por nivel (DELETE por filas). Ej. DEBUG 1–2, WARN 7–14, ERROR 30. |
| `OBSERVABILITY_RETENTION_DAYS_SPANS` | sin límite (`null`) | Retención de `log_spans`. |
| `OBSERVABILITY_PARTITION_PREMAKE` | `4` | Particiones pre-creadas por pg_partman. |

Todos se parsean en `src/config.ts` (`loadConfig`). Un valor inválido **lanza**
al boot a propósito (un typo no debe degradar la observabilidad en silencio).
Para liberar storage ya acumulado: corré el cron de `retention` (o `TRUNCATE` de
particiones viejas) cuando la DB vuelva.

---

## Re-encender observability de forma segura

Observability encendido con los defaults de hoy (`dbMinLevel=WARN`) **ya no
drena** como drenaba (esa era la falla histórica, con el sink en DEBUG
persistiendo todo). Al re-encender en prod:

1. Sacá `OBSERVABILITY_DISABLED` / `OTEL_DISABLED` y reiniciá.
2. Confirmá en Neon → Monitoring que la línea de compute queda **plana entre
   crons** (no activa 24/7).
3. Si querés margen extra: `OBSERVABILITY_DB_MIN_LEVEL=error` + retenciones
   agresivas por nivel.

---

## Ojo: observability no es el único que puede mantener la DB despierta

El drenaje de compute puede venir también del **core**, no solo de este plugin.
El dispatcher de notificaciones agendadas
(`apps/api/src/notifications/scheduled-notifications.dispatcher.ts`) **ya no**
es la causa: hasta COONG-203 corría cada 1 min de forma incondicional, pero ese
polling se reemplazó por un scheduler event-driven (`setTimeout` al próximo
`due` + red de seguridad horaria) — ya no despierta la DB por sí solo. Si tras
apagar observability la línea de compute sigue activa 24/7, el sospechoso es
otro: revisá los crons horarios (sso-cleanup / updates-check / maintenance /
telegram — alinéalos al mismo minuto para que sea 1 despertar/hora en vez de 4)
o `DATABASE_KEEPALIVE_MS` seteado a mano en Railway.

---

## Límites conocidos

- Estas palancas bajan el **consumo**, no resetean la **cuota del mes** ya gastada.
- Con tráfico de usuarios real y sostenido la DB estará despierta por uso
  legítimo; el free tier puede no alcanzar y ahí corresponde subir de plan. El
  tuning igual baja la factura en cualquier plan.
- `OBSERVABILITY_DISABLED` / el toggle por-tenant apagan la **captura**; no borran
  lo ya persistido (para eso, retención o TRUNCATE).
