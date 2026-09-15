import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
const mocks = vi.hoisted(() => ({ users: vi.fn(), create: vi.fn(), email: vi.fn(), apns: vi.fn(), web: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findMany: mocks.users }, notification: { create: mocks.create } } }));
vi.mock("./email", () => ({ sendNotificationEmail: mocks.email }));
vi.mock("./apns", () => ({ sendAPNSNotification: mocks.apns }));
vi.mock("./web-push", () => ({ sendWebPushToDevice: mocks.web }));
import { dispatchNotification, stageNotification } from "./service";
const input = { recipients: ["actor", "follower", "follower", ""], actorId: "actor", preferenceType: "FORUM_REPLIES" as const, notificationType: "FORUM_REPLY" as const, title: "Reply", message: "Content", link: "/forums/category/thread" };
const user = { id: "follower", email: "fixture@example.invalid", name: null, displayName: null, notificationPreferences: [], pushDevices: [{ id: "device", platform: "web", token: "fake" }] };
const tx = { user: { findMany: mocks.users }, notification: { create: mocks.create } } as unknown as Prisma.TransactionClient;
beforeEach(() => { vi.resetAllMocks(); mocks.users.mockResolvedValue([user]); mocks.create.mockResolvedValue({ id: "notification" }); });
describe("production notification service", () => {
  it("filters actor/dedupes before lookup; default in-app on/email off; delivery closure can only run once", async () => {
    const deliver = await stageNotification(input, tx);
    expect(mocks.users.mock.calls[0][0].where.id.in).toEqual(["follower"]);
    expect(mocks.create).toHaveBeenCalledTimes(1); expect(mocks.web).not.toHaveBeenCalled();
    await Promise.all([deliver(), deliver()]);
    expect(mocks.create).toHaveBeenCalledTimes(1); expect(mocks.web).toHaveBeenCalledTimes(1); expect(mocks.email).not.toHaveBeenCalled();
  });
  it("email-only preference sends email but no in-app or push; no lookup when only actor", async () => {
    mocks.users.mockResolvedValue([{ ...user, notificationPreferences: [{ inApp: false, email: true }] }]);
    await (await stageNotification(input, tx))();
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.web).not.toHaveBeenCalled(); expect(mocks.email).toHaveBeenCalledTimes(1);
    mocks.users.mockClear(); await (await stageNotification({ ...input, recipients: ["actor"] }, tx))(); expect(mocks.users).not.toHaveBeenCalled();
  });
  it("staging failure rejects before any external send", async () => {
    mocks.create.mockRejectedValue(new Error("DB failed"));
    await expect(stageNotification(input, tx)).rejects.toThrow("DB failed");
    expect(mocks.email).not.toHaveBeenCalled(); expect(mocks.web).not.toHaveBeenCalled();
  });
  it("legacy dispatch still persists and delivers once per recipient", async () => {
    await dispatchNotification(input);
    expect(mocks.create).toHaveBeenCalledTimes(1); expect(mocks.web).toHaveBeenCalledTimes(1);
  });
});
