/**
 * Groups traffic_events into Session rows and sets engaged + stratum per MVP rules.
 * MVP: one Session per unique sessionKey (latest batch wins).
 */
import { PrismaClient } from "@prisma/client";
import { buildStratumKey } from "../../src/lib/stratum";
import { sessionEngagedFromSignals } from "../../src/lib/engagement";

const prisma = new PrismaClient();

async function main() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const events = await prisma.trafficEvent.findMany({
    where: { occurredAt: { gte: since }, sessionKey: { not: null } },
    orderBy: { occurredAt: "asc" },
  });

  const byKey = new Map<string, typeof events>();
  for (const e of events) {
    const k = e.sessionKey!;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(e);
  }

  const campaignIds = [...new Set(events.map((e) => e.campaignId).filter(Boolean))] as string[];
  const campaigns = await prisma.campaign.findMany({ where: { id: { in: campaignIds } } });
  const verticalByCampaign = new Map(campaigns.map((c) => [c.id, c.vertical]));

  for (const [sessionKey, evs] of byKey) {
    const first = evs[0];
    const last = evs[evs.length - 1];
    const vendorId = first.vendorId;
    const campaignId = first.campaignId;
    if (!vendorId || !campaignId) continue;

    const vertical = verticalByCampaign.get(campaignId) ?? "automotive";

    let maxDwell = 0;
    let meaningful = 0;
    for (const e of evs) {
      if (e.eventType === "beacon" || e.eventType === "click") meaningful++;
      const p = e.payload as { dwellSec?: number } | null;
      if (p?.dwellSec != null) maxDwell = Math.max(maxDwell, p.dwellSec);
    }
    const engaged = sessionEngagedFromSignals({
      maxDwellSec: maxDwell,
      eventCount: meaningful,
    });

    const cost = evs.reduce((s, e) => s + Number(e.costCents ?? 0), 0);
    const stratumKey = buildStratumKey({
      geoCountry: first.geoCountry,
      deviceClass: first.deviceClass,
      vertical,
    });

    const endedAt = last.occurredAt;
    const closedAt = new Date();

    await prisma.session.upsert({
      where: { sessionKey },
      create: {
        sessionKey,
        subjectId: first.subjectId,
        vendorId,
        campaignId,
        startedAt: first.occurredAt,
        endedAt,
        engaged,
        engagementScore: engaged ? 1 : 0,
        totalCostCents: BigInt(Math.round(cost)),
        geoCountry: first.geoCountry,
        deviceClass: first.deviceClass,
        stratumKey,
        closedAt,
        experimentRunId: first.experimentRunId,
        armCode: first.armCode,
      },
      update: {
        endedAt,
        engaged,
        engagementScore: engaged ? 1 : 0,
        totalCostCents: BigInt(Math.round(cost)),
        stratumKey,
        closedAt,
        experimentRunId: first.experimentRunId,
        armCode: first.armCode,
        subjectId: first.subjectId ?? undefined,
      },
    });
  }

  console.log("close-sessions: upserted", byKey.size, "sessions");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
