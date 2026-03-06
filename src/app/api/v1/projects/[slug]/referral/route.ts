import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  let body: { ref?: string; utmSource?: string; utmCampaign?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { ref, utmSource, utmCampaign } = body;
  if (!ref || typeof ref !== "string") {
    return NextResponse.json({ error: "ref is required" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { slug },
    select: { id: true, published: true },
  });

  if (!project || !project.published) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  await prisma.referralClick.create({
    data: {
      projectId: project.id,
      ref,
      utmSource: utmSource ?? null,
      utmCampaign: utmCampaign ?? null,
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
