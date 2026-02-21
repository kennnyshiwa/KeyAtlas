"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "All", value: null },
  { label: "Interest Checks", value: "INTEREST_CHECK" },
  { label: "Group Buys", value: "GROUP_BUY" },
  { label: "Production", value: "PRODUCTION" },
  { label: "In Stock", value: "IN_STOCK" },
  { label: "Extras", value: "EXTRAS" },
] as const;

export function ProjectStatusTabs() {
  const searchParams = useSearchParams();
  const currentStatus = searchParams.get("status");

  const buildHref = (status: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status) {
      params.set("status", status);
    } else {
      params.delete("status");
    }
    params.delete("page");
    const qs = params.toString();
    return qs ? `/projects?${qs}` : "/projects";
  };

  return (
    <div className="bg-muted inline-flex items-center rounded-lg p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.label}
          href={buildHref(tab.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            (tab.value === null ? !currentStatus : currentStatus === tab.value)
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
