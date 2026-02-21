import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/generated/prisma";

function slugifyUsername(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}

async function ensureDiscordUsername(userId: string, seed?: string | null) {
  const base = slugifyUsername(seed || "user");
  if (!base || base.length < 3) return;

  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, displayName: true, name: true },
  });

  if (current?.username) return;

  let candidate = base;
  let i = 1;
  while (await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } })) {
    const suffix = `-${i++}`;
    candidate = `${base.slice(0, Math.max(3, 30 - suffix.length))}${suffix}`;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      username: candidate,
      ...(current?.displayName ? {} : { displayName: current?.name ?? seed ?? null }),
    },
  });
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: UserRole;
    };
  }

  interface User {
    role: UserRole;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma) as never,
  providers: [Discord, Google],
  session: { strategy: "database" },
  pages: {
    signIn: "/sign-in",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "discord" && user?.id) {
        const profileSeed =
          (profile as { username?: string; global_name?: string } | null)?.global_name ||
          (profile as { username?: string; global_name?: string } | null)?.username ||
          user.name;
        await ensureDiscordUsername(user.id, profileSeed);
      }
      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = user.role;
      }
      return session;
    },
  },
});
