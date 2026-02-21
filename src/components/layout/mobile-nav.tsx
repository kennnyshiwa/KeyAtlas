"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/utils";
import { useSession } from "next-auth/react";

const projectCategories = [
  { href: "/projects?category=KEYCAPS", label: "Keycaps" },
  { href: "/projects?category=KEYBOARDS", label: "Keyboards" },
  { href: "/projects?category=ARTISANS", label: "Artisans" },
  { href: "/projects?category=ACCESSORIES", label: "Accessories" },
];

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/vendors", label: "Vendors" },
  { href: "/calendar", label: "Calendar" },
  { href: "/statistics", label: "Stats" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeCategory = searchParams.get("category");
  const { data: session } = useSession();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="mr-2 md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            KeyVault
          </SheetTitle>
        </SheetHeader>
        <nav className="mt-6 flex flex-col space-y-1">
          <Link
            href="/projects"
            onClick={() => setOpen(false)}
            className={cn(
              "text-foreground/60 hover:text-foreground rounded-md px-3 py-2 text-sm font-medium transition-colors",
              pathname === "/projects" && !activeCategory &&
                "bg-accent text-foreground"
            )}
          >
            All Projects
          </Link>
          {projectCategories.map((cat) => (
            <Link
              key={cat.href}
              href={cat.href}
              onClick={() => setOpen(false)}
              className={cn(
                "text-foreground/60 hover:text-foreground rounded-md px-3 py-2 pl-6 text-sm transition-colors",
                pathname === "/projects" && activeCategory && cat.href.includes(activeCategory) &&
                  "bg-accent text-foreground"
              )}
            >
              {cat.label}
            </Link>
          ))}
          <div className="my-2 border-t" />
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={cn(
                "text-foreground/60 hover:text-foreground rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname === link.href &&
                  "bg-accent text-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
          {session?.user && (
            <Link
              href="/projects/submit"
              onClick={() => setOpen(false)}
              className={cn(
                "text-foreground/60 hover:text-foreground rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname === "/projects/submit" && "bg-accent text-foreground"
              )}
            >
              Submit Project
            </Link>
          )}
        </nav>
        <div className="mt-auto border-t pt-4">
          <ThemeToggle />
        </div>
      </SheetContent>
    </Sheet>
  );
}
