import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();

async function main() {
  await prisma.alert.deleteMany();
  await prisma.recommendation.deleteMany();
  await prisma.vendorScore.deleteMany();
  await prisma.experimentAssignment.deleteMany();
  await prisma.session.deleteMany();
  await prisma.trafficEvent.deleteMany();
  await prisma.experimentRun.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.vendor.deleteMany();

  const v1 = await prisma.vendor.create({
    data: { externalRef: "ven_alpha", name: "Alpha Motors Traffic", status: "active" },
  });
  const v2 = await prisma.vendor.create({
    data: { externalRef: "ven_beta", name: "Beta Auto Network", status: "active" },
  });
  const v3 = await prisma.vendor.create({
    data: { externalRef: "ven_gamma", name: "Gamma Clicks", status: "active" },
  });

  const c1 = await prisma.campaign.create({
    data: {
      vendorId: v1.id,
      externalRef: "cmp_vdp_us",
      name: "US VDP prospecting",
      vertical: "automotive",
    },
  });
  const c2 = await prisma.campaign.create({
    data: {
      vendorId: v2.id,
      externalRef: "cmp_vdp_us",
      name: "US VDP prospecting",
      vertical: "automotive",
    },
  });
  const c3 = await prisma.campaign.create({
    data: {
      vendorId: v3.id,
      externalRef: "cmp_vdp_us",
      name: "US VDP prospecting",
      vertical: "automotive",
    },
  });

  const exp = await prisma.experimentRun.create({
    data: {
      experimentKey: "vendor_bakeoff_q1",
      version: 1,
      title: "Alpha vs Beta routing",
      status: "running",
      startsAt: new Date(Date.now() - 3 * 24 * 3600 * 1000),
      endsAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      arms: [
        { code: "A", vendorId: v1.id, weightBps: 5000 },
        { code: "B", vendorId: v2.id, weightBps: 5000 },
      ],
      maxDivertedFraction: 0.12,
      assignmentSalt: "seed-salt-2026",
      eligibility: { geo: ["US"], device: ["mobile", "desktop"] },
    },
  });

  const now = Date.now();
  const vendors = [
    { v: v1, c: c1, er: 0.32, bad: 0.02 },
    { v: v2, c: c2, er: 0.26, bad: 0.05 },
    { v: v3, c: c3, er: 0.18, bad: 0.12 },
  ];

  for (let i = 0; i < 400; i++) {
    const pick = vendors[i % 3]!;
    const engaged = Math.random() > 1 - pick.er - (pick.bad > 0.1 ? 0.08 : 0);
    const sessionKey = `sess_${i}`;
    const subjectId = `sub_${Math.floor(i / 2)}`;
    const ts = new Date(now - i * 3600 * 1000);
    const eventId = uuidv4();

    await prisma.trafficEvent.create({
      data: {
        eventId,
        occurredAt: ts,
        eventType: "click",
        vendorId: pick.v.id,
        campaignId: pick.c.id,
        sessionKey,
        subjectId,
        costCents: 80n,
        geoCountry: "US",
        deviceClass: "mobile",
        userAgent:
          pick.bad > 0.1 && i % 7 === 0
            ? "HeadlessChrome/1.0"
            : "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
        ipSubnet: `104.${(i % 5) + 1}.0.0`,
        redirectStatus: 302,
        payload: {},
      },
    });

    if (engaged) {
      await prisma.trafficEvent.create({
        data: {
          eventId: uuidv4(),
          occurredAt: new Date(ts.getTime() + 2000),
          eventType: "beacon",
          vendorId: pick.v.id,
          campaignId: pick.c.id,
          sessionKey,
          subjectId,
          costCents: 0n,
          geoCountry: "US",
          deviceClass: "mobile",
          userAgent: "Mozilla/5.0",
          ipSubnet: `104.${(i % 5) + 1}.0.0`,
          redirectStatus: 302,
          payload: { dwellSec: 12 },
        },
      });
    }
  }

  console.log("Seed: vendors, campaigns, events created. Experiment:", exp.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
