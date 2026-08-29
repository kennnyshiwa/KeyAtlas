const sentinel = process.argv[2];

if (!sentinel) {
  throw new Error("Expected a non-secret sentinel argument");
}

let input = "";
for await (const chunk of process.stdin) input += chunk;

const config = JSON.parse(input);
const scheduler = config.services?.scheduler;

if (!scheduler) throw new Error("Rendered Compose config has no scheduler service");
if (scheduler.image !== "alpine:3.20") throw new Error("Scheduler image changed unexpectedly");
if (scheduler.environment?.NOTIFICATION_JOB_SECRET !== sentinel) {
  throw new Error("Scheduler environment does not receive the exact Compose-provided value");
}
if (config.services?.app?.environment?.NOTIFICATION_JOB_SECRET !== sentinel) {
  throw new Error("App environment does not receive the exact Compose-provided value");
}
if (scheduler.environment?.NOTIFICATION_JOB_SCHEDULE !== "0 14 * * *") {
  throw new Error("Scheduler default is not 14:00 UTC daily");
}
if (scheduler.depends_on?.app?.condition !== "service_healthy") {
  throw new Error("Scheduler does not wait for the app health check");
}

const command = Array.isArray(scheduler.command)
  ? scheduler.command.join("\n")
  : String(scheduler.command ?? "");

if (!command.includes("Authorization: Bearer $${NOTIFICATION_JOB_SECRET}")) {
  throw new Error("Cron command does not preserve Compose's runtime-expansion escape");
}
if (command.includes(sentinel)) {
  throw new Error("Compose expanded the secret into the cron command");
}
if (!command.includes("$${NOTIFICATION_JOB_SCHEDULE}")) {
  throw new Error("Cron command does not read the configured schedule at container startup");
}
if (!command.includes("--post-data= http://app:3000/api/internal/notifications/gb-ending-soon")) {
  throw new Error("Scheduler endpoint or POST behavior changed unexpectedly");
}

console.log("scheduler Compose wiring verified with a non-secret sentinel");
