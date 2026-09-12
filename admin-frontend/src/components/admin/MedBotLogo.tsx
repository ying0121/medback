import { cn } from "@/lib/utils";
import markUrl from "@/assets/bot-logo.png";

type MedBotLogoProps = {
  size?: number;
  className?: string;
  alt?: string;
};

/** MedBot app mark for sidebar, login, and brand chrome. */
export default function MedBotLogo({
  size = 40,
  className,
  alt = "MedBot",
}: MedBotLogoProps) {
  return (
    <img
      src={markUrl}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      className={cn("select-none object-contain", className)}
    />
  );
}
