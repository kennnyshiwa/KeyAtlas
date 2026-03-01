import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const RATE_LIMIT_UPLOAD_DIRECT = { limit: 20, window: 300 };

interface CloudflareDirectUploadResult {
  id: string;
  uploadURL: string;
}

interface CloudflareDirectUploadResponse {
  success: boolean;
  errors?: Array<{ message?: string }>;
  result?: CloudflareDirectUploadResult;
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(
    session.user.id,
    "upload:direct",
    RATE_LIMIT_UPLOAD_DIRECT
  );
  if (limited) return limited;

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    return NextResponse.json(
      { error: "Cloudflare Images is not configured" },
      { status: 500 }
    );
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v2/direct_upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        metadata: {
          userId: session.user.id,
        },
      }),
      cache: "no-store",
    }
  );

  const payload = (await response.json()) as CloudflareDirectUploadResponse;

  if (!response.ok || !payload.success || !payload.result?.uploadURL || !payload.result?.id) {
    const reason = payload.errors?.[0]?.message ?? "Unknown direct upload error";
    return NextResponse.json(
      { error: `Failed to create direct upload URL: ${reason}` },
      { status: 502 }
    );
  }

  return NextResponse.json({
    uploadURL: payload.result.uploadURL,
    id: payload.result.id,
  });
}
