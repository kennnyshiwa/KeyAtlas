export type GalleryImage = {
  url: string;
  alt?: string;
  order: number;
  linkUrl?: string | null;
  openInNewTab: boolean;
};

export type GalleryImportFailure = { url: string; error: string };

export function parseGalleryUrlEntries(input: string): string[] {
  return input
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function validateGalleryUrlEntries(
  entries: string[],
  validate: (url: string) => Promise<string | null>
): Promise<{ validUrls: string[]; failures: GalleryImportFailure[] }> {
  const validUrls: string[] = [];
  const failures: GalleryImportFailure[] = [];

  for (const entry of entries) {
    try {
      const validated = await validate(entry);
      if (validated) validUrls.push(validated);
    } catch (error) {
      failures.push({
        url: entry,
        error: error instanceof Error ? error.message : "Could not validate image URL",
      });
    }
  }

  return { validUrls, failures };
}

export function appendUniqueGalleryUrls(
  images: GalleryImage[],
  urls: string[]
): { images: GalleryImage[]; addedCount: number; duplicateCount: number } {
  const seen = new Set(images.map((image) => image.url));
  const additions: GalleryImage[] = [];
  let duplicateCount = 0;

  for (const url of urls) {
    if (seen.has(url)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(url);
    additions.push({
      url,
      alt: "",
      order: images.length + additions.length,
      linkUrl: null,
      openInNewTab: true,
    });
  }

  return {
    images: [...images, ...additions].map((image, index) => ({ ...image, order: index })),
    addedCount: additions.length,
    duplicateCount,
  };
}
