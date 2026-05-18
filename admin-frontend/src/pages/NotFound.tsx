import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Compass } from "lucide-react";

export default function NotFound() {
  const location = useLocation();

  useEffect(() => {
    // Keep this log in non-production to help trace unexpected links quickly.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn("[Admin][404] route not found:", location.pathname);
    }
  }, [location.pathname]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-hero">
      <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 animate-pulse rounded-full bg-accent/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-12 h-80 w-80 animate-pulse rounded-full bg-primary/20 blur-3xl [animation-delay:900ms]" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[28rem] w-[28rem] rounded-full border border-primary/10 animate-[spin_24s_linear_infinite]" />
        <div className="absolute h-[20rem] w-[20rem] rounded-full border border-accent/20 animate-[spin_16s_linear_infinite_reverse]" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-16">
        <div className="w-full max-w-3xl rounded-3xl border bg-card/90 p-8 shadow-elegant backdrop-blur md:p-12">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent-foreground">
            <Compass className="h-3.5 w-3.5" />
            Route not found
          </div>

          <div className="mb-6">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary/80">Error 404</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-foreground md:text-5xl">
              This page took a wrong turn.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              The page you requested does not exist in the Admin Console. It may have been moved, renamed, or the URL might be incomplete.
            </p>
          </div>

          <div className="mb-8 rounded-xl border bg-secondary/40 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Requested path</div>
            <code className="mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-background px-3 py-2 text-sm text-foreground">
              /admin{location.pathname}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
