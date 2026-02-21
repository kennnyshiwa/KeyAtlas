import { Package } from "lucide-react";

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export function EmptyState({
  title = "No results found",
  description = "Try adjusting your filters or search terms.",
  icon,
  children,
}: EmptyStateProps) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
      <div className="text-muted-foreground mb-4">
        {icon ?? <Package className="h-12 w-12" />}
      </div>
      <h3 className="mb-1 text-lg font-semibold">{title}</h3>
      <p className="text-muted-foreground mb-4 text-sm">{description}</p>
      {children}
    </div>
  );
}
