/**
 * One-time backfill script: index all existing designers and vendors into Meilisearch.
 *
 * Run with:
 *   npx tsx scripts/index-designers-vendors.ts
 *
 * Or dry-run (no writes):
 *   npx tsx scripts/index-designers-vendors.ts --dry-run
 */

import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  configureDesignersIndex,
  configureVendorsIndex,
  indexDesigner,
  indexVendor,
} from "../src/lib/meilisearch";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

async function main() {
  console.log(`🔍 Starting Meilisearch backfill${dryRun ? " (dry-run)" : ""}…\n`);

  if (!dryRun) {
    console.log("⚙️  Configuring indexes…");
    await Promise.all([configureDesignersIndex(), configureVendorsIndex()]);
    console.log("   ✓ Indexes configured\n");
  }

  // ── Designers ──────────────────────────────────────────────────────────────
  const designers = await prisma.designer.findMany({ orderBy: { name: "asc" } });
  console.log(`👤 Found ${designers.length} designer(s)`);

  if (!dryRun) {
    let indexed = 0;
    for (const designer of designers) {
      await indexDesigner(designer);
      indexed++;
      if (indexed % 10 === 0) {
        console.log(`   indexed ${indexed}/${designers.length}`);
      }
    }
    console.log(`   ✓ Indexed ${indexed} designer(s)\n`);
  } else {
    designers.slice(0, 5).forEach((d) => console.log(`   [dry-run] would index: ${d.name}`));
    console.log();
  }

  // ── Vendors ────────────────────────────────────────────────────────────────
  const vendors = await prisma.vendor.findMany({ orderBy: { name: "asc" } });
  console.log(`🏪 Found ${vendors.length} vendor(s)`);

  if (!dryRun) {
    let indexed = 0;
    for (const vendor of vendors) {
      await indexVendor(vendor);
      indexed++;
      if (indexed % 10 === 0) {
        console.log(`   indexed ${indexed}/${vendors.length}`);
      }
    }
    console.log(`   ✓ Indexed ${indexed} vendor(s)\n`);
  } else {
    vendors.slice(0, 5).forEach((v) => console.log(`   [dry-run] would index: ${v.name}`));
    console.log();
  }

  console.log("✅ Backfill complete.");
}

main()
  .catch((err) => {
    console.error("❌ Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
