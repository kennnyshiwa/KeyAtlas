import { prisma } from "../src/lib/prisma";
import { ProjectCategory, ProjectStatus } from "../src/generated/prisma/client";

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90);
}

function categoryFromTitle(title: string): ProjectCategory {
  const t = title.toLowerCase();
  if (t.includes("gmk") || t.includes("kkb") || t.includes("dss") || t.includes("keycap")) {
    return "KEYCAPS";
  }
  if (t.includes("switch")) return "SWITCHES";
  if (t.includes("deskmat") || t.includes("mat")) return "DESKMATS";
  return "KEYBOARDS";
}

function cleanTitle(raw: string) {
  return raw.replace(/^\[IC\]\s*/i, "").replace(/^\[GB\]\s*/i, "").trim();
}

async function scrapeBoard(board: number, kind: "IC" | "GB") {
  const url = `https://geekhack.org/index.php?board=${board}.0`;
  const html = await fetch(url).then((r) => r.text());

  const regex = /<a[^>]+href="([^"]*topic=\d+\.0[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const out: Array<{ title: string; link: string }> = [];
  const seen = new Set<string>();

  for (const m of html.matchAll(regex)) {
    let href = m[1]
      .replaceAll("&amp;", "&")
      .replace(/^https:\/\/geekhack\.org\/index\.php\?PHPSESSID=[^&]+&/, "https://geekhack.org/index.php?");

    const topic = href.match(/topic=\d+\.0/);
    if (!topic) continue;
    href = `https://geekhack.org/index.php?${topic[0]}`;

    const title = cleanTitle(m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
    if (!title) continue;

    const lower = title.toLowerCase();
    if (
      lower === "this!" ||
      /^\d+$/.test(title) ||
      lower === "all" ||
      lower.includes("group buy rules") ||
      lower.includes("list of currently running") ||
      lower.includes("vendor trust and safety") ||
      lower.includes("please read") ||
      lower.includes("what is a group buy") ||
      lower.includes("how to contact") ||
      lower.includes("psa regarding") ||
      lower.includes("important information regarding") ||
      lower.includes("tos")
    ) {
      continue;
    }

    if (kind === "GB" && !/(\[gb\]|group buy|gb\b|live|shipping)/i.test(m[2] + " " + title)) {
      continue;
    }

    const key = `${title}::${href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, link: href });
    if (out.length >= 10) break;
  }

  return out;
}

async function main() {
  console.log("Scraping Geekhack boards...");
  const [ics, gbs] = await Promise.all([
    scrapeBoard(132, "IC"),
    scrapeBoard(70, "GB"),
  ]);

  if (ics.length < 10 || gbs.length < 10) {
    throw new Error(`Not enough items scraped (IC=${ics.length}, GB=${gbs.length})`);
  }

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
  if (!admin) throw new Error("No admin user found");

  const vendor = await prisma.vendor.upsert({
    where: { slug: "geekhack" },
    update: { name: "Geekhack", verified: true },
    create: {
      name: "Geekhack",
      slug: "geekhack",
      description: "Imported from Geekhack forum listings",
      storefrontUrl: "https://geekhack.org",
      verified: true,
      regionsServed: ["Global"],
      ownerId: admin.id,
    },
  });

  await prisma.$transaction(async (tx) => {
    await tx.project.deleteMany({});

    const rows = [
      ...ics.map((x) => ({ ...x, status: "INTEREST_CHECK" as ProjectStatus })),
      ...gbs.map((x) => ({ ...x, status: "GROUP_BUY" as ProjectStatus })),
    ];

    for (const r of rows) {
      const base = slugify(r.title) || `project-${Math.random().toString(36).slice(2, 8)}`;
      let slug = base;
      let i = 1;
      while (await tx.project.findUnique({ where: { slug }, select: { id: true } })) {
        slug = `${base}-${i++}`;
      }

      await tx.project.create({
        data: {
          title: r.title,
          slug,
          description: `Imported from Geekhack: <a href="${r.link}" target="_blank" rel="noreferrer">${r.link}</a>`,
          category: categoryFromTitle(r.title),
          status: r.status,
          currency: "USD",
          tags: ["geekhack", r.status === "INTEREST_CHECK" ? "interest-check" : "group-buy"],
          vendorId: vendor.id,
          creatorId: admin.id,
          published: true,
          featured: false,
          links: {
            create: [{ label: "Geekhack Thread", url: r.link, type: "GEEKHACK" }],
          },
          projectVendors: {
            create: [{ vendorId: vendor.id, region: "Global", storeLink: r.link }],
          },
        },
      });
    }
  });

  console.log(`Imported ${ics.length} IC + ${gbs.length} GB projects from Geekhack.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
