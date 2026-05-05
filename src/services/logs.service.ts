import { LogLevel } from '@coongro/core-logging';
import type { LogEntry } from '@coongro/core-logging';

import { queryLogs, type LogQueryFilters, type LogQueryResult } from '../repositories/logs.js';
import { getRuntimeState } from '../runtime/state.js';

export { type LogQueryFilters, type LogQueryResult };

export async function queryLogsService(filters: LogQueryFilters): Promise<LogQueryResult> {
  const { systemDb } = getRuntimeState();
  return queryLogs(systemDb.raw, filters);
}

export interface FrontendErrorInput {
  message: string;
  level?: number;
  stack?: string;
  url?: string;
  userAgent?: string;
  tenantId?: string;
}

export function ingestFrontendError(input: FrontendErrorInput): void {
  const { dbSink } = getRuntimeState();
  const entry: LogEntry = {
    level: input.level ?? LogLevel.ERROR,
    message: input.message,
    timestamp: new Date().toISOString(),
    name: 'frontend',
    context: {
      tenantId: input.tenantId,
      url: input.url,
      userAgent: input.userAgent,
    },
    error: input.stack
      ? { message: input.message, stack: input.stack, name: 'FrontendError' }
      : undefined,
  };
  dbSink.write(entry);
}
