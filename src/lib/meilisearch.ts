import { MeiliSearch } from "meilisearch";
import type { Project, Designer, Vendor } from "@/generated/prisma/client";

const client = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST ?? "http://localhost:7700",
  apiKey: process.env.MEILISEARCH_API_KEY ?? "",
});

const PROJECTS_INDEX = "projects";
const DESIGNERS_INDEX = "designers";
const VENDORS_INDEX = "vendors";

export async function configureProjectsIndex() {
  const index = client.index(PROJECTS_INDEX);

  await index.updateSettings({
    searchableAttributes: ["title", "description", "tags", "vendorName", "designer"],
    filterableAttributes: ["category", "status", "featured", "published", "profile", "shipped", "designer"],
    sortableAttributes: ["createdAt", "title", "priceMin"],
    displayedAttributes: [
      "id",
      "title",
      "slug",
      "category",
      "status",
      "priceMin",
      "priceMax",
      "currency",
      "heroImage",
      "tags",
      "featured",
      "vendorName",
      "vendorSlug",
      "createdAt",
      "gbStartDate",
      "gbEndDate",
      "profile",
      "shipped",
      "designer",
    ],
  });
}

interface ProjectSearchDocument {
  id: string;
  title: string;
  slug: string;
  description?: string | null;
  category: string;
  status: string;
  priceMin?: number | null;
  priceMax?: number | null;
  currency: string;
  heroImage?: string | null;
  tags: string[];
  featured: boolean;
  published: boolean;
  vendorName?: string | null;
  vendorSlug?: string | null;
  createdAt: string;
  gbStartDate?: string | null;
  gbEndDate?: string | null;
  profile?: string | null;
  shipped: boolean;
  designer?: string | null;
}

export function projectToSearchDocument(
  project: Project & {
    vendor?: { name: string; slug: string } | null;
  }
): ProjectSearchDocument {
  return {
    id: project.id,
    title: project.title,
    slug: project.slug,
    description: project.description,
    category: project.category,
    status: project.status,
    priceMin: project.priceMin,
    priceMax: project.priceMax,
    currency: project.currency,
    heroImage: project.heroImage,
    tags: project.tags,
    featured: project.featured,
    published: project.published,
    vendorName: project.vendor?.name ?? null,
    vendorSlug: project.vendor?.slug ?? null,
    createdAt: project.createdAt.toISOString(),
    gbStartDate: project.gbStartDate?.toISOString() ?? null,
    gbEndDate: project.gbEndDate?.toISOString() ?? null,
    profile: project.profile ?? null,
    shipped: project.shipped,
    designer: project.designer ?? null,
  };
}

export async function indexProject(
  project: Project & {
    vendor?: { name: string; slug: string } | null;
  }
) {
  try {
    const index = client.index(PROJECTS_INDEX);
    await index.addDocuments([projectToSearchDocument(project)]);
  } catch (error) {
    console.error("Failed to index project:", error);
  }
}

export async function removeProjectFromIndex(id: string) {
  try {
    const index = client.index(PROJECTS_INDEX);
    await index.deleteDocument(id);
  } catch (error) {
    console.error("Failed to remove project from index:", error);
  }
}

export async function searchProjects(
  query: string,
  options?: {
    filter?: string;
    sort?: string[];
    limit?: number;
    offset?: number;
  }
) {
  const index = client.index(PROJECTS_INDEX);
  return index.search(query, {
    filter: options?.filter,
    sort: options?.sort,
    limit: options?.limit ?? 20,
    offset: options?.offset ?? 0,
  });
}

// ─── Designers ───────────────────────────────────────────────────────────────

export async function configureDesignersIndex() {
  const index = client.index(DESIGNERS_INDEX);
  await index.updateSettings({
    searchableAttributes: ["name", "description"],
    filterableAttributes: [],
    displayedAttributes: ["id", "name", "slug", "logo", "description"],
  });
}

interface DesignerSearchDocument {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  description?: string | null;
}

function designerToSearchDocument(designer: Designer): DesignerSearchDocument {
  return {
    id: designer.id,
    name: designer.name,
    slug: designer.slug,
    logo: designer.logo,
    description: designer.description,
  };
}

export async function indexDesigner(designer: Designer) {
  try {
    const index = client.index(DESIGNERS_INDEX);
    await index.addDocuments([designerToSearchDocument(designer)]);
  } catch (error) {
    console.error("Failed to index designer:", error);
  }
}

export async function removeDesignerFromIndex(id: string) {
  try {
    const index = client.index(DESIGNERS_INDEX);
    await index.deleteDocument(id);
  } catch (error) {
    console.error("Failed to remove designer from index:", error);
  }
}

export async function searchDesigners(
  query: string,
  options?: { limit?: number; offset?: number }
) {
  const index = client.index(DESIGNERS_INDEX);
  return index.search(query, {
    limit: options?.limit ?? 20,
    offset: options?.offset ?? 0,
  });
}

// ─── Vendors ─────────────────────────────────────────────────────────────────

export async function configureVendorsIndex() {
  const index = client.index(VENDORS_INDEX);
  await index.updateSettings({
    searchableAttributes: ["name", "description", "regionsServed"],
    filterableAttributes: [],
    displayedAttributes: ["id", "name", "slug", "logo", "verified", "regionsServed"],
  });
}

interface VendorSearchDocument {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  verified: boolean;
  regionsServed: string[];
}

function vendorToSearchDocument(vendor: Vendor): VendorSearchDocument {
  return {
    id: vendor.id,
    name: vendor.name,
    slug: vendor.slug,
    logo: vendor.logo,
    verified: vendor.verified,
    regionsServed: vendor.regionsServed,
  };
}

export async function indexVendor(vendor: Vendor) {
  try {
    const index = client.index(VENDORS_INDEX);
    await index.addDocuments([vendorToSearchDocument(vendor)]);
  } catch (error) {
    console.error("Failed to index vendor:", error);
  }
}

export async function removeVendorFromIndex(id: string) {
  try {
    const index = client.index(VENDORS_INDEX);
    await index.deleteDocument(id);
  } catch (error) {
    console.error("Failed to remove vendor from index:", error);
  }
}

export async function searchVendors(
  query: string,
  options?: { limit?: number; offset?: number }
) {
  const index = client.index(VENDORS_INDEX);
  return index.search(query, {
    limit: options?.limit ?? 20,
    offset: options?.offset ?? 0,
  });
}

// ─── Configure all indexes ────────────────────────────────────────────────────

export async function configureAllIndexes() {
  await Promise.all([
    configureProjectsIndex(),
    configureDesignersIndex(),
    configureVendorsIndex(),
  ]);
}

export { client as meilisearchClient };
