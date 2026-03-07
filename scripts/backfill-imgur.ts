import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { isImgurUrl, mirrorImgurUrlToLocal } from "../src/lib/import/imgur-mirror";

type Counters = {
  scannedProjects: number;
  scannedUrls: number;
  rewrittenUrls: number;
  failedUrls: number;
  updatedProjects: number;
};

const IMG_SRC_RE = /(<img\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'][^>]*>)/gi;

function getArgValue(name: string): string | null {
  const direct = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);

  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return null;
}

const dryRun = process.argv.includes("--dry-run");
const batchSize = Math.max(1, Number(getArgValue("--batch") ?? "50"));

async function tryMirror(url: string, counters: Counters): Promise<string> {
  if (!isImgurUrl(url)) return url;

  counters.scannedUrls += 1;
  try {
    const mirrored = await mirrorImgurUrlToLocal(url);
    if (mirrored !== url) counters.rewrittenUrls += 1;
    return mirrored;
  } catch {
    counters.failedUrls += 1;
    return url;
  }
}

async function rewriteDescription(description: string, counters: Counters): Promise<string> {
  const rewrites = new Map<string, string>();

  for (const match of description.matchAll(IMG_SRC_RE)) {
    const src = match[2]?.trim();
    if (!src || rewrites.has(src) || !isImgurUrl(src)) continue;
    rewrites.set(src, await tryMirror(src, counters));
  }

  if (rewrites.size === 0) return description;

  return description.replace(IMG_SRC_RE, (full, prefix: string, src: string, suffix: string) => {
    const rewritten = rewrites.get(src);
    if (!rewritten) return full;
    return `${prefix}${rewritten}${suffix}`;
  });
}

async function main() {
  const counters: Counters = {
    scannedProjects: 0,
    scannedUrls: 0,
    rewrittenUrls: 0,
    failedUrls: 0,
    updatedProjects: 0,
  };

  console.log(`Starting Imgur backfill (dryRun=${dryRun}, batchSize=${batchSize})`);

  let cursor: string | null = null;

  while (true) {
    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { heroImage: { contains: "imgur", mode: "insensitive" } },
          { description: { contains: "imgur", mode: "insensitive" } },
          { images: { some: { url: { contains: "imgur", mode: "insensitive" } } } },
        ],
      },
      include: {
        images: {
          where: { url: { contains: "imgur", mode: "insensitive" } },
          select: { id: true, url: true },
        },
      },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
    });

    if (projects.length === 0) break;
    cursor = projects[projects.length - 1].id;

    for (const project of projects) {
      counters.scannedProjects += 1;

      const nextHeroImage = project.heroImage ? await tryMirror(project.heroImage, counters) : project.heroImage;
      const nextDescription = project.description
        ? await rewriteDescription(project.description, counters)
        : project.description;

      const imageUpdates: Array<{ id: string; url: string }> = [];
      for (const image of project.images) {
        const nextUrl = await tryMirror(image.url, counters);
        if (nextUrl !== image.url) {
          imageUpdates.push({ id: image.id, url: nextUrl });
        }
      }

      const projectData: { heroImage?: string | null; description?: string | null } = {};
      if (nextHeroImage !== project.heroImage) projectData.heroImage = nextHeroImage;
      if (nextDescription !== project.description) projectData.description = nextDescription;

      const projectChanged = Object.keys(projectData).length > 0 || imageUpdates.length > 0;
      if (!projectChanged) continue;

      counters.updatedProjects += 1;

      if (!dryRun) {
        await prisma.$transaction(async (tx) => {
          if (Object.keys(projectData).length > 0) {
            await tx.project.update({
              where: { id: project.id },
              data: projectData,
            });
          }

          for (const image of imageUpdates) {
            await tx.projectImage.update({
              where: { id: image.id },
              data: { url: image.url },
            });
          }
        });
      }

      console.log(
        `[${dryRun ? "dry-run" : "updated"}] project=${project.id} hero=${
          projectData.heroImage !== undefined
        } description=${projectData.description !== undefined} images=${imageUpdates.length}`
      );
    }
  }

  console.log("Backfill complete", counters);
}

main()
  .catch((error) => {
    console.error("Backfill failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
