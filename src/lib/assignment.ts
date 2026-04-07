import { createHash } from "crypto";

export type ArmDef = { code: string; vendorId?: string; weightBps: number };

/**
 * Deterministic arm selection: hash(experimentId + subjectId + salt) mod 10000 → cumulative bps.
 */
export function selectArm(
  experimentId: string,
  subjectId: string,
  salt: string,
  arms: ArmDef[],
): { armCode: string; vendorId?: string } {
  const sorted = [...arms].sort((a, b) => a.code.localeCompare(b.code));
  const total = sorted.reduce((s, a) => s + a.weightBps, 0);
  if (total !== 10000) {
    throw new Error(`Arms must sum to 10000 bps, got ${total}`);
  }
  const h = createHash("sha256")
    .update(`${experimentId}|${subjectId}|${salt}`)
    .digest();
  const mod = h.readUInt32BE(0) % 10000;
  let cum = 0;
  for (const arm of sorted) {
    cum += arm.weightBps;
    if (mod < cum) return { armCode: arm.code, vendorId: arm.vendorId };
  }
  return { armCode: sorted[sorted.length - 1].code, vendorId: sorted[sorted.length - 1].vendorId };
}
