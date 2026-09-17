import { cn } from "@/lib/utils";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

const STATUS_CONFIG: Record<
  ConnectionStatus,
  { className: string; borderColor: string; boxShadow: string }
> = {
  connected: {
    className: "bg-emerald-400",
    borderColor: "#6ee7b7",
    boxShadow: "0 0 10px rgba(16,185,129,0.7)",
  },
  connecting: {
    className: "bg-amber-400",
    borderColor: "#fcd34d",
    boxShadow: "0 0 10px rgba(251,191,36,0.7)",
  },
  disconnected: {
    className: "bg-rose-500",
    borderColor: "#fca5a5",
    boxShadow: "0 0 10px rgba(244,63,94,0.7)",
  },
};

const SIZE_CLASS = {
  sm: "w-3 h-3",
  md: "w-4 h-4",
} as const;

interface ConnectionStatusBadgeProps {
  status: ConnectionStatus;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}

const ConnectionStatusBadge = ({
  status,
  size = "md",
  className,
}: ConnectionStatusBadgeProps) => {
  const config = STATUS_CONFIG[status];

  return (
    <span
      aria-hidden
      className={cn(
        "block shrink-0 rounded-full border-2",
        SIZE_CLASS[size],
        config.className,
        status === "connecting" && "animate-pulse",
        className,
      )}
      style={{ borderColor: config.borderColor, boxShadow: config.boxShadow }}
    />
  );
};

export default ConnectionStatusBadge;
