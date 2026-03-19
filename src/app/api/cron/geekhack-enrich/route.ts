/**
 * GET /api/cron/geekhack-enrich
 *
 * Second-pass enrichment for Geekhack-imported projects.
 * Fills in missing designer, vendors, pricing, dates, and tags
 * by re-fetching and analyzing the original thread content.
 *
 * Query params:
 *   ?batchSize=20   Max projects to process per run (default 20)
 *
 * Protection: requires CRON_SECRET in Authorization header.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchGeekhackThread } from "@/lib/import/geekhack";
import { enrichProject, buildVendorLookups, cleanProjectText } from "@/lib/import/geekhack-enrich";
import { indexProject } from "@/lib/meilisearch";
import { slugify } from "@/lib/slug";

export const runtime = "nodejs";
export const maxDuration = 300;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(req: NextRequest) {
  // --- Auth ---
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Params ---
  const { searchParams } = new URL(req.url);
  const batchSize = Math.min(
    Math.max(1, Number(searchParams.get("batchSize")) || 20),
    100
  );
  // ?textCleanup=true — run text cleanup on already-enriched projects too
  const textCleanupMode = searchParams.get("textCleanup") === "true";

  console.log(`[cron/geekhack-enrich] Triggered — batchSize=${batchSize} textCleanup=${textCleanupMode}`);
  const startedAt = Date.now();

  // --- Load vendors once ---
  const vendors = await prisma.vendor.findMany({
    select: { id: true, name: true, slug: true, storefrontUrl: true },
  });
  const vendorLookups = buildVendorLookups(vendors);
  console.log(`[cron/geekhack-enrich] Loaded ${vendors.length} vendors for matching`);

  // --- Find eligible projects ---
  // Projects tagged "geekhack" + "auto-imported" but NOT "enriched"
  const projects = await prisma.project.findMany({
    where: {
      tags: { hasEvery: ["geekhack", "auto-imported"] },
      NOT: { tags: { has: "enriched" } },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      description: true,
      designer: true,
      vendorId: true,
      priceMin: true,
      priceMax: true,
      currency: true,
      icDate: true,
      gbStartDate: true,
      gbEndDate: true,
      tags: true,
      createdAt: true,
      links: {
        where: { type: "GEEKHACK" },
        select: { url: true },
        take: 1,
      },
      projectVendors: {
        select: { vendorId: true, region: true },
      },
    },
    take: batchSize,
    orderBy: { createdAt: "asc" },
  });

  console.log(`[cron/geekhack-enrich] Found ${projects.length} projects to enrich`);

  const summary = {
    processed: 0,
    enriched: 0,
    skipped: 0,
    errors: [] as { projectId: string; title: string; error: string }[],
  };

  for (const project of projects) {
    summary.processed++;

    try {
      const ghLink = project.links[0]?.url;
      if (!ghLink) {
        console.log(`[cron/geekhack-enrich] No Geekhack link for "${project.title}" — skipping`);
        summary.skipped++;

        // Still mark as enriched so we don't retry every run
        await prisma.project.update({
          where: { id: project.id },
          data: {
            tags: [
              ...project.tags.filter((t) => t !== "auto-imported"),
              "enriched",
            ],
          },
        });
        continue;
      }

      // Fetch thread
      console.log(`[cron/geekhack-enrich] Fetching thread for "${project.title}": ${ghLink}`);
      const thread = await fetchGeekhackThread(ghLink);

      if (!thread.op) {
        console.log(`[cron/geekhack-enrich] No OP found for "${project.title}" — skipping`);
        summary.skipped++;

        await prisma.project.update({
          where: { id: project.id },
          data: {
            tags: [
              ...project.tags.filter((t) => t !== "auto-imported"),
              "enriched",
            ],
          },
        });
        continue;
      }

      // Run enrichment
      const result = enrichProject(project, thread, vendorLookups);

      if (!result.changed) {
        console.log(`[cron/geekhack-enrich] No changes for "${project.title}"`);
        summary.skipped++;

        // Still tag as enriched
        await prisma.project.update({
          where: { id: project.id },
          data: {
            tags: [
              ...project.tags.filter((t) => t !== "auto-imported"),
              "enriched",
            ],
          },
        });
        continue;
      }

      // Apply updates in a transaction
      const updated = await prisma.$transaction(async (tx) => {
        // Auto-create unknown vendors found in structured vendor lists
        for (const uv of result.unknownVendors) {
          const slug = slugify(uv.name);
          // Check if slug already exists (avoid collision)
          const existing = await tx.vendor.findUnique({ where: { slug }, select: { id: true } });
          if (!existing) {
            const newVendor = await tx.vendor.create({
              data: { name: uv.name, slug },
            });
            console.log(`[cron/geekhack-enrich] Auto-created vendor "${uv.name}" (${newVendor.id})`);
            // Link to project
            await tx.projectVendor.create({
              data: {
                projectId: project.id,
                vendorId: newVendor.id,
                region: uv.region ?? null,
              },
            });
          }
        }

        // Update project fields
        const updatedProject = await tx.project.update({
          where: { id: project.id },
          data: result.projectUpdate,
          include: { vendor: true },
        });

        // Create ProjectVendor entries for known vendors
        for (const pv of result.vendorsToLink) {
          // Check if this vendor link already exists (region can be null)
          const existing = await tx.projectVendor.findFirst({
            where: {
              projectId: project.id,
              vendorId: pv.vendorId,
              region: pv.region ?? null,
            },
            select: { id: true },
          });
          if (!existing) {
            await tx.projectVendor.create({
              data: {
                projectId: project.id,
                vendorId: pv.vendorId,
                region: pv.region ?? null,
                storeLink: pv.storeLink,
              },
            });
          }
        }

        return updatedProject;
      });

      // Update Meilisearch index
      try {
        await indexProject(updated);
      } catch (searchErr) {
        console.error(
          `[cron/geekhack-enrich] Meilisearch index failed for "${project.title}":`,
          searchErr
        );
      }

      const changeFields = result.changes.map((c) => c.field).join(", ");
      console.log(
        `[cron/geekhack-enrich] Enriched "${project.title}" — changes: ${changeFields}`
      );
      summary.enriched++;

      // Rate limit between fetches
      await sleep(3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[cron/geekhack-enrich] Error enriching "${project.title}":`,
        message
      );
      summary.errors.push({
        projectId: project.id,
        title: project.title,
        error: message,
      });

      // Still rate-limit on error to avoid hammering Geekhack
      await sleep(3000);
    }
  }

  // --- Text cleanup pass (optional) ---
  let textCleaned = 0;
  if (textCleanupMode) {
    const dirtyProjects = await prisma.project.findMany({
      where: {
        tags: { has: "geekhack" },
        OR: [
          { title: { contains: "&#" } },
          { description: { contains: "&#" } },
        ],
      },
      select: { id: true, title: true, description: true },
      take: batchSize,
    });

    console.log(`[cron/geekhack-enrich] Text cleanup: found ${dirtyProjects.length} projects with HTML entities`);

    for (const dp of dirtyProjects) {
      const result = cleanProjectText(dp.title, dp.description);
      if (result.changed) {
        const data: Record<string, string> = {};
        if (result.cleanTitle !== dp.title) data.title = result.cleanTitle;
        if (result.cleanDescription !== dp.description && result.cleanDescription !== null) {
          data.description = result.cleanDescription;
        }
        if (Object.keys(data).length > 0) {
          await prisma.project.update({ where: { id: dp.id }, data });
          console.log(`[cron/geekhack-enrich] Text cleaned: "${dp.title}" → "${result.cleanTitle}"`);
          textCleaned++;
        }
      }
    }
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `[cron/geekhack-enrich] Complete in ${durationMs}ms — ` +
      `processed=${summary.processed} enriched=${summary.enriched} ` +
      `skipped=${summary.skipped} errors=${summary.errors.length}` +
      (textCleanupMode ? ` textCleaned=${textCleaned}` : "")
  );

  return NextResponse.json({ ok: true, durationMs, ...summary, ...(textCleanupMode ? { textCleaned } : {}) });
}
