import { NextRequest } from "next/server";
import { createForumThread } from "@/lib/forums/create";

export async function POST(req: NextRequest) {
  return createForumThread(req);
}
