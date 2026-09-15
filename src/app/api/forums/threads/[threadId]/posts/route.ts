import { createForumPost } from "@/lib/forums/create";
import { NextRequest } from "next/server";
export async function POST(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  return createForumPost(req, (await params).threadId, true);
}
