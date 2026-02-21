import { createHash, randomBytes } from "crypto";
import { Client } from "pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const client = new Client({ connectionString });
  await client.connect();

  const email = process.env.QA_EMAIL || "qa-bot@keyatlas.local";
  const name = process.env.QA_NAME || "QA Bot";

  await client.query(
    `INSERT INTO users (id, name, email, role, "createdAt", "updatedAt")
     VALUES ('qa_bot_user', $1, $2, 'ADMIN', NOW(), NOW())
     ON CONFLICT (email)
     DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW()`,
    [name, email]
  );

  const rawKey = "kv_" + randomBytes(20).toString("hex");
  const hashed = createHash("sha256").update(rawKey).digest("hex");
  const prefix = rawKey.slice(0, 11) + "...";

  await client.query(
    `INSERT INTO api_keys (id, name, key, prefix, revoked, "createdAt", "userId")
     VALUES (concat('qa_key_', substr(md5(random()::text), 1, 12)), 'QA Smoke', $1, $2, false, NOW(), (SELECT id FROM users WHERE email = $3 LIMIT 1))`,
    [hashed, prefix, email]
  );

  await client.end();

  console.log(rawKey);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
