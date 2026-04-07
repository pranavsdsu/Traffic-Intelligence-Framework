import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.alert.deleteMany({});

  const recent = await prisma.vendorScore.findMany({
    orderBy: { computedAt: "desc" },
    take: 200,
  });
  const best = new Map<string, (typeof recent)[0]>();
  for (const r of recent) {
    const k = `${r.vendorId}::${r.stratumKey}`;
    if (!best.has(k)) best.set(k, r);
  }

  for (const score of best.values()) {
    if (score.anoRisk >= 55) {
      await prisma.alert.create({
        data: {
          alertType: "fraud_risk",
          severity: score.anoRisk >= 70 ? "critical" : "warn",
          vendorId: score.vendorId,
          title: `Elevated ANO risk (${score.anoRisk.toFixed(0)})`,
          detail: { vendorId: score.vendorId, stratumKey: score.stratumKey, anoRisk: score.anoRisk },
        },
      });
    }
    if ((score.percentileInStratum ?? 1) < 0.2 && score.sessions >= 40) {
      await prisma.alert.create({
        data: {
          alertType: "quality_low",
          severity: "warn",
          vendorId: score.vendorId,
          title: "Vendor in bottom quintile for stratum",
          detail: { percentile: score.percentileInStratum, stratumKey: score.stratumKey },
        },
      });
    }
  }

  console.log("run-alerts: evaluated", best.size, "latest vendor×stratum scores");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
