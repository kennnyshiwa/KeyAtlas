import fs from "node:fs";
import { prisma } from "../src/lib/prisma";

async function main() {
  const raw = JSON.parse(fs.readFileSync("tmp/import-debug/125221.json", "utf8"));
  const cleanTitle = String(raw.title || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^.*?Author\s+Topic:\s*/i, "")
    .replace(/^Topic:\s*/i, "")
    .replace(/\(Read\s+\d+\s+times\)\s*$/i, "")
    .trim();

  const opHtml = raw?.op?.contentHtml || "";
  const opText = (raw?.op?.contentText || "").trim();
  const esc = (s: string) => s.replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m] as string));
  const bodyHtml = opHtml?.trim() ? opHtml : `<pre>${esc(opText)}</pre>`;
  const desc = `${bodyHtml}\n\n<p><strong>Source thread:</strong> <a href=\"${raw.canonicalUrl}\" target=\"_blank\" rel=\"noreferrer\">${raw.canonicalUrl}</a></p>`;

  const slug = "125221-author-topic-ic-np-r-numpad-retro-gb-mar-5th";
  const project = await prisma.project.findUnique({ where: { slug }, select: { id: true } });
  if (!project) throw new Error("project not found");

  await prisma.$transaction(async (tx) => {
    await tx.projectVendor.deleteMany({ where: { projectId: project.id } });
    await tx.project.update({
      where: { id: project.id },
      data: {
        title: cleanTitle,
        description: desc.slice(0, 120000),
        vendorId: null,
        tags: ["geekhack", "ic", "import-test", "np-r"],
      },
    });
  });

  console.log(JSON.stringify({ projectId: project.id, title: cleanTitle, slug }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
