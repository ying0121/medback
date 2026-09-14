import { cn } from "@/lib/utils";
import markUrl from "@/assets/bot-logo.png";

type MedicalBotConsoleLogoProps = {
  size?: number;
  className?: string;
  alt?: string;
};

/** Medical Bot Console app mark for sidebar, login, and brand chrome. */
export default function MedicalBotConsoleLogo({
  size = 40,
  className,
  alt = "Medical Bot Console",
}: MedicalBotConsoleLogoProps) {
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
