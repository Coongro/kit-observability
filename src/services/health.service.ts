import { getRuntimeState } from '../runtime/state.js';
import type { SinkHealth } from '../sinks/sink-base.js';

export interface PluginHealth {
  dbSink: SinkHealth;
  spanSink: SinkHealth;
}

export function collectHealth(): PluginHealth {
  const { dbSink, spanSink } = getRuntimeState();
  return {
    dbSink: dbSink.getHealth(),
    spanSink: spanSink.getHealth(),
  };
}
