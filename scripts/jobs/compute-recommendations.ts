/**
 * Rule-based recommendations; supersedes open recs for same vendor.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const RULE_VERSION = "mvp-1.0";

async function main() {
  const latest = await prisma.vendorScore.findMany({
    orderBy: { computedAt: "desc" },
    take: 500,
    include: { vendor: true },
  });
  const seen = new Map<string, (typeof latest)[0]>();
  for (const row of latest) {
    const k = `${row.vendorId}::${row.stratumKey}`;
    if (!seen.has(k)) seen.set(k, row);
  }

  await prisma.recommendation.updateMany({
    where: { validTo: null },
    data: { validTo: new Date() },
  });

  for (const score of seen.values()) {
    let action = "hold";
    const reasons: string[] = [];
    let confidence: "high" | "medium" | "low" = "medium";

    if (score.sessions < 30) {
      action = "test_more";
      reasons.push("insufficient_volume");
      confidence = "low";
    } else if (score.anoRisk >= 60) {
      action = "cut";
      reasons.push("fraud_risk");
      confidence = score.sessions > 100 ? "high" : "medium";
    } else if (
      (score.percentileInStratum ?? 0) >= 0.8 &&
      score.tier === "high_confidence"
    ) {
      action = "scale";
      reasons.push("top_quintile", "tier_high");
      confidence = "high";
    } else if ((score.percentileInStratum ?? 0) < 0.35 || score.tier === "watchlist") {
      action = "hold";
      reasons.push("below_median_or_watchlist");
      confidence = "medium";
    }

    await prisma.recommendation.create({
      data: {
        vendorId: score.vendorId,
        campaignId: null,
        action,
        reasonCodes: reasons,
        confidence,
        supportingScoreId: score.id,
        ruleVersion: RULE_VERSION,
        detail: {
          qDisplay: score.qDisplay,
          cpe: score.cpe,
          percentile: score.percentileInStratum,
          capSuggestionPct: action === "scale" ? 10 : 0,
        },
      },
    });
  }

  console.log("compute-recommendations:", seen.size, "rows");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
