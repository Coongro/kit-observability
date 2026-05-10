import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { AuditEventQuery } from '../audit/index.js';
import { clearRuntimeState, setRuntimeState } from '../runtime/state.js';

import { queryAuditEndpoint } from './audit-query.js';

const makeContext = (
  query: Record<string, string | undefined>
): Parameters<typeof queryAuditEndpoint>[0] =>
  ({ query }) as unknown as Parameters<typeof queryAuditEndpoint>[0];

describe('queryAuditEndpoint', () => {
  // `Mock` sin generics: vitest 1.x lo declara como `Mock<TArgs[], TReturn>` y
  // vitest 2.x como `Mock<T extends Procedure>`. Sin type args explícitos
  // resuelve a `any` en ambos, evitando que los tests fallen en CI Linux
  // (vitest 2.x) cuando localmente el resolver agarra otra versión.
  let queryMock: Mock;

  const lastQueryArgs = (): AuditEventQuery => {
    const call = queryMock.mock.calls[0] as [AuditEventQuery] | undefined;
    if (call === undefined) throw new Error('expected query call');
    return call[0];
  };

  beforeEach(() => {
    queryMock = vi.fn().mockResolvedValue([]);
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
    const args = lastQueryArgs();
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
        request_id: 'req-xyz-789',
      })
    );
    const args = lastQueryArgs();
    expect(args).toMatchObject({
      tenantId: '11111111-1111-1111-1111-111111111111',
      actorId: '22222222-2222-2222-2222-222222222222',
      action: 'issue.status_updated',
      entityType: 'log_issue',
      entityId: 'abc',
      requestId: 'req-xyz-789',
    });
  });

  it('parsea from/to a Date cuando son ISO válidos', async () => {
    await queryAuditEndpoint(
      makeContext({
        from: '2026-05-01T00:00:00Z',
        to: '2026-05-04T23:59:59Z',
      })
    );
    const args = lastQueryArgs();
    expect(args.from).toBeInstanceOf(Date);
    expect(args.to).toBeInstanceOf(Date);
    expect(args.from?.toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });

  it('rechaza from inválido con 400 (alineado con logs-query)', async () => {
    const result = await queryAuditEndpoint(makeContext({ from: 'no-es-fecha' }));
    expect(result).toMatchObject({ code: 400 });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rechaza to inválido con 400', async () => {
    const result = await queryAuditEndpoint(makeContext({ to: 'tampoco' }));
    expect(result).toMatchObject({ code: 400 });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('limit clamea al máximo de 1000', async () => {
    await queryAuditEndpoint(makeContext({ limit: '99999' }));
    const args = lastQueryArgs();
    expect(args.limit).toBe(1000);
  });

  it('limit inválido cae al default 100', async () => {
    await queryAuditEndpoint(makeContext({ limit: 'abc' }));
    const args = lastQueryArgs();
    expect(args.limit).toBe(100);
  });

  it('strings vacíos se tratan como undefined', async () => {
    await queryAuditEndpoint(makeContext({ tenant_id: '', action: '   ' }));
    const args = lastQueryArgs();
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
