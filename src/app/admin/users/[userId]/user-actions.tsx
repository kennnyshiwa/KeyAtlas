"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function UserActions({
  userId,
  isBanned,
  currentRole,
  canEdit,
}: {
  userId: string;
  isBanned: boolean;
  currentRole: "USER" | "MODERATOR" | "ADMIN" | "VENDOR";
  canEdit: boolean;
}) {
  const router = useRouter();
  const [role, setRole] = useState(currentRole === "VENDOR" ? "USER" : currentRole);
  const [loading, setLoading] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runRequest(path: string, init: RequestInit) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(path, init);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message || "Request failed");
      }
      return json;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return null;
    } finally {
      setLoading(false);
      router.refresh();
    }
  }

  if (!canEdit) {
    return <p className="text-muted-foreground text-sm">Read-only (moderator access).</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={isBanned ? "default" : "destructive"}
          disabled={loading}
          onClick={() =>
            runRequest(`/api/admin/users/${userId}/ban`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ banned: !isBanned }),
            })
          }
        >
          {isBanned ? "Unban account" : "Ban account"}
        </Button>

        <Button
          variant="outline"
          disabled={loading}
          onClick={async () => {
            const result = await runRequest(`/api/admin/users/${userId}/password-reset`, {
              method: "POST",
            });
            setResetLink(result?.data?.resetLink || null);
          }}
        >
          Trigger password reset
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as typeof role)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="USER">USER</option>
          <option value="MODERATOR">MODERATOR</option>
          <option value="ADMIN">ADMIN</option>
        </select>
        <Button
          variant="secondary"
          disabled={loading}
          onClick={() =>
            runRequest(`/api/admin/users/${userId}/role`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ role }),
            })
          }
        >
          Update role
        </Button>
      </div>

      {resetLink && (
        <p className="text-sm break-all">
          Reset link: <a className="underline" href={resetLink}>{resetLink}</a>
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
