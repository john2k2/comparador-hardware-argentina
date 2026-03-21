import type { OperationalTelemetryState } from './types';

declare global {
  var __OPERATIONS_TELEMETRY__: OperationalTelemetryState | undefined;
}

export function getState(): OperationalTelemetryState {
  if (!globalThis.__OPERATIONS_TELEMETRY__) {
    globalThis.__OPERATIONS_TELEMETRY__ = {
      storeEvents: [],
      endpointEvents: [],
    };
  }
  return globalThis.__OPERATIONS_TELEMETRY__;
}

export function pushWithCap<T>(target: T[], item: T, cap: number): void {
  target.push(item);
  if (target.length > cap) {
    target.splice(0, target.length - cap);
  }
}
