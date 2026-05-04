import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditEventQuery } from '../audit/index.js';
import { clearRuntimeState, setRuntimeState } from '../runtime/state.js';

import { queryAuditEndpoint } from './audit-query.js';

const makeContext = (
  query: Record<string, string | undefined>
): Parameters<typeof queryAuditEndpoint>[0] =>
  ({ query }) as unknown as Parameters<typeof queryAuditEndpoint>[0];

describe('queryAuditEndpoint', () => {
  let queryMock: ReturnType<typeof vi.fn<[AuditEventQuery], Promise<unknown[]>>>;

  beforeEach(() => {
    queryMock = vi.fn<[AuditEventQuery], Promise<unknown[]>>().mockResolvedValue([]);
    setRuntimeState({
      auditLog: { query: queryMock } as never,
    } as never);
  });

  afterEach(() => {
    clearRuntimeState();
  });

  it('sin query params, llama auditLog.query con limit default 100', async () => {
    await queryAuditEndpoint(makeContext({}));
    expect(queryMock).toHaveBeenCalledTimes(1);
    const args = queryMock.mock.calls[0]?.[0];
    if (args === undefined) throw new Error('expected query call');
    expect(args.limit).toBe(100);
    expect(args.tenantId).toBeUndefined();
    expect(args.from).toBeUndefined();
  });

  it('parsea todos los filtros string', async () => {
    await queryAuditEndpoint(
      makeContext({
        tenant_id: '11111111-1111-1111-1111-111111111111',
        actor_id: '22222222-2222-2222-2222-222222222222',
        action: 'issue.status_updated',
        entity_type: 'log_issue',
        entity_id: 'abc',
      })
    );
    const args = queryMock.mock.calls[0]?.[0];
    if (args === undefined) throw new Error('expected query call');
    expect(args).toMatchObject({
      tenantId: '11111111-1111-1111-1111-111111111111',
      actorId: '22222222-2222-2222-2222-222222222222',
      action: 'issue.status_updated',
      entityType: 'log_issue',
      entityId: 'abc',
    });
  });

  it('parsea from/to a Date cuando son ISO válidos', async () => {
    await queryAuditEndpoint(
      makeContext({
        from: '2026-05-01T00:00:00Z',
        to: '2026-05-04T23:59:59Z',
      })
    );
    const args = queryMock.mock.calls[0]?.[0];
    if (args === undefined) throw new Error('expected query call');
    expect(args.from).toBeInstanceOf(Date);
    expect(args.to).toBeInstanceOf(Date);
    expect(args.from?.toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });

  it('ignora from/to inválidos (no rompe ni manda Date inválido)', async () => {
    await queryAuditEndpoint(makeContext({ from: 'no-es-fecha', to: 'tampoco' }));
    const args = queryMock.mock.calls[0]?.[0];
    if (args === undefined) throw new Error('expected query call');
    expect(args.from).toBeUndefined();
    expect(args.to).toBeUndefined();
  });

  it('limit clamea al máximo de 1000', async () => {
    await queryAuditEndpoint(makeContext({ limit: '99999' }));
    const args = queryMock.mock.calls[0]?.[0];
    if (args === undefined) throw new Error('expected query call');
    expect(args.limit).toBe(1000);
  });

  it('limit inválido cae al default 100', async () => {
    await queryAuditEndpoint(makeContext({ limit: 'abc' }));
    const args = queryMock.mock.calls[0]?.[0];
    if (args === undefined) throw new Error('expected query call');
    expect(args.limit).toBe(100);
  });

  it('strings vacíos se tratan como undefined', async () => {
    await queryAuditEndpoint(makeContext({ tenant_id: '', action: '   ' }));
    const args = queryMock.mock.calls[0]?.[0];
    if (args === undefined) throw new Error('expected query call');
    expect(args.tenantId).toBeUndefined();
    expect(args.action).toBeUndefined();
  });

  it('devuelve { rows } con el resultado de auditLog.query', async () => {
    const fakeRows = [{ id: 'x', action: 'test' }];
    queryMock.mockResolvedValueOnce(fakeRows);
    const result = await queryAuditEndpoint(makeContext({}));
    expect(result).toEqual({ rows: fakeRows });
  });
});
