"use client";

import nextDynamic from "next/dynamic";

const PushPrompt = nextDynamic(
  () =>
    import("@/components/notifications/push-prompt").then((m) => m.PushPrompt),
  { ssr: false }
);

export function ClientPushPrompt() {
  return <PushPrompt />;
}
