import Link from "next/link";

const links = [
  { href: "/playground", label: "Playground" },
  { href: "/models", label: "Pricing models" },
  { href: "/#related", label: "Related" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="font-serif text-2xl leading-none tracking-tight">
          signalquote
        </Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-4">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
