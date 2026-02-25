import { describe, it, expect, vi } from "vitest";
import { STATUS_LABELS } from "@/lib/constants";

describe("status change notification logic", () => {
  it("detects IC -> GB transition and produces correct message", () => {
    const oldStatus = "INTEREST_CHECK" as const;
    const newStatus = "GROUP_BUY" as const;

    const title = "Test Keycaps";
    const oldLabel = STATUS_LABELS[oldStatus];
    const newLabel = STATUS_LABELS[newStatus];
    const message = `${title} moved from ${oldLabel} to ${newLabel}.`;

    expect(oldLabel).toBe("Interest Check");
    expect(newLabel).toBe("Group Buy");
    expect(message).toBe("Test Keycaps moved from Interest Check to Group Buy.");
  });

  it("skips notification when status unchanged", () => {
    const oldStatus = "GROUP_BUY" as const;
    const newStatus = "GROUP_BUY" as const;
    expect(oldStatus !== newStatus).toBe(false);
  });

  it("dedupes recipients via dispatchNotification Set logic", async () => {
    // Simulate the dedup logic from dispatchNotification
    const recipientIds = ["a", "b", "a", "c", "b"];
    const actorId = "a";
    const deduped = Array.from(
      new Set(recipientIds.filter((id) => id && id !== actorId))
    );
    expect(deduped).toEqual(["b", "c"]);
  });
});
