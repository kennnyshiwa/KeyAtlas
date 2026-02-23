let wired = false;

export async function register() {
  if (wired) return;
  wired = true;

  process.on("uncaughtException", (err) => {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack || "" : "";
    console.error(`[runtime-uncaught] ${message}\n${stack}`);
  });

  process.on("unhandledRejection", (reason) => {
    if (reason instanceof Error) {
      console.error(`[runtime-unhandled-rejection] ${reason.message}\n${reason.stack || ""}`);
      return;
    }
    console.error(`[runtime-unhandled-rejection] ${String(reason)}`);
  });
}
