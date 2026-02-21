import { NextRequest, NextResponse } from "next/server";

const NOT_FOUND_HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"/><title>404 - Not Found</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:40px;max-width:720px;margin:0 auto;color:#111}a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}</style></head><body><h1>404</h1><p>The page you\'re looking for doesn\'t exist.</p><p><a href="/">Go home</a></p></body></html>`;

function getCheck(pathname: string): { type: "project" | "user" | "forum"; slug: string } | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 2) return null;

  const [root, slug] = parts;
  if (!slug) return null;

  if (root === "projects") {
    if (["submit"].includes(slug)) return null;
    return { type: "project", slug };
  }

  if (root === "users") {
    return { type: "user", slug };
  }

  if (root === "forums") {
    if (["new"].includes(slug)) return null;
    return { type: "forum", slug };
  }

  return null;
}

export async function middleware(req: NextRequest) {
  const { pathname, origin } = req.nextUrl;
  const check = getCheck(pathname);
  if (!check) return NextResponse.next();

  try {
    const verify = await fetch(
      `${origin}/api/internal/exists?type=${check.type}&slug=${encodeURIComponent(check.slug)}`,
      { cache: "no-store" }
    );

    if (verify.status === 404) {
      return new NextResponse(NOT_FOUND_HTML, {
        status: 404,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-robots-tag": "noindex",
        },
      });
    }
  } catch {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/projects/:path*", "/users/:path*", "/forums/:path*"],
};
