import { prisma } from "./prisma";

export async function getDashboardPayload() {
  const [vendors, latestScores, recommendations, alerts, sessionsAgg] = await Promise.all([
    prisma.vendor.findMany({ orderBy: { name: "asc" } }),
    prisma.vendorScore.findMany({
      orderBy: { computedAt: "desc" },
      take: 100,
      include: { vendor: true },
    }),
    prisma.recommendation.findMany({
      where: { validTo: null },
      orderBy: { createdAt: "desc" },
      include: { vendor: true },
    }),
    prisma.alert.findMany({
      where: { status: "open" },
      orderBy: { firedAt: "desc" },
      take: 20,
    }),
    prisma.session.aggregate({
      _count: { id: true },
      _sum: { totalCostCents: true },
      where: { closedAt: { not: null } },
    }),
  ]);

  const scoreByVendorStratum = new Map<string, (typeof latestScores)[0]>();
  for (const s of latestScores) {
    const k = `${s.vendorId}::${s.stratumKey}::${s.metricVersion}`;
    if (!scoreByVendorStratum.has(k)) scoreByVendorStratum.set(k, s);
  }
  const uniqueScores = [...scoreByVendorStratum.values()].sort((a, b) => b.qDisplay - a.qDisplay);

  const engaged = await prisma.session.count({ where: { engaged: true, closedAt: { not: null } } });
  const totalSessions = sessionsAgg._count.id;
  const spend = Number(sessionsAgg._sum.totalCostCents ?? 0) / 100;

  const portfolioQ =
    uniqueScores.length > 0
      ? uniqueScores.reduce((a, s) => a + s.qDisplay, 0) / uniqueScores.length
      : 0;

  const cpe =
    engaged > 0 ? spend / engaged : null;

  const topShare = uniqueScores.filter((s) => s.tier === "high_confidence").length;

  return {
    kpis: {
      spend,
      portfolioQ,
      engagedSessions: engaged,
      totalSessions,
      cpe,
      highTierCells: topShare,
      openAlerts: alerts.length,
    },
    leaderboard: uniqueScores.map((s) => ({
      vendorId: s.vendorId,
      vendorName: s.vendor.name,
      stratumKey: s.stratumKey,
      qDisplay: s.qDisplay,
      erShrunk: s.erShrunk,
      cpe: s.cpe,
      sessions: s.sessions,
      tier: s.tier,
      percentile: s.percentileInStratum,
      anoRisk: s.anoRisk,
      top20: (s.percentileInStratum ?? 0) >= 0.8 && s.sessions >= 30,
    })),
    recommendations,
    alerts,
  };
}
