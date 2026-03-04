export interface ExtractedPost {
  messageId: string | null;
  postNumber: number;
  author: string | null;
  timestamp: string | null;
  contentHtml: string;
  contentText: string;
  links: string[];
  imageUrls: string[];
}

export interface ExtractedThread {
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

export interface GeekhackPrefillPayload {
  title: string;
  description: string;
  sourceUrl: string;
  category: "KEYCAPS";
  status: "INTEREST_CHECK";
  tags: string[];
  links: Array<{
    label: string;
    url: string;
    type: "GEEKHACK";
  }>;
  images: Array<{
    url: string;
    alt?: string;
  }>;
}

function fixCommonMojibake(input: string) {
  return input
    .replace(/â€™/g, "’")
    .replace(/â€˜/g, "‘")
    .replace(/â€œ/g, "“")
    .replace(/â€/g, "”")
    .replace(/â€“/g, "–")
    .replace(/â€”/g, "—")
    .replace(/â€¦/g, "…")
    .replace(/Â /g, " ")
    .replace(/Â/g, "");
}

function decodeHtmlEntities(input: string) {
  return fixCommonMojibake(
    input
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
  );
}

function extractCharset(source: string | null) {
  if (!source) return null;
  const m = source.match(/charset\s*=\s*["']?([a-z0-9_\-]+)/i);
  return m?.[1]?.toLowerCase() ?? null;
}

function decodeGeekhackHtml(res: Response, bytes: Uint8Array) {
  const contentTypeCharset = extractCharset(res.headers.get("content-type"));
  const sniff = new TextDecoder("utf-8").decode(bytes.subarray(0, Math.min(bytes.length, 8192)));
  const metaCharset =
    extractCharset(sniff.match(/<meta[^>]+charset=[^>]+>/i)?.[0] ?? null) ??
    extractCharset(sniff.match(/<meta[^>]+content=["'][^"']*charset=[^"']*["'][^>]*>/i)?.[0] ?? null);

  const preferred = contentTypeCharset || metaCharset || "utf-8";

  const decodeWith = (charset: string) => {
    try {
      return new TextDecoder(charset).decode(bytes);
    } catch {
      return null;
    }
  };

  let decoded = decodeWith(preferred) ?? decodeWith("utf-8") ?? "";

  // If preferred decode still has replacement chars, windows-1252 often fixes Geekhack punctuation
  if (decoded.includes("�")) {
    const win1252 = decodeWith("windows-1252");
    if (win1252 && win1252.split("�").length < decoded.split("�").length) {
      decoded = win1252;
    }
  }

  return fixCommonMojibake(decoded);
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

  const author =
    extractFirst(
      [
        /<h4[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i,
        /<div[^>]*class=["'][^"']*poster[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i,
        /<div[^>]*class=["'][^"']*poster[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      ],
      postHtml
    )
      ?.replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim() ?? null;

  const timestamp =
    extractFirst(
      [
        /<div[^>]*class=["'][^"']*keyinfo[^"']*["'][^>]*>[\s\S]*?(?:on:|«\s*on:)\s*([\s\S]*?)<\/div>/i,
        /<div[^>]*class=["'][^"']*smalltext[^"']*["'][^>]*>[\s\S]*?(\w+\s+\d{1,2},\s+\d{4}[\s\S]*?)<\/div>/i,
      ],
      postHtml
    )
      ?.replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim() ?? null;

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

  // Strip trailing </div> tags that leak from the container
  const contentHtml = cleanPostHtml(rawContent).replace(/(<\/div>\s*)+$/i, "").trim();

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

export function validateGeekhackTopicUrl(input: string) {
  try {
    const parsed = new URL(input.trim());
    if (!/geekhack\.org$/i.test(parsed.hostname)) return null;
    const topicId = parsed.searchParams.get("topic")?.match(/^(\d+)/)?.[1] ?? null;
    if (!topicId) return null;
    return {
      topicId,
      normalizedUrl: `https://geekhack.org/index.php?topic=${topicId}.0`,
    };
  } catch {
    return null;
  }
}

export async function fetchGeekhackThread(topicUrl: string): Promise<ExtractedThread> {
  const topic = validateGeekhackTopicUrl(topicUrl);
  if (!topic) {
    throw new Error("Please enter a valid Geekhack topic URL.");
  }

  // SSRF protection: validate URL does not resolve to internal addresses
  const { assertSafeUrl } = await import("@/lib/security/ssrf-guard");
  await assertSafeUrl(topic.normalizedUrl);

  const res = await fetch(topic.normalizedUrl, {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "user-agent": "KeyVault Importer/1.0 (+https://geekhack.org)",
    },
  });

  // Handle redirects with SSRF re-validation
  if ([301, 302, 303, 307, 308].includes(res.status)) {
    const location = res.headers.get("location");
    if (!location) throw new Error("Redirect with no location header");
    const redirectUrl = new URL(location, topic.normalizedUrl).toString();
    await assertSafeUrl(redirectUrl);
    const redirectRes = await fetch(redirectUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: { "user-agent": "KeyVault Importer/1.0 (+https://geekhack.org)" },
    });
    if (!redirectRes.ok) {
      throw new Error(`Failed to fetch Geekhack thread after redirect (${redirectRes.status})`);
    }
    const finalUrl = redirectRes.url || redirectUrl;
    const htmlBytes = new Uint8Array(await redirectRes.arrayBuffer());
    const html = decodeGeekhackHtml(redirectRes, htmlBytes);
    return parseThread(topic, finalUrl, html);
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch Geekhack thread (${res.status} ${res.statusText})`);
  }

  const finalUrl = res.url || topic.normalizedUrl;
  const htmlBytes = new Uint8Array(await res.arrayBuffer());
  const html = decodeGeekhackHtml(res, htmlBytes);
  return parseThread(topic, finalUrl, html);
}

function parseThread(
  topic: { normalizedUrl: string; topicId: string },
  finalUrl: string,
  html: string
): ExtractedThread {
  const title = extractTitle(html);
  const posts = extractPosts(html);
  const op = posts[0] ?? null;

  const allLinks = uniq(posts.flatMap((p) => p.links));
  const allImageUrls = uniq(posts.flatMap((p) => p.imageUrls));
  const uniqueAuthors = new Set(posts.map((p) => p.author).filter(Boolean)).size;

  return {
    sourceUrl: topic.normalizedUrl,
    fetchedAt: new Date().toISOString(),
    topicId: topic.topicId,
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
}

export function buildGeekhackPrefillPayload(thread: ExtractedThread): GeekhackPrefillPayload {
  const description = thread.op?.contentHtml?.trim()
    ? thread.op.contentHtml.trim()
    : `<p>${thread.op?.contentText?.trim() || ""}</p>`;

  return {
    title: thread.title,
    description,
    sourceUrl: thread.canonicalUrl || thread.sourceUrl,
    category: "KEYCAPS",
    status: "INTEREST_CHECK",
    tags: ["geekhack", "ic"],
    links: [
      {
        label: "Geekhack IC",
        url: thread.canonicalUrl || thread.sourceUrl,
        type: "GEEKHACK",
      },
    ],
    images: thread.metadata.allImageUrls.map((url, index) => ({
      url,
      alt: `${thread.title} image ${index + 1}`,
    })),
  };
}
