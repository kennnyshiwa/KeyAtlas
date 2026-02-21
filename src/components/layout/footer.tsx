import { Keyboard } from "lucide-react";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t">
      <div className="container flex flex-col items-center justify-between gap-4 py-10 md:h-24 md:flex-row md:py-0">
        <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
          <Keyboard className="h-5 w-5" />
          <p className="text-muted-foreground text-center text-sm leading-loose md:text-left">
            KeyVault — Your mechanical keyboard community hub.
          </p>
        </div>
        <div className="text-muted-foreground flex gap-4 text-sm">
          <Link href="/projects" className="hover:text-foreground transition-colors">
            Projects
          </Link>
        </div>
      </div>
    </footer>
  );
}
