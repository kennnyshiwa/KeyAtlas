"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const ENDPOINTS = [
  {
    method: "GET",
    path: "/api/v1/projects",
    description: "List and search projects with filtering and pagination.",
    params: "page, limit (max 50), category, status, q (search title), profile, shipped, featured, designer",
    rateLimit: "20 req/min",
  },
  {
    method: "GET",
    path: "/api/v1/projects/latest",
    description: "Get the latest published projects.",
    params: "limit (max 25, default 10)",
    rateLimit: "30 req/min",
  },
  {
    method: "GET",
    path: "/api/v1/projects/:slug",
    description: "Get full project details by slug.",
    params: "none",
    rateLimit: "30 req/min",
  },
  {
    method: "GET",
    path: "/api/v1/calendar",
    description: "Get projects with dates in a given month.",
    params: "month (1-12, required), year (required)",
    rateLimit: "20 req/min",
  },
  {
    method: "GET",
    path: "/api/v1/vendors",
    description: "List all vendors with project counts.",
    params: "none",
    rateLimit: "10 req/min",
  },
  {
    method: "GET",
    path: "/api/v1/categories",
    description: "List all categories with project counts.",
    params: "none",
    rateLimit: "10 req/min",
  },
];

export function ApiDocs() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>API Documentation</CardTitle>
        <CardDescription>
          All endpoints require an API key passed via the Authorization header.
          All endpoints are read-only (GET).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Authentication</h4>
          <p className="text-muted-foreground text-sm">
            Include your API key in the <code>Authorization</code> header:
          </p>
          <pre className="bg-muted overflow-x-auto rounded-md p-3 text-sm">
{`curl -H "Authorization: Bearer kv_your_key_here" \\
  http://localhost:3000/api/v1/projects`}
          </pre>
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-semibold">Endpoints</h4>
          {ENDPOINTS.map((ep) => (
            <div
              key={ep.path}
              className="border-border space-y-1 border-b pb-3 last:border-0"
            >
              <div className="flex items-center gap-2">
                <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  {ep.method}
                </span>
                <code className="text-sm">{ep.path}</code>
              </div>
              <p className="text-muted-foreground text-sm">{ep.description}</p>
              {ep.params !== "none" && (
                <p className="text-muted-foreground text-xs">
                  <span className="font-medium">Query params:</span>{" "}
                  {ep.params}
                </p>
              )}
              <p className="text-muted-foreground text-xs">
                <span className="font-medium">Rate limit:</span>{" "}
                {ep.rateLimit}
              </p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Rate Limits</h4>
          <p className="text-muted-foreground text-sm">
            All endpoints are rate limited per API key. When you exceed the
            limit you&apos;ll receive a <code>429</code> response with a{" "}
            <code>Retry-After</code> header indicating how many seconds to wait.
          </p>
          <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
            <li>Latest projects: 30 req/min</li>
            <li>Project detail: 30 req/min</li>
            <li>Project list, calendar: 20 req/min</li>
            <li>Vendors, categories: 10 req/min</li>
          </ul>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Response Format</h4>
          <p className="text-muted-foreground text-sm">
            All list endpoints return data in the following format:
          </p>
          <pre className="bg-muted overflow-x-auto rounded-md p-3 text-sm">
{`{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}`}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
