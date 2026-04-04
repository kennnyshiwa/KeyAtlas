"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserMenu } from "@/components/auth/user-menu";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { cn } from "@/lib/utils";
import { useSession } from "next-auth/react";
import { NavbarSearch } from "@/components/search/navbar-search";

const projectCategories = [
  { href: "/projects?category=KEYCAPS", label: "Keycaps" },
  { href: "/projects?category=KEYBOARDS", label: "Keyboards" },
  { href: "/projects?category=ARTISANS", label: "Artisans" },
  { href: "/projects?category=ACCESSORIES", label: "Accessories" },
];

const navLinks = [
  { href: "/forums", label: "Forums" },
  { href: "/vendors", label: "Vendors" },
  { href: "/designers", label: "Designers" },
  { href: "/guides", label: "Guides" },
  { href: "/calendar", label: "Calendar" },
  { href: "/statistics", label: "Stats" },
];

export function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 w-full border-b backdrop-blur">
      <div className="container flex h-14 items-center">
        <MobileNav />
        <Link href="/" className="mr-6 flex items-center space-x-2">
          <Logo size={24} />
          <span className="hidden font-bold sm:inline-block">KeyAtlas</span>
        </Link>
        <nav className="hidden items-center space-x-6 text-sm font-medium md:flex">
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "hover:text-foreground/80 flex items-center gap-1 transition-colors outline-none",
                pathname.startsWith("/projects") && !pathname.startsWith("/projects/submit")
                  ? "text-foreground"
                  : "text-foreground/60"
              )}
            >
              Projects
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem asChild>
                <Link href="/projects">All Projects</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {projectCategories.map((cat) => (
                <DropdownMenuItem key={cat.href} asChild>
                  <Link href={cat.href}>{cat.label}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "hover:text-foreground/80 transition-colors",
                pathname === link.href
                  ? "text-foreground"
                  : "text-foreground/60"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-1 items-center justify-end space-x-2">
          <NavbarSearch />
          {session?.user && (
            <Button size="sm" className="hidden md:flex" asChild>
              <Link href="/projects/submit">
                <Plus className="mr-2 h-4 w-4" />
                Submit Project
              </Link>
            </Button>
          )}
          <NotificationBell />
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
