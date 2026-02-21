import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ProjectNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground text-lg">Project not found.</p>
      <Button asChild>
        <Link href="/projects">Browse Projects</Link>
      </Button>
    </div>
  );
}
