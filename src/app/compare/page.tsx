import { Suspense } from "react";
import { ComparePageClient } from "@/components/compare/compare-page-client";

interface ComparePageProps {
  searchParams: Promise<{ ids?: string }>;
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const params = await searchParams;

  return (
    <Suspense fallback={<div className="py-10 text-sm text-muted-foreground">Loading compare…</div>}>
      <ComparePageClient initialIds={params.ids} />
    </Suspense>
  );
}
