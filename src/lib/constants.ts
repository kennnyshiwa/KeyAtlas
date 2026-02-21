import type { ProjectCategory, ProjectStatus } from "@/generated/prisma/client";

export const CATEGORY_LABELS: Record<ProjectCategory, string> = {
  KEYBOARDS: "Keyboards",
  KEYCAPS: "Keycaps",
  SWITCHES: "Switches",
  DESKMATS: "Deskmats",
  ARTISANS: "Artisans",
  ACCESSORIES: "Accessories",
};

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  INTEREST_CHECK: "Interest Check",
  GROUP_BUY: "Group Buy",
  PRODUCTION: "Production",
  SHIPPING: "Shipping",
  EXTRAS: "Extras",
  IN_STOCK: "In Stock",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

export const STATUS_COLORS: Record<ProjectStatus, string> = {
  INTEREST_CHECK: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  GROUP_BUY: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  PRODUCTION: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  SHIPPING: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  EXTRAS: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  IN_STOCK: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
  COMPLETED: "bg-zinc-100 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
  ARCHIVED: "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500",
};

export const PROFILE_OPTIONS = [
  "Cherry",
  "SA",
  "KAT",
  "MT3",
  "DSA",
  "XDA",
  "MDA",
  "ASA",
  "KAM",
  "DCS",
  "OEM",
  "Other",
] as const;

export const CATEGORY_COLORS: Record<ProjectCategory, string> = {
  KEYBOARDS: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300",
  KEYCAPS: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300",
  SWITCHES: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  DESKMATS: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300",
  ARTISANS: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300",
  ACCESSORIES: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300",
};
