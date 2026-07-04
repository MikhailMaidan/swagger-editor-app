import Link from "next/link";

export function AppFooter() {
  return (
    <footer className="px-4 pb-8 pt-6 md:px-8 lg:px-10">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 border-t border-[color:var(--color-brand-border)] pt-6 text-sm font-semibold text-[color:var(--color-brand-muted)] sm:flex-row sm:items-center sm:justify-between">
        <p>RSSwag OpenAPI workspace</p>
        <nav className="flex items-center gap-5" aria-label="Footer navigation">
          <Link
            href="/"
            className="transition hover:text-[color:var(--color-brand-purple)]"
          >
            Home
          </Link>
          <Link
            href="/about"
            className="transition hover:text-[color:var(--color-brand-purple)]"
          >
            About
          </Link>
        </nav>
      </div>
    </footer>
  );
}
