import { describe, expect, it, vi } from 'vitest';

import { openTrace, TRACE_VIEW_ID } from './open-trace.js';

function makeViewsApi() {
  const open = vi.fn();
  return { views: { open }, open };
}

describe('openTrace', () => {
  it('does nothing when traceId is null', () => {
    const { views, open } = makeViewsApi();
    openTrace(views, null);
    expect(open).not.toHaveBeenCalled();
  });

  it('does nothing when traceId is undefined', () => {
    const { views, open } = makeViewsApi();
    openTrace(views, undefined);
    expect(open).not.toHaveBeenCalled();
  });

  it('does nothing when traceId is empty string', () => {
    const { views, open } = makeViewsApi();
    openTrace(views, '');
    expect(open).not.toHaveBeenCalled();
  });

  it('does nothing when traceId is whitespace only', () => {
    const { views, open } = makeViewsApi();
    openTrace(views, '   \t\n  ');
    expect(open).not.toHaveBeenCalled();
  });

  it('trims whitespace and forwards the trimmed id', () => {
    const { views, open } = makeViewsApi();
    openTrace(views, '   abc123   ');
    expect(open).toHaveBeenCalledWith(TRACE_VIEW_ID, { trace_id: 'abc123' });
  });

  it('uses the canonical view id constant', () => {
    const { views, open } = makeViewsApi();
    openTrace(views, 'abc');
    expect(open).toHaveBeenCalledWith('kit-observability.trace.open', { trace_id: 'abc' });
  });
});
