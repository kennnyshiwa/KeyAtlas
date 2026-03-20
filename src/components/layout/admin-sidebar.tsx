"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { LayoutDashboard, FolderKanban, Store, Palette, ArrowLeft, Users, Tags, Flag, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const adminLinks = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/projects", label: "Projects", icon: FolderKanban },
  { href: "/admin/vendors", label: "Vendors", icon: Store },
  { href: "/admin/designers", label: "Designers", icon: Palette },
  { href: "/admin/keycap-profiles", label: "Keycap Profiles", icon: Tags },
  { href: "/admin/users", label: "Users", icon: Users, adminOnly: true },
  { href: "/admin/reports", label: "Reports", icon: Flag },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: Shield },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <aside className="hidden w-64 shrink-0 border-r md:block">
      <div className="flex h-full flex-col gap-2 p-4">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground mb-4 flex items-center gap-2 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to site
        </Link>
        <nav className="flex flex-col gap-1">
          {adminLinks.filter((link) => !link.adminOnly || isAdmin).map((link) => {
            const Icon = link.icon;
            const isActive =
              link.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
