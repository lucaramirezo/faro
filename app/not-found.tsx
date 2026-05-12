import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 space-y-3">
      <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-sm text-muted-foreground">The route you requested does not exist.</p>
      <Link
        href="/home"
        className="inline-flex text-sm text-foreground underline-offset-4 hover:underline"
      >
        Back to Home
      </Link>
    </div>
  );
}
