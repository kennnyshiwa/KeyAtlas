import { NextResponse } from "next/server";

// NOTE:
// Temporary stabilization mode.
// Previous edge middleware logic (internal existence checks + request tracing)
// was triggering high-frequency TransformStream runtime errors in production.
// Keep middleware as a no-op while we rely on app-level notFound handling.

export function middleware() {
  return NextResponse.next();
}

// Limit middleware to no routes until edge/runtime issue is fully root-caused.
export const config = {
  matcher: [],
};
