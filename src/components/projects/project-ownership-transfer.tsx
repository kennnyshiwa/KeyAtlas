"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface OwnerInfo {
  id: string;
  name: string | null;
  email: string | null;
  username: string | null;
  displayName: string | null;
}

interface ProjectOwnershipTransferProps {
  projectId: string;
  currentOwner: OwnerInfo;
}

function ownerLabel(owner: OwnerInfo) {
  return owner.displayName || owner.name || owner.username || owner.email || owner.id;
}

export function ProjectOwnershipTransfer({
  projectId,
  currentOwner,
}: ProjectOwnershipTransferProps) {
  const [targetInput, setTargetInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [owner, setOwner] = useState(currentOwner);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleTransfer = async () => {
    const raw = targetInput.trim();
    if (!raw) {
      setErrorMessage("Enter a target user email or user ID.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = raw.includes("@")
        ? { targetEmail: raw }
        : { targetUserId: raw };

      const res = await fetch(`/api/admin/projects/${projectId}/ownership`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || data?.error || "Failed to transfer ownership");
      }

      const updatedOwner = data?.project?.creator;
      if (updatedOwner?.id) {
        setOwner(updatedOwner);
      }
      setTargetInput("");
      toast.success("Ownership transferred");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ownership</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm">
          <span className="text-muted-foreground">Current owner:</span>{" "}
          <span className="font-medium">{ownerLabel(owner)}</span>
          <div className="text-muted-foreground text-xs">User ID: {owner.id}</div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="owner-target">Transfer to (email or user ID)</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="owner-target"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              placeholder="user@example.com or user_cuid"
              disabled={isSubmitting}
            />
            <Button
              type="button"
              onClick={handleTransfer}
              disabled={isSubmitting || !targetInput.trim()}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Transfer
            </Button>
          </div>
          {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
