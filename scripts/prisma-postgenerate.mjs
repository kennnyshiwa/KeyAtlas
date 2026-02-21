#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const prismaOutDir = path.join(root, "src", "generated", "prisma");
const indexPath = path.join(prismaOutDir, "index.ts");
const indexContent = 'export * from "./client";\n';

await mkdir(prismaOutDir, { recursive: true });

let current = "";
try {
  current = await readFile(indexPath, "utf8");
} catch {
  // missing file is expected after prisma generate
}

if (current !== indexContent) {
  await writeFile(indexPath, indexContent, "utf8");
  console.log(`wrote ${path.relative(root, indexPath)}`);
} else {
  console.log(`ok ${path.relative(root, indexPath)}`);
}
