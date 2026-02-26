"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function KeycapProfilesManager({ initialProfiles }: { initialProfiles: string[] }) {
  const [profiles, setProfiles] = useState<string[]>(initialProfiles);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setProfiles([...initialProfiles].sort((a, b) => a.localeCompare(b)));
  }, [initialProfiles]);

  async function addProfile() {
    const trimmed = name.trim();
    if (!trimmed) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/keycap-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Failed to add profile");

      setProfiles((prev) => Array.from(new Set([...prev, data.profile.name])).sort((a, b) => a.localeCompare(b)));
      setName("");
      toast.success("Profile added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add profile");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add profile (e.g. DSS, DCX, KCH)"
          maxLength={50}
        />
        <Button type="button" onClick={addProfile} disabled={loading || !name.trim()}>
          Add
        </Button>
      </div>

      <div className="rounded-md border p-3">
        <p className="mb-2 text-sm font-medium">Current profiles ({profiles.length})</p>
        <div className="flex flex-wrap gap-2">
          {profiles.map((p) => (
            <span key={p} className="bg-muted rounded px-2 py-1 text-xs">
              {p}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
