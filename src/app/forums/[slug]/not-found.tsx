import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ForumCategoryNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground text-lg">Forum category not found.</p>
      <Button asChild>
        <Link href="/forums">Back to Forums</Link>
      </Button>
    </div>
  );
}
