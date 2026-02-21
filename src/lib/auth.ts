import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/generated/prisma/client";
import { normalizeEmail, verifyPassword } from "@/lib/password";

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
  providers: [
    Credentials({
      id: "credentials",
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;

        if (typeof email !== "string" || typeof password !== "string") {
          throw new Error("Missing credentials");
        }

        const normalizedEmail = normalizeEmail(email);
        const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

        if (!user || !user.passwordHash) {
          throw new Error("Invalid email or password");
        }

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) {
          throw new Error("Invalid email or password");
        }

        if (!user.emailVerified) {
          throw new Error("Email not verified");
        }

        return user;
      },
    }),
    Discord({
      clientId: process.env.AUTH_DISCORD_ID!,
      clientSecret: process.env.AUTH_DISCORD_SECRET!,
    }),
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  trustHost: true,
  session: { strategy: "jwt" },
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
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        (token as { role?: UserRole }).role = user.role;
      }

      if (!(token as { role?: UserRole }).role && token.sub) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { role: true },
        });
        (token as { role?: UserRole }).role = dbUser?.role;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.role = (token as { role?: UserRole }).role ?? "USER";
      }
      return session;
    },
  },
});
