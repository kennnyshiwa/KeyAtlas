import { prisma } from "../src/lib/prisma";
import {
  mirrorImportImageSrcsInHtml,
  mirrorImportImageUrlOrOriginal,
} from "../src/lib/import/imgur-mirror";
import { stripBrokenImageBlocksFromHtml } from "../src/lib/import/geekhack-auto-import";

type Options = {
  apply: boolean;
  slug?: string;
  limit?: number;
};

function parseArgs(argv: string[]): Options {
  const options: Options = { apply: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--slug") options.slug = argv[++i];
    else if (arg === "--limit") {
      const value = Number(argv[++i]);
      if (Number.isFinite(value) && value > 0) options.limit = value;
    }
  }

  return options;
}

function geekhackContains(host: string) {
  return { contains: host } as const;
}

function buildWhere(options: Options) {
  if (options.slug) {
    return { slug: options.slug };
  }

  return {
    OR: [
      { description: geekhackContains("geekhack.org") },
      { description: geekhackContains("cdn.geekhack.org") },
      { heroImage: geekhackContains("geekhack.org") },
      { heroImage: geekhackContains("cdn.geekhack.org") },
      {
        images: {
          some: {
            OR: [
              { url: geekhackContains("geekhack.org") },
              { url: geekhackContains("cdn.geekhack.org") },
              { linkUrl: geekhackContains("geekhack.org") },
              { linkUrl: geekhackContains("cdn.geekhack.org") },
            ],
          },
        },
      },
    ],
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const where = buildWhere(options);
  const batchSize = options.limit ? Math.min(options.limit, 100) : 100;

  let cursor: string | undefined;
  let remaining = options.limit ?? Number.POSITIVE_INFINITY;
  let scanned = 0;
  let changedProjects = 0;
  let changedImages = 0;
  let changedDescriptions = 0;
  let changedHeroes = 0;
  let changedImageLinks = 0;

  while (remaining > 0) {
    const projects = await prisma.project.findMany({
      where,
      include: {
        images: {
          orderBy: { order: "asc" },
        },
      },
      orderBy: { id: "asc" },
      take: Math.min(batchSize, remaining),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (projects.length === 0) break;

    for (const project of projects) {
      scanned++;
      remaining--;

      const nextDescription = project.description
        ? await stripBrokenImageBlocksFromHtml(
            await mirrorImportImageSrcsInHtml(project.description, project.creatorId)
          )
        : project.description;
      const nextHeroImage = project.heroImage
        ? await mirrorImportImageUrlOrOriginal(project.heroImage, project.creatorId)
        : project.heroImage;

      const imageUpdates: Array<{ id: string; data: { url?: string; linkUrl?: string | null } }> = [];

      for (const image of project.images) {
        const nextUrl = await mirrorImportImageUrlOrOriginal(image.url, project.creatorId);
        const nextLinkUrl = image.linkUrl
          ? await mirrorImportImageUrlOrOriginal(image.linkUrl, project.creatorId)
          : image.linkUrl;

        const data: { url?: string; linkUrl?: string | null } = {};
        if (nextUrl !== image.url) data.url = nextUrl;
        if (nextLinkUrl !== image.linkUrl) data.linkUrl = nextLinkUrl;
        if (Object.keys(data).length > 0) imageUpdates.push({ id: image.id, data });
      }

      const projectData: { description?: string | null; heroImage?: string | null } = {};
      if (nextDescription !== project.description) projectData.description = nextDescription;
      if (nextHeroImage !== project.heroImage) projectData.heroImage = nextHeroImage;

      if (Object.keys(projectData).length === 0 && imageUpdates.length === 0) continue;

      changedProjects++;
      if (projectData.description !== undefined) changedDescriptions++;
      if (projectData.heroImage !== undefined) changedHeroes++;
      changedImages += imageUpdates.filter((update) => update.data.url !== undefined).length;
      changedImageLinks += imageUpdates.filter((update) => update.data.linkUrl !== undefined).length;

      console.log(
        `[mirror-geekhack-images] ${options.apply ? "apply" : "dry-run"} ${project.slug} ` +
          `description=${projectData.description !== undefined} hero=${projectData.heroImage !== undefined} ` +
          `images=${imageUpdates.filter((update) => update.data.url !== undefined).length} ` +
          `linkUrls=${imageUpdates.filter((update) => update.data.linkUrl !== undefined).length}`,
      );

      if (!options.apply) continue;

      await prisma.$transaction([
        ...(Object.keys(projectData).length > 0
          ? [
              prisma.project.update({
                where: { id: project.id },
                data: projectData,
              }),
            ]
          : []),
        ...imageUpdates.map((update) =>
          prisma.projectImage.update({
            where: { id: update.id },
            data: update.data,
          }),
        ),
      ]);
    }

    cursor = projects[projects.length - 1]?.id;
  }

  console.log(
    `[mirror-geekhack-images] done scanned=${scanned} changedProjects=${changedProjects} ` +
      `descriptions=${changedDescriptions} heroes=${changedHeroes} imageUrls=${changedImages} linkUrls=${changedImageLinks} ` +
      `mode=${options.apply ? "apply" : "dry-run"}`,
  );
}

main()
  .catch((error) => {
    console.error("[mirror-geekhack-images] fatal", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
