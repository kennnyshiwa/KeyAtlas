import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_KEY_MGMT } from "@/lib/rate-limit";
import { DELETED_USER_ID, deleteUserAccount } from "@/lib/users/delete-user-account";

/**
 * PATCH /api/v1/users/me
 * Update the authenticated user's profile (username, bio, displayName).
 */
export async function PATCH(req: NextRequest) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(user.id, "v1:users:me:patch", RATE_LIMIT_KEY_MGMT);
  if (limited) return limited;

  let body: { username?: string; bio?: string; displayName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { username, bio, displayName } = body;

  // Validate username if provided
  if (username !== undefined) {
    if (typeof username !== "string" || username.length < 3 || username.length > 30) {
      return NextResponse.json(
        { error: "Username must be between 3 and 30 characters" },
        { status: 400 }
      );
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return NextResponse.json(
        { error: "Username may only contain letters, numbers, hyphens, and underscores" },
        { status: 400 }
      );
    }
    // Check uniqueness
    const existing = await prisma.user.findFirst({
      where: { username, NOT: { id: user.id } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(username !== undefined && { username }),
      ...(bio !== undefined && { bio }),
      ...(displayName !== undefined && { displayName }),
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      image: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ data: updated });
}

/**
 * DELETE /api/v1/users/me
 * Permanently delete the authenticated user's account and all associated data.
 * Requires body: { "confirmation": "DELETE" }
 */
export async function DELETE(req: NextRequest) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(user.id, "v1:users:me:delete", RATE_LIMIT_KEY_MGMT);
  if (limited) return limited;

  let body: { confirmation?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.confirmation !== "DELETE") {
    return NextResponse.json(
      { error: 'Confirmation required. Send { "confirmation": "DELETE" } to proceed.' },
      { status: 400 }
    );
  }

  if (user.id === DELETED_USER_ID) {
    return NextResponse.json({ error: "This account cannot be deleted." }, { status: 400 });
  }

  await deleteUserAccount(user.id);

  return NextResponse.json({}, { status: 200 });
}
