import fs from "node:fs";
import { prisma } from "../src/lib/prisma";
import { slugify } from "../src/lib/slug";

async function main() {
  const raw = JSON.parse(fs.readFileSync("tmp/import-debug/125221.json", "utf8"));
  const cleanTitle = String(raw.title || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^.*?Author\s+Topic:\s*/i, "")
    .replace(/^Topic:\s*/i, "")
    .replace(/\(Read\s+\d+\s+times\)\s*$/i, "")
    .trim() || "Geekhack Import 125221";

  const baseSlug = slugify(`${raw.topicId}-${cleanTitle}`.slice(0, 140), 110) || `geekhack-${raw.topicId}`;
  let slug = baseSlug;
  let i = 1;
  while (await prisma.project.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${baseSlug}-${i++}`;
  }

  const owner =
    (await prisma.user.findFirst({
      where: { email: { in: ["kenneth.stjohn@me.com", "kstjohn@kstj.us"] } },
      select: { id: true, email: true },
    })) || (await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true, email: true } }));

  if (!owner) throw new Error("No owner user found");

  const opHtml = raw?.op?.contentHtml || "";
  const opText = (raw?.op?.contentText || "").trim();
  const bodyHtml = opHtml?.trim()
    ? opHtml
    : `<pre>${opText.replace(/[&<>]/g, (m: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m] as string))}</pre>`;
  const desc = `${bodyHtml}\n\n<p><strong>Source thread:</strong> <a href=\"${raw.canonicalUrl}\" target=\"_blank\" rel=\"noreferrer\">${raw.canonicalUrl}</a></p>`;
  const imageUrls: string[] = (raw?.metadata?.allImageUrls || []).filter((u: string) => /^https?:\/\//.test(u));

  const project = await prisma.project.create({
    data: {
      title: cleanTitle,
      slug,
      description: desc.slice(0, 120000),
      category: "KEYCAPS",
      status: "INTEREST_CHECK",
      currency: "USD",
      tags: ["geekhack", "ic", "import-test", "np-r"],
      creatorId: owner.id,
      published: true,
      links: {
        create: [{ label: "Geekhack Thread", url: raw.canonicalUrl || raw.sourceUrl, type: "GEEKHACK" }],
      },
      images: {
        create: imageUrls.slice(0, 12).map((url, idx) => ({ url, order: idx, alt: cleanTitle })),
      },
    },
    select: { id: true, slug: true, title: true },
  });

  console.log(
    JSON.stringify(
      { owner: owner.email, project, url: `http://localhost:3000/projects/${project.slug}` },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
