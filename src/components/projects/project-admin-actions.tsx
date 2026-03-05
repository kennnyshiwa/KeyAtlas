"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ProjectAdminActionsProps {
  projectId: string;
  isCreator?: boolean;
}

export function ProjectAdminActions({ projectId, isCreator }: ProjectAdminActionsProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isAdmin = session?.user?.role === "ADMIN";
  const isMod = session?.user?.role === "MODERATOR";

  if (!isAdmin && !isMod && !isCreator) {
    return null;
  }

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to delete project");
      }

      toast.success("Project deleted");
      router.push("/projects");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong"
      );
    } finally {
      setIsDeleting(false);
      setOpen(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" asChild>
        <Link href={isAdmin ? `/admin/projects/${projectId}/edit` : `/projects/submit/${projectId}/edit`}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Edit
        </Link>
      </Button>
      {isAdmin && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete project?</DialogTitle>
              <DialogDescription>
                This action cannot be undone. The project and all its data will be
                permanently deleted.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
