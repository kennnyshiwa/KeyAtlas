import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  buildGeekhackPrefillPayload,
  fetchGeekhackThread,
  validateGeekhackTopicUrl,
} from "@/lib/import/geekhack";
import { mirrorImgurImageSrcsInHtml, mirrorPrefillImages } from "@/lib/import/imgur-mirror";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  const topic = validateGeekhackTopicUrl(url);
  if (!topic) {
    return NextResponse.json({ error: "Please enter a valid Geekhack topic URL" }, { status: 400 });
  }

  try {
    const thread = await fetchGeekhackThread(topic.normalizedUrl);
    const basePrefill = buildGeekhackPrefillPayload(thread);
    const prefill = {
      ...basePrefill,
      description: await mirrorImgurImageSrcsInHtml(basePrefill.description, session.user.id),
      images: await mirrorPrefillImages(basePrefill.images, session.user.id),
    };

    return NextResponse.json({ prefill, thread: { title: thread.title, canonicalUrl: thread.canonicalUrl } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import Geekhack topic";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
