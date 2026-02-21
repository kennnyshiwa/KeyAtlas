"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Keyboard, Search, ChevronDown } from "lucide-react";
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
import { cn } from "@/lib/utils";

const projectCategories = [
  { href: "/projects?category=KEYCAPS", label: "Keycaps" },
  { href: "/projects?category=KEYBOARDS", label: "Keyboards" },
  { href: "/projects?category=ARTISANS", label: "Artisans" },
  { href: "/projects?category=ACCESSORIES", label: "Accessories" },
];

const navLinks = [
  { href: "/vendors", label: "Vendors" },
  { href: "/calendar", label: "Calendar" },
  { href: "/statistics", label: "Stats" },
  { href: "/projects/submit", label: "Submit" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 w-full border-b backdrop-blur">
      <div className="container flex h-14 items-center">
        <MobileNav />
        <Link href="/" className="mr-6 flex items-center space-x-2">
          <Keyboard className="h-6 w-6" />
          <span className="hidden font-bold sm:inline-block">KeyVault</span>
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
          <Button variant="outline" size="sm" className="hidden md:flex" asChild>
            <Link href="/projects?search=true">
              <Search className="mr-2 h-4 w-4" />
              Search
              <kbd className="bg-muted text-muted-foreground pointer-events-none ml-2 hidden h-5 items-center gap-1 rounded border px-1.5 font-mono text-xs font-medium opacity-100 select-none sm:flex">
                <span className="text-xs">⌘</span>K
              </kbd>
            </Link>
          </Button>
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
