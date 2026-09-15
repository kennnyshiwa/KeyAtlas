import { createForumThread } from "@/lib/forums/create";
import { NextRequest } from "next/server";
export async function POST(req: NextRequest, { params }: { params: Promise<{ categorySlug: string }> }) {
  return createForumThread(req, (await params).categorySlug, true);
}
