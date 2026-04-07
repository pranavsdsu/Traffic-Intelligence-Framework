/**
 * Computes vendor_scores per vendor × stratum for rolling 7d window (MVP: single window).
 */
import { PrismaClient } from "@prisma/client";
import {
  METRIC_VERSION,
  computeVendorScore,
  tierFromSignals,
} from "../../src/lib/scoring";
import { computeAnoRisk, isSuspiciousUserAgent } from "../../src/lib/fraud";

const prisma = new PrismaClient();

const K_SHRINK = 40;
const S_REF = 200;
const MIN_SESSIONS = 30;
const MIN_SESSIONS_HIGH = 200;

async function main() {
  await prisma.vendorScore.deleteMany({
    where: { metricVersion: METRIC_VERSION, windowType: "7d" },
  });

  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

  const sessions = await prisma.session.findMany({
    where: {
      startedAt: { gte: windowStart, lte: windowEnd },
      closedAt: { not: null },
    },
  });

  type Cell = {
    vendorId: string;
    stratumKey: string;
    list: typeof sessions;
  };
  const byVendorStratum = new Map<string, Cell>();

  for (const s of sessions) {
    const key = `${s.vendorId}::${s.stratumKey}`;
    if (!byVendorStratum.has(key)) {
      byVendorStratum.set(key, { vendorId: s.vendorId, stratumKey: s.stratumKey, list: [] });
    }
    byVendorStratum.get(key)!.list.push(s);
  }

  const stratumTotals = new Map<string, { sessions: number; engaged: number }>();
  for (const [, g] of byVendorStratum) {
    for (const s of g.list) {
      const t = stratumTotals.get(g.stratumKey) || { sessions: 0, engaged: 0 };
      t.sessions += 1;
      if (s.engaged) t.engaged += 1;
      stratumTotals.set(g.stratumKey, t);
    }
  }
  const segmentMean = new Map<string, number>();
  for (const [sk, t] of stratumTotals) {
    segmentMean.set(sk, t.sessions ? t.engaged / t.sessions : 0.25);
  }

  const cpeByStratum = new Map<string, number[]>();
  for (const [, g] of byVendorStratum) {
    const engaged = g.list.filter((x) => x.engaged);
    const cost = g.list.reduce((a, s) => a + Number(s.totalCostCents), 0) / 100;
    const cpe = engaged.length ? cost / engaged.length : null;
    if (cpe !== null && cpe > 0) {
      const arr = cpeByStratum.get(g.stratumKey) || [];
      arr.push(cpe);
      cpeByStratum.set(g.stratumKey, arr);
    }
  }

  const percentileRank = (sorted: number[], p: number) => {
    if (!sorted.length) return null;
    const idx = Math.floor((sorted.length - 1) * p);
    return sorted[idx];
  };

  type Computed = {
    vendorId: string;
    stratumKey: string;
    qFinal: number;
    qRaw: number;
    qAdj: number;
    erShrunk: number;
    cpe: number | null;
    ano: number;
    confidence: number;
    sessions: number;
    engaged: number;
  };

  const computed: Computed[] = [];

  for (const [, g] of byVendorStratum) {
    const list = g.list;
    const n = list.length;
    const engagedCount = list.filter((x) => x.engaged).length;
    const er = n ? engagedCount / n : 0;
    const cost = list.reduce((a, s) => a + Number(s.totalCostCents), 0) / 100;
    const cpe = engagedCount ? cost / engagedCount : null;

    const cpes = [...(cpeByStratum.get(g.stratumKey) || [])].sort((a, b) => a - b);
    const p25 = percentileRank(cpes, 0.25);
    const p75 = percentileRank(cpes, 0.75);

    const mu = segmentMean.get(g.stratumKey) ?? 0.25;
    const ano = await estimateAnoForVendor(prisma, g.vendorId, windowStart);
    const stability = 0.85;

    const { erShrunk, qRaw, qAdj, qFinal, confidence } = computeVendorScore({
      er,
      segmentMeanEr: mu,
      n,
      k: K_SHRINK,
      cpe,
      cpeP25: p25,
      cpeP75: p75,
      stability,
      anoRisk: ano,
      sessions: n,
      sRef: S_REF,
    });

    computed.push({
      vendorId: g.vendorId,
      stratumKey: g.stratumKey,
      qFinal,
      qRaw,
      qAdj,
      erShrunk,
      cpe,
      ano,
      confidence,
      sessions: n,
      engaged: engagedCount,
    });
  }

  const byStratum = new Map<string, Computed[]>();
  for (const c of computed) {
    if (!byStratum.has(c.stratumKey)) byStratum.set(c.stratumKey, []);
    byStratum.get(c.stratumKey)!.push(c);
  }

  const stratumPercentile = new Map<string, number>();
  for (const [, arr] of byStratum) {
    const sorted = [...arr].sort((a, b) => b.qFinal - a.qFinal);
    sorted.forEach((row, i) => {
      const pct = sorted.length <= 1 ? 0.5 : 1 - i / (sorted.length - 1);
      stratumPercentile.set(`${row.vendorId}::${row.stratumKey}`, pct);
    });
  }

  for (const c of computed) {
    const pct =
      stratumPercentile.get(`${c.vendorId}::${c.stratumKey}`) ?? 0.5;
    const tier = tierFromSignals({
      qDisplay: c.qAdj,
      sessions: c.sessions,
      anoRisk: c.ano,
      minSessions: MIN_SESSIONS,
      minSessionsHigh: MIN_SESSIONS_HIGH,
      percentile: pct,
    });

    await prisma.vendorScore.create({
      data: {
        vendorId: c.vendorId,
        campaignId: null,
        stratumKey: c.stratumKey,
        windowStart,
        windowEnd,
        windowType: "7d",
        metricVersion: METRIC_VERSION,
        qRaw: c.qRaw,
        qDisplay: c.qAdj,
        erShrunk: c.erShrunk,
        cpe: c.cpe ?? undefined,
        anoRisk: c.ano,
        confidence: c.confidence,
        sessions: c.sessions,
        engagedSessions: c.engaged,
        tier,
        percentileInStratum: pct,
      },
    });
  }

  console.log("compute-scores: wrote", computed.length, "vendor_scores rows");
}

async function estimateAnoForVendor(
  prisma: PrismaClient,
  vendorId: string,
  since: Date,
): Promise<number> {
  const events = await prisma.trafficEvent.findMany({
    where: { vendorId, occurredAt: { gte: since } },
    select: { ipSubnet: true, userAgent: true, redirectStatus: true },
  });
  const subnetCounts = new Map<string, number>();
  for (const e of events) {
    const k = e.ipSubnet || "unknown";
    subnetCounts.set(k, (subnetCounts.get(k) || 0) + 1);
  }
  const maxSubnet = events.length ? Math.max(0, ...subnetCounts.values()) : 0;
  const badUa = events.filter((e) => isSuspiciousUserAgent(e.userAgent)).length;
  const headless = events.length > 0 && badUa > events.length * 0.1;
  const redirectFails = events.filter((e) => e.redirectStatus && e.redirectStatus >= 400).length;
  const redirectErrorRate = events.length ? redirectFails / events.length : 0;
  return computeAnoRisk({
    clicksFromSubnetLast5m: Math.min(100, maxSubnet),
    datacenterAsnShare: 0,
    headlessUa: headless,
    redirectErrorRate,
    burstVsBaseline: 1,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
