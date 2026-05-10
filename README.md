# @coongro/kit-observability

Plugin de observabilidad del sistema: logs estructurados, traces y auditoría.

## Cuándo usar qué

| Necesidad | Herramienta |
|-----------|-------------|
| Registrar qué hizo el sistema (errores, warnings, debug) | `logger` (operacional) |
| Registrar qué hizo un usuario o actor (login, cambio de permisos, modificación de datos sensibles) | `AuditLog` |

**Regla práctica:** si la frase empieza por "el sistema hizo X" → logger. Si empieza por "el usuario/actor Y hizo X sobre Z" → audit.

### Logger operacional (`@coongro/core-logging`)

Registra eventos técnicos del sistema: requests, errores, warnings, trazas de ejecución. No está pensado para reconstruir qué hicieron los usuarios.

```typescript
logger.info('consulta procesada', { consultationId, durationMs });
logger.error('fallo al guardar', { error });
```

### Audit Log (`AuditLog`)

Registra acciones de dominio con actor, entidad y contexto. Diseñado para responder "quién hizo qué sobre qué y cuándo".

```typescript
const { auditLog } = getRuntimeState();

auditLog.record({
  action: 'user.login',
  tenantId: ctx.tenantId,
  actorId: ctx.userId,
});

auditLog.record({
  action: 'permission.grant',
  tenantId: ctx.tenantId,
  actorId: ctx.adminId,
  entityType: 'role',
  entityId: 'admin',
  metadata: { grantedTo: userId },
});
```

`record()` es fire-and-forget: no bloquea ni lanza si falla.

## API

### `AuditLog.record(entry: AuditEventInput): void`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `action` | `string` | Acción en formato `dominio.verbo` (ej: `user.login`, `entity.update`) |
| `tenantId` | `string?` | UUID del tenant |
| `actorId` | `string?` | UUID del usuario o sistema que ejecutó la acción |
| `entityType` | `string?` | Tipo de entidad afectada (ej: `patient`, `role`) |
| `entityId` | `string?` | ID de la entidad afectada |
| `metadata` | `object?` | Contexto adicional (ej: valores antes/después, IP) |

### `AuditLog.query(filters?: AuditEventQuery): Promise<AuditEventRow[]>`

Consulta eventos con filtros opcionales. Default: 100 resultados, ordenados por timestamp DESC.

| Filtro | Tipo | Descripción |
|--------|------|-------------|
| `tenantId` | `string?` | Filtrar por tenant |
| `actorId` | `string?` | Filtrar por actor |
| `action` | `string?` | Filtrar por acción exacta |
| `entityType` | `string?` | Filtrar por tipo de entidad |
| `entityId` | `string?` | Filtrar por ID de entidad |
| `from` | `Date?` | Timestamp mínimo (inclusive) |
| `to` | `Date?` | Timestamp máximo (inclusive) |
| `limit` | `number?` | Máximo de resultados (default 100, máximo 1000) |

## Tests de integración

Requieren una DB PostgreSQL con pg_partman instalado:

```bash
OBSERVABILITY_TEST_DB_URL=postgres://user:pass@localhost:5432/dbname npm run test:integration
```
