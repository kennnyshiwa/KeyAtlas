import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

interface ExtractedPost {
  messageId: string | null;
  postNumber: number;
  author: string | null;
  timestamp: string | null;
  contentHtml: string;
  contentText: string;
  links: string[];
  imageUrls: string[];
}

interface ExtractedThread {
  sourceUrl: string;
  fetchedAt: string;
  topicId: string;
  title: string;
  canonicalUrl: string;
  op: ExtractedPost | null;
  posts: ExtractedPost[];
  metadata: {
    postCount: number;
    uniqueAuthors: number;
    allLinks: string[];
    allImageUrls: string[];
  };
}

function decodeHtmlEntities(input: string) {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/\n\s+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}

function toAbsoluteUrl(url: string) {
  const value = url.trim();
  if (!value) return value;
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `https://geekhack.org${value}`;
  return value;
}

function uniq(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function extractAll(regex: RegExp, input: string, group = 1) {
  const out: string[] = [];
  for (const match of input.matchAll(regex)) {
    const item = match[group]?.trim();
    if (item) out.push(toAbsoluteUrl(decodeHtmlEntities(item)));
  }
  return uniq(out);
}

function extractFirst(regexes: RegExp[], input: string) {
  for (const regex of regexes) {
    const match = input.match(regex);
    const value = match?.[1]?.trim();
    if (value) return decodeHtmlEntities(value);
  }
  return null;
}

function extractTitle(html: string) {
  const raw = extractFirst(
    [
      /<h3[^>]*class=["'][^"']*catbg[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i,
      /<h3[^>]*>([\s\S]*?)<\/h3>/i,
      /<title>([\s\S]*?)<\/title>/i,
    ],
    html
  );
  if (!raw) return "Untitled Geekhack Topic";

  // Strip HTML tags first so cleanup regexes can match plain text
  return (
    raw
      .replace(/<[^>]+>/g, " ")
      .replace(/\s*-\s*Geekhack[\s\S]*$/i, "")
      .replace(/[\s\S]*?Author\s+Topic:\s*/i, "")
      .replace(/^Topic:\s*/i, "")
      .replace(/^\s*\[(?:IC|GB|GH)\]\s*/i, "")
      .replace(/\(Read\s+\d+\s+times\)\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim() || "Untitled Geekhack Topic"
  );
}

function cleanPostHtml(html: string) {
  return html
    .replace(/<div[^>]*class=["'][^"']*quoteheader[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "")
    .replace(/<div[^>]*class=["'][^"']*quote[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "")
    .replace(/<div[^>]*class=["'][^"']*signature[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "")
    .replace(/<div[^>]*class=["'][^"']*lastedit[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "")
    .replace(/<span[^>]*>\s*«\s*Last Edit:[\s\S]*?<\/span>/gi, "")
    .replace(/\s*Logged\s*/gi, "")
    .trim();
}

function extractPostSegment(postHtml: string, postNumber: number): ExtractedPost {
  const messageId =
    postHtml.match(/<div[^>]*class=["'][^"']*inner[^"']*["'][^>]*id=["']msg_(\d+)["']/i)?.[1] ??
    postHtml.match(/id=["']msg_(\d+)["'](?!_)/i)?.[1] ??
    null;

  const author = extractFirst(
    [
      /<h4[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i,
      /<div[^>]*class=["'][^"']*poster[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i,
      /<div[^>]*class=["'][^"']*poster[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    ],
    postHtml
  )?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? null;

  const timestamp = extractFirst(
    [
      /<div[^>]*class=["'][^"']*keyinfo[^"']*["'][^>]*>[\s\S]*?(?:on:|«\s*on:)\s*([\s\S]*?)<\/div>/i,
      /<div[^>]*class=["'][^"']*smalltext[^"']*["'][^>]*>[\s\S]*?(\w+\s+\d{1,2},\s+\d{4}[\s\S]*?)<\/div>/i,
    ],
    postHtml
  )?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? null;

  const rawContent =
    extractFirst(
      [
        messageId
          ? new RegExp(
              `<div[^>]*class=["'][^"']*inner[^"']*["'][^>]*id=["']msg_${messageId}["'][^>]*>([\\s\\S]*?)<\\/div>\\s*<\\/div>\\s*<div[^>]*class=["'][^"']*moderatorbar`,
              "i"
            )
          : /$^/,
        /<div[^>]*class=["'][^"']*post[^"']*["'][^>]*>[\s\S]*?<div[^>]*class=["'][^"']*inner[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<div[^>]*class=["'][^"']*moderatorbar/i,
        /<div[^>]*class=["'][^"']*inner[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      ],
      postHtml
    ) ?? "";

  const contentHtml = cleanPostHtml(rawContent);

  const links = extractAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi, contentHtml || postHtml);
  const imageUrls = extractAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, contentHtml || postHtml);

  const contentText = stripTags(contentHtml || postHtml)
    .replace(/^\s*Author\s+Topic:\s*/i, "")
    .replace(/\s*Reply\s+#\d+\s+on:\s*/gi, "\n")
    .replace(/\s*«\s*Last Edit:[^\n]+/gi, "")
    .replace(/\s*Logged\s*/gi, "")
    .trim();

  return {
    messageId,
    postNumber,
    author,
    timestamp,
    contentHtml,
    contentText,
    links,
    imageUrls,
  };
}

function extractPosts(html: string): ExtractedPost[] {
  const markers = [
    ...html.matchAll(/<div[^>]*class=["'][^"']*inner[^"']*["'][^>]*id=["']msg_(\d+)["']/gi),
  ];
  if (markers.length === 0) return [];

  const posts: ExtractedPost[] = [];

  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index ?? 0;
    const end = i + 1 < markers.length ? markers[i + 1].index ?? html.length : html.length;
    const segment = html.slice(start, end);
    posts.push(extractPostSegment(segment, i + 1));
  }

  return posts;
}

function renderMarkdown(thread: ExtractedThread) {
  const lines: string[] = [];
  lines.push(`# ${thread.title}`);
  lines.push("");
  lines.push(`- Source: ${thread.sourceUrl}`);
  lines.push(`- Canonical: ${thread.canonicalUrl}`);
  lines.push(`- Topic ID: ${thread.topicId}`);
  lines.push(`- Fetched: ${thread.fetchedAt}`);
  lines.push(`- Posts captured: ${thread.metadata.postCount}`);
  lines.push(`- Unique authors: ${thread.metadata.uniqueAuthors}`);
  lines.push("");

  if (thread.op) {
    lines.push("## Original Post (OP)");
    lines.push("");
    lines.push(`- Author: ${thread.op.author ?? "Unknown"}`);
    lines.push(`- Timestamp: ${thread.op.timestamp ?? "Unknown"}`);
    lines.push("");
    lines.push(thread.op.contentText || "(No OP content extracted)");
    lines.push("");
  }

  lines.push("## Posts (first page capture)");
  lines.push("");
  for (const post of thread.posts) {
    lines.push(`### #${post.postNumber} ${post.author ?? "Unknown author"}`);
    lines.push(`- Message ID: ${post.messageId ?? "n/a"}`);
    lines.push(`- Timestamp: ${post.timestamp ?? "Unknown"}`);
    lines.push(`- Links: ${post.links.length}`);
    lines.push(`- Images: ${post.imageUrls.length}`);
    lines.push("");
    lines.push(post.contentText || "(No content extracted)");
    lines.push("");
  }

  if (thread.metadata.allLinks.length > 0) {
    lines.push("## Extracted Links");
    lines.push("");
    thread.metadata.allLinks.forEach((link) => lines.push(`- ${link}`));
    lines.push("");
  }

  if (thread.metadata.allImageUrls.length > 0) {
    lines.push("## Extracted Image URLs");
    lines.push("");
    thread.metadata.allImageUrls.forEach((url) => lines.push(`- ${url}`));
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  const targetUrl = process.argv[2];
  if (!targetUrl) {
    console.error('Usage: npx tsx scripts/copy-geekhack-ic.ts "https://geekhack.org/index.php?topic=..."');
    process.exit(1);
  }

  const topicId = targetUrl.match(/topic=(\d+)/i)?.[1] ?? `topic-${Date.now()}`;

  const res = await fetch(targetUrl, {
    redirect: "follow",
    headers: {
      "user-agent": "KeyVault Import Debugger/1.0 (+https://geekhack.org)",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch URL (${res.status} ${res.statusText})`);
  }

  const finalUrl = res.url || targetUrl;
  const html = await res.text();

  const title = extractTitle(html);
  const posts = extractPosts(html);
  const op = posts[0] ?? null;

  const allLinks = uniq(posts.flatMap((p) => p.links));
  const allImageUrls = uniq(posts.flatMap((p) => p.imageUrls));
  const uniqueAuthors = new Set(posts.map((p) => p.author).filter(Boolean)).size;

  const payload: ExtractedThread = {
    sourceUrl: targetUrl,
    fetchedAt: new Date().toISOString(),
    topicId,
    title,
    canonicalUrl: finalUrl,
    op,
    posts,
    metadata: {
      postCount: posts.length,
      uniqueAuthors,
      allLinks,
      allImageUrls,
    },
  };

  const outputDir = path.join(process.cwd(), "tmp", "import-debug");
  await mkdir(outputDir, { recursive: true });

  const jsonPath = path.join(outputDir, `${topicId}.json`);
  const mdPath = path.join(outputDir, `${topicId}.md`);

  await writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  await writeFile(mdPath, renderMarkdown(payload), "utf8");

  console.log(`Saved JSON: ${jsonPath}`);
  console.log(`Saved Markdown: ${mdPath}`);
  console.log(`Captured ${payload.metadata.postCount} posts, ${payload.metadata.allImageUrls.length} images, ${payload.metadata.allLinks.length} links.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
