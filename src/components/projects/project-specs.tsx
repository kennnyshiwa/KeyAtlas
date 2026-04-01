import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { RichTextRenderer } from "@/components/editor/rich-text-renderer";
import type { ProjectWithRelations } from "@/types";

interface ProjectSpecsProps {
  project: ProjectWithRelations;
}

export function ProjectSpecs({ project }: ProjectSpecsProps) {
  const alignClass = {
    LEFT: "text-left",
    CENTER: "text-center",
    RIGHT: "text-right",
  }[project.descriptionTextAlign ?? "LEFT"];

  const fontClass = {
    SMALL: "text-sm",
    MEDIUM: "text-base",
    LARGE: "text-lg",
  }[project.descriptionFontScale ?? "MEDIUM"];

  const widthClass = "max-w-none";

  const safeColor =
    project.descriptionTextColor && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(project.descriptionTextColor)
      ? project.descriptionTextColor
      : undefined;

  return (
    <div className="space-y-4">
      {project.description && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Description</h2>
          <RichTextRenderer
            content={project.description}
            unstyled
            className={`${alignClass} ${fontClass} ${widthClass} space-y-3 leading-7 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-3 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_blockquote]:border-l-4 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_a]:underline [&_a]:underline-offset-2`}
            style={{ color: safeColor }}
          />
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
