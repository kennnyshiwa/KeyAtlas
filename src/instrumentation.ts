let wired = false;

export async function register() {
  // instrumentation can run in edge contexts too; keep this file edge-safe
  // and lazy-load the Node-only hooks when we're actually on the Node runtime.
  if (typeof (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime !== "undefined") return;
  if (wired) return;
  wired = true;

  const { wireNodeRuntimeHandlers } = await import("./instrumentation-node");
  wireNodeRuntimeHandlers();
}
