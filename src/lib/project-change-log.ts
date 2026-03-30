import { prisma } from "@/lib/prisma";
import { STATUS_LABELS, CATEGORY_LABELS } from "@/lib/constants";
import type { ProjectCategory, ProjectStatus } from "@/generated/prisma/client";

/** Fields we track for the "What Changed" timeline.
 *  vendorId is excluded — it's derived from projectVendors and was
 *  generating spurious "Removed vendor" entries on every save because
 *  the request body doesn't include vendorId directly.
 */
const TRACKED_FIELDS = ["status", "category", "profile", "designer", "title"] as const;

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
  if (!oldVal) return `Set ${field} to ${newVal}`;
  if (!newVal) return `Removed ${field} (was ${oldVal})`;
  return `Changed ${field} from ${oldVal} to ${newVal}`;
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
      diffs.push({
        field,
        oldValue: formatFieldValue(field, o),
        newValue: formatFieldValue(field, n),
      });
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
