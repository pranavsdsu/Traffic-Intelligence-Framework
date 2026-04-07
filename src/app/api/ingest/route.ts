import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";

const bodySchema = z.object({
  eventType: z.enum(["click", "redirect_ok", "redirect_fail", "beacon", "cost"]),
  vendorExternalRef: z.string(),
  campaignExternalRef: z.string(),
  sessionKey: z.string().optional(),
  subjectId: z.string().optional(),
  costCents: z.number().int().optional(),
  geoCountry: z.string().length(2).optional(),
  deviceClass: z.string().optional(),
  userAgent: z.string().optional(),
  ipSubnet: z.string().optional(),
  redirectStatus: z.number().optional(),
  dwellSec: z.number().optional(),
  experimentRunId: z.string().uuid().optional(),
  armCode: z.string().optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const b = parsed.data;

  const vendor = await prisma.vendor.findUnique({ where: { externalRef: b.vendorExternalRef } });
  if (!vendor) return NextResponse.json({ error: "Unknown vendor" }, { status: 400 });
  const campaign = await prisma.campaign.findFirst({
    where: { vendorId: vendor.id, externalRef: b.campaignExternalRef },
  });
  if (!campaign) return NextResponse.json({ error: "Unknown campaign for vendor" }, { status: 400 });

  const eventId = uuidv4();
  const payload =
    b.dwellSec != null ? { dwellSec: b.dwellSec } : undefined;

  await prisma.trafficEvent.create({
    data: {
      eventId,
      occurredAt: new Date(),
      eventType: b.eventType,
      vendorId: vendor.id,
      campaignId: campaign.id,
      sessionKey: b.sessionKey,
      subjectId: b.subjectId,
      experimentRunId: b.experimentRunId,
      armCode: b.armCode,
      costCents: b.costCents != null ? BigInt(b.costCents) : undefined,
      geoCountry: b.geoCountry,
      deviceClass: b.deviceClass,
      userAgent: b.userAgent,
      ipSubnet: b.ipSubnet,
      redirectStatus: b.redirectStatus,
      payload: payload ?? undefined,
    },
  });

  return NextResponse.json({ accepted: true, eventId }, { status: 202 });
}
