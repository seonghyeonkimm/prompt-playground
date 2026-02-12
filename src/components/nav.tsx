import Link from "next/link";

export function Nav() {
  return (
    <nav className="border-b border-[var(--border)] bg-[var(--card)]">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
        <Link href="/" className="font-bold text-lg">
          Prompt Logger
        </Link>
        <Link
          href="/sessions"
          className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          Sessions
        </Link>
        <Link
          href="/conversations"
          className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          Conversations
        </Link>
        <Link
          href="/search"
          className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          Search
        </Link>
        <Link
          href="/patterns"
          className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          Patterns
        </Link>
      </div>
    </nav>
  );
}
