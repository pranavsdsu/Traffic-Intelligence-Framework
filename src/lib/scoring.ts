/**
 * Vendor quality scoring — MVP composite Q (0–100 display scale).
 * er_shrunk: beta-style shrinkage toward segment mean.
 */

export const METRIC_VERSION = "mvp-1.0";

export type ScoreInputs = {
  /** Raw engagement rate 0–1 */
  er: number;
  /** Segment mean ER 0–1 */
  segmentMeanEr: number;
  /** Session count in window */
  n: number;
  /** Shrinkage strength (pseudo-sessions) */
  k: number;
  /** Cost per engaged session; lower is better */
  cpe: number | null;
  /** Segment CPE P25, P75 for normalization */
  cpeP25: number | null;
  cpeP75: number | null;
  /** Stability 0–1 (higher = more stable) */
  stability: number;
  /** ANO 0–100 */
  anoRisk: number;
  /** Reference sessions for confidence */
  sessions: number;
  sRef: number;
};

const W_ER = 0.45;
const W_CPE = 0.35;
const W_STAB = 0.2;
const LAMBDA_ANO = 0.65;
const ALPHA_RECENCY = 0.65;

function erShrunk(er: number, segmentMean: number, n: number, k: number): number {
  return (k * segmentMean + n * er) / (k + n);
}

function cpeNorm(cpe: number, p25: number, p75: number): number {
  if (p75 <= p25) return 0.5;
  const t = (cpe - p25) / (p75 - p25);
  return Math.max(0, Math.min(1, 1 - t));
}

export function computeQRaw(inputs: {
  erStar: number;
  cpeNorm: number | null;
  stability: number;
  hasCpe: boolean;
}): number {
  const cpePart = inputs.hasCpe && inputs.cpeNorm !== null ? inputs.cpeNorm : null;
  const w1 = inputs.hasCpe ? W_ER : 0.6;
  const w2 = inputs.hasCpe ? W_CPE : 0;
  const w3 = inputs.hasCpe ? W_STAB : 0.4;
  const sumW = w1 + w2 + w3;
  const erPart = (w1 / sumW) * inputs.erStar;
  const cpeComponent = cpePart !== null ? (w2 / sumW) * cpePart : 0;
  const stabPart = (w3 / sumW) * inputs.stability;
  return 100 * (erPart + cpeComponent + stabPart);
}

export function applyAnoPenalty(qRaw: number, anoRisk: number): number {
  const anoNorm = Math.min(1, anoRisk / 100);
  return qRaw * (1 - LAMBDA_ANO * anoNorm);
}

export function confidenceFromSessions(sessions: number, sRef: number): number {
  return Math.min(1, sessions / (sessions + sRef));
}

export function blend7d28d(q7: number, q28: number): number {
  return ALPHA_RECENCY * q7 + (1 - ALPHA_RECENCY) * q28;
}

export function computeVendorScore(s: ScoreInputs): {
  erShrunk: number;
  qRaw: number;
  qAdj: number;
  qFinal: number;
  confidence: number;
} {
  const erStar = erShrunk(s.er, s.segmentMeanEr, s.n, s.k);
  const hasCpe = s.cpe !== null && s.cpeP25 !== null && s.cpeP75 !== null && s.cpe > 0;
  const cn =
    hasCpe && s.cpeP25 !== null && s.cpeP75 !== null ? cpeNorm(s.cpe!, s.cpeP25, s.cpeP75) : null;
  const qRaw = computeQRaw({
    erStar,
    cpeNorm: cn,
    stability: s.stability,
    hasCpe: !!hasCpe,
  });
  const qAdj = applyAnoPenalty(qRaw, s.anoRisk);
  const conf = confidenceFromSessions(s.sessions, s.sRef);
  const qFinal = qAdj * conf;
  return { erShrunk: erStar, qRaw, qAdj, qFinal, confidence: conf };
}

export type Tier = "high_confidence" | "watchlist" | "suppress" | "insufficient_data";

export function tierFromSignals(args: {
  qDisplay: number;
  sessions: number;
  anoRisk: number;
  minSessions: number;
  minSessionsHigh: number;
  percentile: number | null;
}): Tier {
  if (args.sessions < args.minSessions) return "insufficient_data";
  if (args.anoRisk >= 70) return "suppress";
  if (args.anoRisk >= 45 || (args.percentile !== null && args.percentile < 0.35))
    return "watchlist";
  if (
    args.sessions >= args.minSessionsHigh &&
    args.anoRisk < 35 &&
    args.percentile !== null &&
    args.percentile >= 0.8
  )
    return "high_confidence";
  if (args.qDisplay >= 55 && args.anoRisk < 40) return "watchlist";
  return "watchlist";
}
