import { useMemo, type ReactNode } from "react";
import { ExternalLink, HelpCircle, Lightbulb, MapPin, Sparkles } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

export type CredentialHelpContent = {
  eyebrow: string;
  title: string;
  summary: string;
  where: string;
  looksLike?: string;
  tip?: string;
  link?: { href: string; label: string };
};

type Props = {
  content: CredentialHelpContent;
  label?: string;
  className?: string;
  /** Whole field (label + ? + input) as the hover target. */
  children: ReactNode;
};

function helpCardWidth(content: CredentialHelpContent) {
  const len =
    content.summary.length +
    content.where.length +
    (content.tip?.length || 0) +
    (content.looksLike?.length || 0);
  if (len > 280) return 560;
  if (len > 180) return 500;
  return 440;
}

function HelpCard({ content }: { content: CredentialHelpContent }) {
  return (
    <div>
      <div className="relative overflow-hidden border-b border-border/70 bg-gradient-to-br from-primary/[0.08] via-sky-500/[0.05] to-transparent px-4 py-3.5">
        <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-primary/15 blur-2xl" />
        <div className="relative flex items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/95 shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </span>
          <div className="min-w-0 pt-0.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {content.eyebrow}
            </div>
            <div className="mt-0.5 text-[15px] font-semibold leading-snug tracking-tight text-foreground">
              {content.title}
            </div>
          </div>
        </div>
        <p className="relative mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
          {content.summary}
        </p>
      </div>

      <div className="space-y-3 px-4 py-3.5">
        <div className="flex gap-2.5">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-500/10 text-sky-700">
            <MapPin className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Where to find it
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-foreground/90">{content.where}</p>
          </div>
        </div>

        {content.looksLike ? (
          <div className="rounded-xl border border-dashed border-border/80 bg-muted/35 px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Looks like
            </div>
            <code className="mt-1 block break-all font-mono text-[12px] font-medium text-foreground">
              {content.looksLike}
            </code>
          </div>
        ) : null}

        {content.tip ? (
          <div className="flex gap-2.5 rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.07] to-transparent px-3 py-2.5">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            <p className="text-[12px] leading-relaxed text-muted-foreground">{content.tip}</p>
          </div>
        ) : null}

        {content.link ? (
          <a
            href={content.link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-primary/20 bg-primary/[0.06] px-3 py-2 text-[12.5px] font-medium text-primary transition-colors hover:bg-primary/10"
            onClick={(e) => e.stopPropagation()}
          >
            {content.link.label}
            <ExternalLink className="h-3.5 w-3.5 opacity-70" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Hover popover for credential help.
 * Opens on the whole field; stays open on the card so links are clickable;
 * closes when the pointer leaves both.
 */
export default function CredentialHelpTooltip({
  content,
  label = "How to get this",
  className,
  children,
}: Props) {
  const width = useMemo(() => helpCardWidth(content), [content]);

  return (
    <HoverCard openDelay={120} closeDelay={200}>
      <HoverCardTrigger asChild>
        <div className={cn("w-full", className)} aria-label={label}>
          {children}
        </div>
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={10}
        collisionPadding={24}
        className="z-[200] overflow-visible rounded-2xl border-border/80 bg-popover p-0 text-popover-foreground shadow-elegant"
        style={{ width }}
      >
        <HelpCard content={content} />
      </HoverCardContent>
    </HoverCard>
  );
}

export function CredentialHelpIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/80",
        className
      )}
      aria-hidden
    >
      <HelpCircle className="h-3.5 w-3.5" />
    </span>
  );
}

export function CredentialGuideHelpLabel({
  content,
  title,
  className,
}: {
  content: CredentialHelpContent;
  title: string;
  className?: string;
}) {
  return (
    <CredentialHelpTooltip content={content} label="About this guide" className={className}>
      <span
        className="inline-flex w-fit max-w-full items-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="inline w-fit text-sm font-medium text-foreground">{title}</span>
        <CredentialHelpIcon />
      </span>
    </CredentialHelpTooltip>
  );
}
