import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

let prisma: PrismaClient | null = null;

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_QA_SCRIPT) {
    throw new Error("Refusing to create QA user in production without ALLOW_QA_SCRIPT");
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  prisma = new PrismaClient({ adapter });

  const email = process.env.QA_USER_EMAIL || "qa-user@keyatlas.local";
  const password = process.env.QA_USER_PASSWORD || "TestPassw0rd!";
  const displayName = process.env.QA_USER_NAME || "QA User";

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      displayName,
      name: displayName,
      emailVerified: new Date(),
    },
    create: {
      email,
      passwordHash,
      displayName,
      name: displayName,
      emailVerified: new Date(),
      role: "USER",
    },
    select: { id: true, email: true },
  });

  await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });

  console.log(`QA user ready: ${user.email} / ${password}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
