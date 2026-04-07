/**
 * Frozen MVP rule: engaged if dwell >= 10s OR >= 2 meaningful events in session.
 * Implemented in session closer using events — here for documentation + client hints.
 */
export const ENGAGED_DWELL_SEC = 10;

export function sessionEngagedFromSignals(args: {
  maxDwellSec: number;
  eventCount: number;
}): boolean {
  return args.maxDwellSec >= ENGAGED_DWELL_SEC || args.eventCount >= 2;
}
