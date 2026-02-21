import { prisma } from "../src/lib/prisma";

function normalizeImageUrl(input: string): string {
  let url = input.trim().replaceAll("&amp;", "&");

  try {
    const u = new URL(url);

    // If source is a Next.js image proxy URL, try to unwrap to the real image URL.
    if (u.pathname === "/_next/image") {
      const raw = u.searchParams.get("url");
      if (raw) {
        if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
        if (raw.startsWith("/")) return `${u.origin}${raw}`;
      }
    }
  } catch {
    // keep original if URL parse fails
  }

  return url;
}

async function main() {
  const projects = await prisma.project.findMany({
    where: { heroImage: { not: null } },
    select: { id: true, slug: true, heroImage: true },
  });

  let changed = 0;
  for (const p of projects) {
    const current = p.heroImage;
    if (!current) continue;
    const normalized = normalizeImageUrl(current);
    if (normalized !== current) {
      await prisma.project.update({
        where: { id: p.id },
        data: { heroImage: normalized },
      });
      changed++;
      console.log(`updated ${p.slug}`);
    }
  }

  console.log(`done: ${changed} updated`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
