import { prisma } from "../src/lib/prisma";
import { fetchGeekhackThread, buildGeekhackPrefillPayload } from "../src/lib/import/geekhack";
import {
  extractMirrorableImageUrlCandidatesFromHtml,
  mirrorImportImageUrlOrOriginal,
  normalizeMirrorableImageUrl,
  rewriteImportImageUrlsInHtml,
} from "../src/lib/import/imgur-mirror";
import {
  assertValidDescriptionImages,
  matchSourceImagesToGallery,
  selectGeekhackSourceUrl,
  sha256RemoteImage,
} from "../src/lib/import/geekhack-media-repair";

type Options = { apply: boolean; slugs: string[]; sourceUrl?: string };

export function parseArgs(argv: string[]): Options {
  const options: Options = { apply: false, slugs: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--slug") {
      const slug = argv[++i]?.trim();
      if (slug) options.slugs.push(slug);
    } else if (arg === "--source-url") options.sourceUrl = argv[++i]?.trim();
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.slugs.length === 0) throw new Error("Pass at least one --slug");
  if (options.sourceUrl && options.slugs.length !== 1) {
    throw new Error("--source-url requires exactly one --slug");
  }

  for (const slug of options.slugs) {
    const project = await prisma.project.findUnique({
      where: { slug },
      include: { links: true, images: { orderBy: { order: "asc" } } },
    });
    if (!project) throw new Error(`Missing slug: ${slug}`);

    const sourceUrl = selectGeekhackSourceUrl(project.links, options.sourceUrl);
    const prefill = buildGeekhackPrefillPayload(await fetchGeekhackThread(sourceUrl));
    const descriptionSources = [...new Set(
      extractMirrorableImageUrlCandidatesFromHtml(prefill.description).values(),
    )];
    const identitySources = [...new Set([
      ...prefill.images.map((image) => normalizeMirrorableImageUrl(image.url)),
      ...descriptionSources,
    ])];
    const sha256BySource = new Map<string, string>();
    for (const source of identitySources) {
      try {
        sha256BySource.set(source, await sha256RemoteImage(source));
      } catch (error) {
        console.warn(
          `[repair-geekhack-project-media] identity-fetch-failed slug=${slug} source=${source} error=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const galleryUrls = project.images.map((image) => image.url);
    const assets = await prisma.imageAsset.findMany({
      where: { url: { in: galleryUrls } },
      select: { sha256: true, url: true },
    });
    const rewrites = matchSourceImagesToGallery(identitySources, galleryUrls, assets, sha256BySource);
    const unresolved = descriptionSources.filter((source) => !rewrites.has(source));
    const descriptionImageCount = (prefill.description.match(/<img\b/gi) ?? []).length;

    console.log(
      `[repair-geekhack-project-media] ${options.apply ? "apply" : "dry-run"} slug=${slug} source=${sourceUrl} gallery=${galleryUrls.length} descriptionImages=${descriptionImageCount} descriptionSources=${descriptionSources.length} matched=${descriptionSources.length - unresolved.length} unresolved=${unresolved.length}`,
    );
    for (const source of descriptionSources) {
      const matched = rewrites.get(source);
      console.log(`[repair-geekhack-project-media] identity slug=${slug} source=${source} ${matched ? `gallery=${matched}` : "unresolved"}`);
    }
    if (!options.apply) continue;

    for (const source of unresolved) {
      rewrites.set(source, await mirrorImportImageUrlOrOriginal(source, project.creatorId));
    }
    const nextDescription = rewriteImportImageUrlsInHtml(prefill.description, rewrites);
    await assertValidDescriptionImages(nextDescription);
    await prisma.project.update({ where: { id: project.id }, data: { description: nextDescription } });
  }
}

if (process.env.NODE_ENV !== "test") {
  main()
    .catch((error) => { console.error("[repair-geekhack-project-media] fatal", error); process.exit(1); })
    .finally(async () => prisma.$disconnect());
}
