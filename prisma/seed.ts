import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { MeiliSearch } from "meilisearch";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // Create admin user
  const admin = await prisma.user.upsert({
    where: { email: "admin@keyvault.dev" },
    update: {},
    create: {
      email: "admin@keyvault.dev",
      name: "Admin",
      role: "ADMIN",
    },
  });

  // Create vendors
  const vendors = await Promise.all([
    prisma.vendor.upsert({
      where: { slug: "gmk-electronic-design" },
      update: {},
      create: {
        name: "GMK Electronic Design",
        slug: "gmk-electronic-design",
        description: "Premium doubleshot keycap manufacturer based in Germany.",
        storefrontUrl: "https://www.gmk-electronic-design.de",
        verified: true,
        regionsServed: ["NA", "EU", "ASIA"],
        ownerId: admin.id,
      },
    }),
  ]);

  // Create a second user for another vendor
  const vendorUser = await prisma.user.upsert({
    where: { email: "vendor@keyvault.dev" },
    update: {},
    create: {
      email: "vendor@keyvault.dev",
      name: "Vendor User",
      role: "VENDOR",
    },
  });

  const novelkeys = await prisma.vendor.upsert({
    where: { slug: "novelkeys" },
    update: {},
    create: {
      name: "NovelKeys",
      slug: "novelkeys",
      description: "Switches, keycaps, and keyboards.",
      storefrontUrl: "https://novelkeys.com",
      verified: true,
      regionsServed: ["NA"],
      ownerId: vendorUser.id,
    },
  });

  // Create sample projects
  const projects = [
    {
      title: "GMK Dracula",
      slug: "gmk-dracula",
      description:
        "A dark keycap set inspired by the famous Dracula color scheme. Features deep purple and green accents on a dark base.",
      category: "KEYCAPS" as const,
      status: "COMPLETED" as const,
      priceMin: 13000,
      priceMax: 24000,
      currency: "USD",
      tags: ["GMK", "Doubleshot", "Dark", "Purple"],
      heroImage: "https://picsum.photos/seed/gmk-dracula/800/600",
      icDate: new Date("2024-01-15"),
      gbStartDate: new Date("2024-03-01"),
      gbEndDate: new Date("2024-04-30"),
      estimatedDelivery: new Date("2025-06-01"),
      vendorId: vendors[0].id,
      creatorId: admin.id,
      featured: true,
      published: true,
    },
    {
      title: "Mode Envoy",
      slug: "mode-envoy",
      description:
        "A premium 65% mechanical keyboard with gasket mount, aluminum case, and hot-swap PCB. Available in multiple colors.",
      category: "KEYBOARDS" as const,
      status: "GROUP_BUY" as const,
      priceMin: 35000,
      priceMax: 45000,
      currency: "USD",
      tags: ["65%", "Gasket", "Aluminum", "Hot-swap"],
      heroImage: "https://picsum.photos/seed/mode-envoy/800/600",
      icDate: new Date("2025-06-01"),
      gbStartDate: new Date("2025-09-01"),
      gbEndDate: new Date("2025-10-31"),
      estimatedDelivery: new Date("2026-06-01"),
      creatorId: admin.id,
      featured: true,
      published: true,
    },
    {
      title: "Gateron Oil King V2",
      slug: "gateron-oil-king-v2",
      description:
        "Updated version of the popular Oil King linear switch. Pre-lubed with improved stem and housing materials.",
      category: "SWITCHES" as const,
      status: "IN_STOCK" as const,
      priceMin: 35,
      priceMax: 35,
      currency: "USD",
      tags: ["Linear", "Pre-lubed", "Gateron"],
      heroImage: "https://picsum.photos/seed/oil-king-v2/800/600",
      creatorId: admin.id,
      vendorId: novelkeys.id,
      published: true,
    },
    {
      title: "Meka Mat Space",
      slug: "meka-mat-space",
      description:
        "A vibrant deskmat featuring an astronaut design with mechanical keyboard elements. 900x400mm, 4mm thick stitched edges.",
      category: "DESKMATS" as const,
      status: "INTEREST_CHECK" as const,
      priceMin: 2500,
      priceMax: 3000,
      currency: "USD",
      tags: ["Deskmat", "Space", "Illustration"],
      heroImage: "https://picsum.photos/seed/meka-mat/800/600",
      icDate: new Date("2026-01-15"),
      creatorId: admin.id,
      published: true,
    },
    {
      title: "CYSM Boba Keycap",
      slug: "cysm-boba-keycap",
      description:
        "Hand-crafted artisan keycap in the shape of a boba tea cup. Resin cast with intricate detail work.",
      category: "ARTISANS" as const,
      status: "EXTRAS" as const,
      priceMin: 7500,
      priceMax: 8500,
      currency: "USD",
      tags: ["Artisan", "Resin", "Boba"],
      heroImage: "https://picsum.photos/seed/cysm-boba/800/600",
      creatorId: admin.id,
      featured: true,
      published: true,
    },
    {
      title: "Custom Coiled Cable",
      slug: "custom-coiled-cable",
      description:
        "Hand-made coiled USB-C cable with aviator connector. Available in various colorways to match your setup.",
      category: "ACCESSORIES" as const,
      status: "IN_STOCK" as const,
      priceMin: 5500,
      priceMax: 7500,
      currency: "USD",
      tags: ["Cable", "USB-C", "Coiled", "Aviator"],
      heroImage: "https://picsum.photos/seed/coiled-cable/800/600",
      creatorId: admin.id,
      published: true,
    },
    {
      title: "KAT Refined",
      slug: "kat-refined",
      description:
        "A minimal and clean keycap set in KAT profile. Subtle legends on a warm white base with accent kits available.",
      category: "KEYCAPS" as const,
      status: "PRODUCTION" as const,
      priceMin: 8000,
      priceMax: 15000,
      currency: "USD",
      tags: ["KAT", "Minimal", "White"],
      heroImage: "https://picsum.photos/seed/kat-refined/800/600",
      icDate: new Date("2025-01-01"),
      gbStartDate: new Date("2025-04-01"),
      gbEndDate: new Date("2025-05-31"),
      estimatedDelivery: new Date("2026-03-01"),
      vendorId: vendors[0].id,
      creatorId: admin.id,
      published: true,
    },
    {
      title: "TGR Jane V2 CE",
      slug: "tgr-jane-v2-ce",
      description:
        "Community edition of the legendary TGR Jane V2 75% keyboard. Top mount design with brass weight.",
      category: "KEYBOARDS" as const,
      status: "SHIPPING" as const,
      priceMin: 55000,
      priceMax: 55000,
      currency: "USD",
      tags: ["75%", "Top Mount", "Brass", "Premium"],
      heroImage: "https://picsum.photos/seed/tgr-jane/800/600",
      gbStartDate: new Date("2025-01-15"),
      gbEndDate: new Date("2025-02-28"),
      estimatedDelivery: new Date("2026-01-01"),
      creatorId: admin.id,
      published: true,
    },
    {
      title: "Draft Project Example",
      slug: "draft-project-example",
      description: "This is a draft project that should not appear publicly.",
      category: "KEYBOARDS" as const,
      status: "INTEREST_CHECK" as const,
      heroImage: "https://picsum.photos/seed/draft-kb/800/600",
      creatorId: admin.id,
      published: false,
    },
  ];

  for (const projectData of projects) {
    await prisma.project.upsert({
      where: { slug: projectData.slug },
      update: { heroImage: projectData.heroImage },
      create: projectData,
    });
  }

  console.log(`Created ${projects.length} sample projects`);

  // Configure and populate Meilisearch
  try {
    const meili = new MeiliSearch({
      host: process.env.MEILISEARCH_HOST ?? "http://localhost:7700",
      apiKey: process.env.MEILISEARCH_API_KEY ?? "",
    });

    const index = meili.index("projects");

    await index.updateSettings({
      searchableAttributes: ["title", "description", "tags", "vendorName"],
      filterableAttributes: ["category", "status", "featured", "published"],
      sortableAttributes: ["createdAt", "title", "priceMin"],
    });

    const allProjects = await prisma.project.findMany({
      include: { vendor: { select: { name: true, slug: true } } },
    });

    const documents = allProjects.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      description: p.description,
      category: p.category,
      status: p.status,
      priceMin: p.priceMin,
      priceMax: p.priceMax,
      currency: p.currency,
      heroImage: p.heroImage,
      tags: p.tags,
      featured: p.featured,
      published: p.published,
      vendorName: p.vendor?.name ?? null,
      vendorSlug: p.vendor?.slug ?? null,
      createdAt: p.createdAt.toISOString(),
      gbStartDate: p.gbStartDate?.toISOString() ?? null,
      gbEndDate: p.gbEndDate?.toISOString() ?? null,
    }));

    await index.addDocuments(documents);
    console.log(`Indexed ${documents.length} projects in Meilisearch`);
  } catch (error) {
    console.warn(
      "Meilisearch indexing skipped (service may not be running):",
      error
    );
  }

  console.log("Seed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
