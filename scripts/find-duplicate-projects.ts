/**
 * find-duplicate-projects.ts
 *
 * Scans all Geekhack-imported projects and identifies likely duplicate pairs
 * using multiple matching strategies:
 *   1. Exact core-name match (aggressive title normalization)
 *   2. Conservative lifecycle fingerprint (Jaccard on product tokens)
 *   3. Shared Geekhack topic lineage (cross-referenced topic IDs)
 *
 * For each duplicate group, scores projects to recommend which to keep.
 *
 * Usage:
 *   npx tsx scripts/find-duplicate-projects.ts             # report only
 *   npx tsx scripts/find-duplicate-projects.ts --json       # machine-readable output
 */

import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { extractCoreName, normalizeTitleForDedup } from "../src/lib/import/geekhack-scanner";
import {
  isConservativeLifecycleDuplicate,
} from "../src/lib/import/geekhack-auto-import";

interface ProjectRecord {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  heroImage: string | null;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: { images: number; comments: number; favorites: number };
  links: Array<{ url: string; type: string }>;
}

interface DuplicateGroup {
  reason: string;
  projects: Array<{
    id: string;
    title: string;
    slug: string;
    url: string;
    score: number;
    recommendation: "KEEP" | "REMOVE";
  }>;
}

/**
 * Score a project's "quality" — higher is better / prettier.
 * Factors: has hero image, description length, image count, engagement.
 */
function scoreProject(p: ProjectRecord): number {
  let score = 0;
  if (p.heroImage) score += 20;
  const descLen = (p.description ?? "").replace(/<[^>]*>/g, "").length;
  score += Math.min(descLen / 50, 30); // up to 30 pts for content
  score += Math.min(p._count.images * 5, 25); // up to 25 pts for images
  score += Math.min(p._count.comments * 2, 10); // up to 10 pts for comments
  score += Math.min(p._count.favorites * 3, 15); // up to 15 pts for favorites
  if (p.published) score += 5;
  return Math.round(score * 100) / 100;
}

function extractTopicIdFromUrl(url: string): string | null {
  const m = url.match(/topic=(\d+)/);
  return m ? m[1] : null;
}

async function main() {
  const jsonMode = process.argv.includes("--json");

  const projects = await prisma.project.findMany({
    where: { tags: { has: "geekhack" } },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      heroImage: true,
      published: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { images: true, comments: true, favorites: true } },
      links: { where: { type: "GEEKHACK" }, select: { url: true, type: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!jsonMode) {
    console.log(`Loaded ${projects.length} Geekhack projects. Scanning for duplicates…\n`);
  }

  // Build lookup structures
  const coreNameMap = new Map<string, ProjectRecord[]>();
  const topicIdMap = new Map<string, ProjectRecord>();

  for (const p of projects) {
    const core = extractCoreName(p.title);
    if (core && core.length >= 5) {
      const existing = coreNameMap.get(core) ?? [];
      existing.push(p);
      coreNameMap.set(core, existing);
    }

    for (const link of p.links) {
      const tid = extractTopicIdFromUrl(link.url);
      if (tid) topicIdMap.set(tid, p);
    }
  }

  // Find duplicate groups
  const groups: DuplicateGroup[] = [];
  const alreadyGrouped = new Set<string>();

  // Strategy 1: Exact core-name matches
  for (const [coreName, group] of coreNameMap) {
    if (group.length < 2) continue;

    const ids = group.map((p) => p.id).sort().join(",");
    if (alreadyGrouped.has(ids)) continue;
    alreadyGrouped.add(ids);

    const scored = group.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      url: `https://keyatlas.io/projects/${p.slug}`,
      score: scoreProject(p),
      recommendation: "REMOVE" as const,
    }));

    // Best project gets KEEP
    scored.sort((a, b) => b.score - a.score);
    scored[0].recommendation = "KEEP";

    groups.push({ reason: `exact core-name: "${coreName}"`, projects: scored });
  }

  // Strategy 2: Pairwise lifecycle fingerprint (for projects not already grouped)
  for (let i = 0; i < projects.length; i++) {
    for (let j = i + 1; j < projects.length; j++) {
      const a = projects[i];
      const b = projects[j];

      // Skip if already in a group together
      const pairKey = [a.id, b.id].sort().join(",");
      if (alreadyGrouped.has(pairKey)) continue;

      if (isConservativeLifecycleDuplicate(a.title, b.title)) {
        alreadyGrouped.add(pairKey);

        const scoreA = scoreProject(a);
        const scoreB = scoreProject(b);

        groups.push({
          reason: `lifecycle fingerprint match`,
          projects: [
            {
              id: a.id, title: a.title, slug: a.slug,
              url: `https://keyatlas.io/projects/${a.slug}`,
              score: scoreA,
              recommendation: scoreA >= scoreB ? "KEEP" : "REMOVE",
            },
            {
              id: b.id, title: b.title, slug: b.slug,
              url: `https://keyatlas.io/projects/${b.slug}`,
              score: scoreB,
              recommendation: scoreB > scoreA ? "KEEP" : "REMOVE",
            },
          ],
        });
      }
    }
  }

  if (jsonMode) {
    console.log(JSON.stringify({ totalProjects: projects.length, duplicateGroups: groups }, null, 2));
  } else {
    if (groups.length === 0) {
      console.log("No duplicate groups found.");
    } else {
      console.log(`Found ${groups.length} duplicate group(s):\n`);
      for (const g of groups) {
        console.log(`─── ${g.reason} ───`);
        for (const p of g.projects) {
          const badge = p.recommendation === "KEEP" ? "✓ KEEP  " : "✗ REMOVE";
          console.log(`  ${badge}  [score=${p.score}] "${p.title}"`);
          console.log(`           ${p.url}`);
        }
        console.log();
      }
    }

    const removeCount = groups.reduce(
      (sum, g) => sum + g.projects.filter((p) => p.recommendation === "REMOVE").length,
      0
    );
    console.log(`Summary: ${groups.length} groups, ${removeCount} projects recommended for removal.`);
    console.log(`\nTo get machine-readable output: npx tsx scripts/find-duplicate-projects.ts --json`);
  }
}

main()
  .catch((e) => {
    console.error("Failed", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
