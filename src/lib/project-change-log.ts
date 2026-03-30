import { prisma } from "@/lib/prisma";
import { STATUS_LABELS, CATEGORY_LABELS } from "@/lib/constants";
import type { ProjectCategory, ProjectStatus } from "@/generated/prisma/client";

/** Fields we track for the "What Changed" timeline */
const TRACKED_FIELDS = ["status", "category", "profile", "designer", "title", "vendorId"] as const;

type TrackedField = (typeof TRACKED_FIELDS)[number];

interface FieldDiff {
  field: TrackedField;
  oldValue: string | null;
  newValue: string | null;
}

function formatFieldValue(field: TrackedField, value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (field === "status") return STATUS_LABELS[value as ProjectStatus] ?? value;
  if (field === "category") return CATEGORY_LABELS[value as ProjectCategory] ?? value;
  // vendorId is resolved async in logProjectChanges — don't format here
  return value;
}

function summarize(field: TrackedField, oldVal: string | null, newVal: string | null): string {
  const fieldLabel =
    field === "vendorId" ? "vendor" : field;
  if (!oldVal) return `Set ${fieldLabel} to ${newVal}`;
  if (!newVal) return `Removed ${fieldLabel} (was ${oldVal})`;
  return `Changed ${fieldLabel} from ${oldVal} to ${newVal}`;
}

/**
 * Resolve a vendor ID (cuid) to its display name.
 * Returns the raw value if lookup fails.
 */
async function resolveVendorName(vendorId: string | null): Promise<string | null> {
  if (!vendorId) return null;
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { name: true },
    });
    return vendor?.name ?? vendorId;
  } catch {
    return vendorId;
  }
}

/**
 * Compare old and new project data, log any meaningful diffs.
 * Call BEFORE the update to capture old values, passing the new data.
 */
export async function logProjectChanges(
  projectId: string,
  actorId: string,
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>
) {
  const diffs: FieldDiff[] = [];

  for (const field of TRACKED_FIELDS) {
    const oldRaw = oldData[field] as string | null | undefined;
    const newRaw = newData[field] as string | null | undefined;

    // Normalize empties
    const o = oldRaw || null;
    const n = newRaw || null;

    if (o !== n) {
      // Resolve vendor IDs to names
      if (field === "vendorId") {
        const [oldName, newName] = await Promise.all([
          resolveVendorName(o),
          resolveVendorName(n),
        ]);
        diffs.push({ field, oldValue: oldName, newValue: newName });
      } else {
        diffs.push({
          field,
          oldValue: formatFieldValue(field, o),
          newValue: formatFieldValue(field, n),
        });
      }
    }
  }

  if (diffs.length === 0) return;

  await prisma.projectChangeLog.createMany({
    data: diffs.map((d) => ({
      projectId,
      actorId,
      field: d.field,
      oldValue: d.oldValue,
      newValue: d.newValue,
      summary: summarize(d.field, d.oldValue, d.newValue),
    })),
  });
}
