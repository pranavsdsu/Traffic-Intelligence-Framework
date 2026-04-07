/**
 * MVP rule-based fraud / anomaly score (ANO), 0–100, higher = riskier.
 * Uses only edge-observable inputs per assignment design.
 */
export type FraudSignals = {
  clicksFromSubnetLast5m: number;
  datacenterAsnShare: number; // 0–1
  headlessUa: boolean;
  redirectErrorRate: number; // 0–1 recent window
  burstVsBaseline: number; // ratio, 1 = normal
};

const WEIGHTS = {
  velocity: 25,
  asn: 20,
  ua: 25,
  redirect: 20,
  burst: 15,
};

export function computeAnoRisk(s: FraudSignals): number {
  let score = 0;
  if (s.clicksFromSubnetLast5m > 50) score += WEIGHTS.velocity;
  else if (s.clicksFromSubnetLast5m > 20) score += 12;

  if (s.datacenterAsnShare > 0.4) score += WEIGHTS.asn;
  else if (s.datacenterAsnShare > 0.15) score += 8;

  if (s.headlessUa) score += WEIGHTS.ua;

  if (s.redirectErrorRate > 0.1) score += WEIGHTS.redirect;
  else if (s.redirectErrorRate > 0.05) score += 10;

  if (s.burstVsBaseline > 5) score += WEIGHTS.burst;
  else if (s.burstVsBaseline > 2.5) score += 8;

  return Math.min(100, score);
}

/** Heuristic UA check — MVP list */
export function isSuspiciousUserAgent(ua: string | null | undefined): boolean {
  if (!ua || ua.length < 10) return true;
  const u = ua.toLowerCase();
  return (
    u.includes("headless") ||
    u.includes("bot") ||
    u.includes("crawler") ||
    u.includes("scrapy")
  );
}
