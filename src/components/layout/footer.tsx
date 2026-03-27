import { Logo } from "@/components/layout/logo";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t">
      <div className="container flex flex-col items-center justify-between gap-4 py-10 md:h-24 md:flex-row md:py-0">
        <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
          <Logo size={20} />
          <p className="text-muted-foreground text-center text-sm leading-loose md:text-left">
            KeyAtlas — Your mechanical keyboard community hub.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <div className="text-muted-foreground flex flex-wrap gap-4 text-sm">
            <Link href="/projects" className="hover:text-foreground transition-colors">
              Projects
            </Link>
            <Link href="/forums" className="hover:text-foreground transition-colors">
              Forums
            </Link>
            <Link href="/guides" className="hover:text-foreground transition-colors">
              Build Guides
            </Link>
            <Link href="/vendors" className="hover:text-foreground transition-colors">
              Vendors
            </Link>
            <Link href="/designers" className="hover:text-foreground transition-colors">
              Designers
            </Link>
            <Link href="/activity" className="hover:text-foreground transition-colors">
              Activity
            </Link>
            <Link href="/compare" className="hover:text-foreground transition-colors">
              Compare
            </Link>
            <Link href="/statistics" className="hover:text-foreground transition-colors">
              Stats
            </Link>
          </div>
          <div className="text-muted-foreground flex flex-wrap gap-4 text-sm">
            <Link href="/discover/group-buys" className="hover:text-foreground transition-colors">
              Group Buys
            </Link>
            <Link href="/discover/interest-checks" className="hover:text-foreground transition-colors">
              Interest Checks
            </Link>
            <Link href="/discover/ending-soon" className="hover:text-foreground transition-colors">
              Ending Soon
            </Link>
            <Link href="/discover/new-this-week" className="hover:text-foreground transition-colors">
              New This Week
            </Link>
            <Link href="/discover/vendors" className="hover:text-foreground transition-colors">
              Discover Vendors
            </Link>
            <Link href="/discover/build-guides" className="hover:text-foreground transition-colors">
              Build Guides
            </Link>
            <Link href="/calendar" className="hover:text-foreground transition-colors">
              Calendar
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
