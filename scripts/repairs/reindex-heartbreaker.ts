/** Parent ops only: dry-run by default; --apply updates exactly one search doc.
 * Usage: npx tsx scripts/repairs/reindex-heartbreaker.ts [--apply] */
import "dotenv/config";
import { prisma } from "../../src/lib/prisma";
import { meilisearchClient, projectToSearchDocument } from "../../src/lib/meilisearch";
import { HEARTBREAKER_SLUG_REPAIR as repair } from "../../src/lib/project-slug-aliases";

async function main() {
  if (process.argv.slice(2).some((arg) => arg !== "--apply")) throw new Error("Only --apply is supported");
  const project = await prisma.project.findUnique({ where: { id: repair.id }, include: { vendor: { select: { name: true, slug: true } } } });
  if (!project || project.title !== repair.title || project.status !== repair.status || !project.published ||
      (project.slug !== repair.oldSlug && project.slug !== repair.newSlug)) throw new Error("Exact-record precondition changed; abort and re-review");
  console.log(JSON.stringify({ apply: process.argv.includes("--apply"), id: project.id, slug: project.slug, title: project.title }));
  if (!process.argv.includes("--apply")) return;
  // Do not use best-effort indexProject here: ops needs confirmed task success.
  const index = meilisearchClient.index("projects");
  const task = await index.addDocuments([projectToSearchDocument(project)]);
  const result = await meilisearchClient.tasks.waitForTask(task.taskUid, { timeOutMs: 30_000 });
  if (result.status !== "succeeded") throw new Error(`Search task ${task.taskUid}: ${result.status}`);
  const document = await index.getDocument(project.id);
  if (document.slug !== project.slug) throw new Error("Search slug verification failed");
  console.log(JSON.stringify({ taskUid: task.taskUid, status: result.status, verifiedSlug: document.slug }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
