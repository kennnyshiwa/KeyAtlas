import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { RichTextRenderer } from "@/components/editor/rich-text-renderer";
import type { ProjectWithRelations } from "@/types";

interface ProjectSpecsProps {
  project: ProjectWithRelations;
}

export function ProjectSpecs({ project }: ProjectSpecsProps) {
  return (
    <div className="space-y-4">
      {project.description && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Description</h2>
          <RichTextRenderer content={project.description} />
        </div>
      )}

      {project.links.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Links</h2>
            <div className="flex flex-wrap gap-2">
              {project.links.map((link) => (
                <Button
                  key={link.id}
                  variant="outline"
                  size="sm"
                  asChild
                >
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {link.label}
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </Button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
