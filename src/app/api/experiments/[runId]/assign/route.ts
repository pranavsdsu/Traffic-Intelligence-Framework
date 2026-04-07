import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { selectArm, type ArmDef } from "@/lib/assignment";

const querySchema = z.object({
  subjectId: z.string().min(1),
});

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  const { runId } = await ctx.params;
  const url = new URL(_req.url);
  const parsed = querySchema.safeParse({ subjectId: url.searchParams.get("subjectId") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ error: "subjectId required" }, { status: 400 });
  }

  const run = await prisma.experimentRun.findUnique({ where: { id: runId } });
  if (!run || run.status !== "running") {
    return NextResponse.json({ error: "Experiment not active" }, { status: 404 });
  }

  const arms = run.arms as ArmDef[];
  const existing = await prisma.experimentAssignment.findUnique({
    where: {
      experimentRunId_subjectId: { experimentRunId: run.id, subjectId: parsed.data.subjectId },
    },
  });
  if (existing) {
    return NextResponse.json({
      experimentRunId: run.id,
      armCode: existing.armCode,
      cached: true,
    });
  }

  const { armCode, vendorId } = selectArm(run.id, parsed.data.subjectId, run.assignmentSalt, arms);

  await prisma.experimentAssignment.create({
    data: {
      experimentRunId: run.id,
      subjectId: parsed.data.subjectId,
      armCode,
      stratumKey: null,
    },
  });

  return NextResponse.json({
    experimentRunId: run.id,
    armCode,
    vendorId,
    cached: false,
  });
}
