import { prisma } from "../src/lib/prisma";

function pickImageFromHtml(html: string): string | null {
  const candidates: string[] = [];

  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)) {
    let src = m[1].trim();
    if (!src) continue;
    if (src.startsWith("//")) src = `https:${src}`;
    if (src.startsWith("/")) src = `https://geekhack.org${src}`;

    const lower = src.toLowerCase();
    if (
      lower.includes("smf") ||
      lower.includes("avatar") ||
      lower.includes("/themes/") ||
      lower.includes("banner.png") ||
      lower.includes("/smileys/") ||
      lower.includes("wink.gif") ||
      lower.includes("cdn.geekhack.org/themes") ||
      lower.endsWith(".svg")
    ) {
      continue;
    }
    if (!/^https?:\/\//i.test(src)) continue;

    candidates.push(src);
  }

  return candidates[0] ?? null;
}

async function fetchThreadImage(threadUrl: string): Promise<string | null> {
  try {
    const html = await fetch(threadUrl, { redirect: "follow" }).then((r) => r.text());
    return pickImageFromHtml(html);
  } catch {
    return null;
  }
}

async function main() {
  const projects = await prisma.project.findMany({
    where: {
      tags: { has: "geekhack" },
    },
    include: {
      links: true,
    },
    orderBy: { createdAt: "desc" },
  });

  let updated = 0;
  for (const project of projects) {
    const gh = project.links.find((l) => l.type === "GEEKHACK") || project.links[0];
    if (!gh) continue;

    const img = await fetchThreadImage(gh.url);
    if (!img) continue;

    await prisma.project.update({
      where: { id: project.id },
      data: { heroImage: img },
    });
    updated++;
    console.log(`updated ${project.slug} -> ${img}`);
  }

  console.log(`done: updated ${updated}/${projects.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
