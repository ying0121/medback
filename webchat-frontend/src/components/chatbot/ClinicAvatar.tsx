import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getClinicAvatarDisplayUrl, getDefaultClinicAvatarUrl } from "@/lib/clinicAvatar";

const SIZE_CLASS = {
  sm: "w-7 h-7",
  md: "w-8 h-8",
  lg: "w-10 h-10",
  bubble: "w-9 h-9",
} as const;

export type ClinicAvatarSize = keyof typeof SIZE_CLASS;

interface ClinicAvatarProps {
  /** Resolved clinic avatar from backend; falls back to default bot image. */
  src?: string | null;
  size?: ClinicAvatarSize;
  className?: string;
  imgClassName?: string;
  alt?: string;
  /** When true, keeps the themed gradient ring behind the image (header style). */
  withGradientRing?: boolean;
}

const ClinicAvatar = ({
  src,
  size = "lg",
  className,
  imgClassName,
  alt = "Clinic assistant",
  withGradientRing = false,
}: ClinicAvatarProps) => {
  const targetSrc = getClinicAvatarDisplayUrl(src);
  const [displaySrc, setDisplaySrc] = useState(targetSrc);

  useEffect(() => {
    setDisplaySrc(targetSrc);
  }, [targetSrc]);

  const fallbackSrc = getDefaultClinicAvatarUrl();

  const image = (
    <img
      src={displaySrc}
      alt={alt}
      className={cn("rounded-full object-cover", SIZE_CLASS[size], imgClassName)}
      onError={() => setDisplaySrc(fallbackSrc)}
    />
  );

  if (withGradientRing) {
    return (
      <div
        className={cn(
          "rounded-full bg-gradient-to-br from-primary to-accent p-0.5 flex items-center justify-center flex-shrink-0",
          SIZE_CLASS[size],
          className,
        )}
      >
        <img
          src={displaySrc}
          alt={alt}
          className={cn("w-full h-full rounded-full object-cover", imgClassName)}
          onError={() => setDisplaySrc(fallbackSrc)}
        />
      </div>
    );
  }

  return <div className={cn("flex-shrink-0", className)}>{image}</div>;
};

export default ClinicAvatar;
