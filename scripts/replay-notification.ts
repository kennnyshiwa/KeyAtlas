import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { dispatchNotification } from "../src/lib/notifications/service";
import type {
  NotificationPreferenceType,
  NotificationType,
} from "../src/generated/prisma/client";

const NOTIFICATION_PREFERENCE_TYPES = [
  "FORUM_REPLIES",
  "FORUM_CATEGORY_THREADS",
  "PROJECT_UPDATES",
  "PROJECT_COMMENTS",
  "PROJECT_STATUS_CHANGES",
  "PROJECT_GB_ENDING_SOON",
  "NEW_FOLLOWERS",
  "WATCHLIST_MATCHES",
] as const satisfies readonly NotificationPreferenceType[];

const NOTIFICATION_TYPES = [
  "PROJECT_UPDATE",
  "PROJECT_STATUS_CHANGE",
  "NEW_COMMENT",
  "COMMENT_REPLY",
  "NEW_FOLLOWER",
  "FORUM_REPLY",
  "NEW_FORUM_THREAD",
  "GB_STARTING",
  "GB_ENDING",
  "PROJECT_GB_ENDING_SOON",
  "WATCHLIST_MATCH",
] as const satisfies readonly NotificationType[];

const args = process.argv.slice(2);

function readFlag(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function readMultiFlag(flag: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === flag && args[i + 1]) values.push(args[i + 1]);
  }
  return values;
}

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

function printUsage(): never {
  console.log(`
Replay a notification through the real delivery path (in-app + push + email).

Usage:
  npx tsx scripts/replay-notification.ts \
    --username kennnyshiwa \
    --pref WATCHLIST_MATCHES \
    --type WATCHLIST_MATCH \
    --title "New project matches your watchlist" \
    --message '"DCS Greengul" matches your saved filter.' \
    --link /projects/dcs-greengul

Options:
  --username <name>         Repeatable username target
  --user-id <id>            Repeatable direct user id target
  --pref <type>             NotificationPreferenceType
  --type <type>             NotificationType
  --title <text>            Notification title
  --message <text>          Notification body
  --link <path|url>         Optional app link
  --actor-id <id>           Optional actor id to exclude from recipient set
  --email-subject <text>    Optional email subject override
  --email-heading <text>    Optional email heading override
  --email-cta <text>        Optional email CTA label override
  --metadata-json <json>    Optional metadata JSON object
  --dry-run                 Resolve recipients and print payload only
  --help                    Show this help
`);
  process.exit(0);
}

function requireString(flag: string): string {
  const value = readFlag(flag);
  if (!value) {
    console.error(`Missing required flag: ${flag}`);
    printUsage();
  }
  return value;
}

function parseEnumValue<T extends readonly string[]>(
  label: string,
  raw: string,
  allowed: T,
): T[number] {
  if ((allowed as readonly string[]).includes(raw)) return raw as T[number];
  console.error(`Invalid ${label}: ${raw}`);
  console.error(`Allowed values: ${allowed.join(", ")}`);
  process.exit(1);
}

async function main() {
  if (hasFlag("--help")) printUsage();

  const usernames = readMultiFlag("--username");
  const userIds = readMultiFlag("--user-id");
  const dryRun = hasFlag("--dry-run");

  if (usernames.length === 0 && userIds.length === 0) {
    console.error("Provide at least one --username or --user-id target.");
    printUsage();
  }

  const preferenceType = parseEnumValue(
    "preference type",
    requireString("--pref"),
    NOTIFICATION_PREFERENCE_TYPES,
  );
  const notificationType = parseEnumValue(
    "notification type",
    requireString("--type"),
    NOTIFICATION_TYPES,
  );

  const title = requireString("--title");
  const message = requireString("--message");
  const link = readFlag("--link");
  const actorId = readFlag("--actor-id");
  const emailSubject = readFlag("--email-subject");
  const emailHeading = readFlag("--email-heading");
  const emailCtaLabel = readFlag("--email-cta");
  const metadataJson = readFlag("--metadata-json");

  let metadata: Record<string, unknown> | undefined;
  if (metadataJson) {
    const parsed = JSON.parse(metadataJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("--metadata-json must decode to a JSON object");
    }
    metadata = parsed as Record<string, unknown>;
  }

  const resolvedUsers = await prisma.user.findMany({
    where: {
      OR: [
        ...(usernames.length > 0 ? [{ username: { in: usernames } }] : []),
        ...(userIds.length > 0 ? [{ id: { in: userIds } }] : []),
      ],
    },
    select: {
      id: true,
      username: true,
      email: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const recipients = Array.from(new Set(resolvedUsers.map((user) => user.id)));

  if (recipients.length === 0) {
    throw new Error("No matching users found for the supplied targets.");
  }

  const missingUsernames = usernames.filter(
    (username) => !resolvedUsers.some((user) => user.username === username),
  );
  const missingUserIds = userIds.filter(
    (id) => !resolvedUsers.some((user) => user.id === id),
  );

  if (missingUsernames.length > 0) {
    console.warn(`Missing usernames: ${missingUsernames.join(", ")}`);
  }
  if (missingUserIds.length > 0) {
    console.warn(`Missing user ids: ${missingUserIds.join(", ")}`);
  }

  console.log(`Recipients (${recipients.length}):`);
  for (const user of resolvedUsers) {
    console.log(`- ${user.id}  username=${user.username ?? "(none)"}  email=${user.email ?? "(none)"}`);
  }

  const payload = {
    recipients,
    actorId,
    preferenceType,
    notificationType,
    title,
    message,
    link,
    metadata,
    emailSubject,
    emailHeading,
    emailCtaLabel,
  };

  console.log("Payload:");
  console.log(JSON.stringify(payload, null, 2));

  if (dryRun) {
    console.log("Dry run only, nothing sent.");
    return;
  }

  await dispatchNotification(payload);
  console.log("Replay dispatched successfully.");
}

main()
  .catch((error) => {
    console.error("Failed to replay notification", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
