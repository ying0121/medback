import { useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

interface MarqueeTextProps {
  text: string;
  className?: string;
}

const MarqueeText = ({ text, className = "" }: MarqueeTextProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [cycleWidth, setCycleWidth] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const textEl = measureRef.current;
    if (!container || !textEl) return;

    const measure = () => {
      const overflow = Math.max(0, textEl.scrollWidth - container.clientWidth);
      setShouldScroll(overflow > 1);
      setCycleWidth(textEl.scrollWidth + 32);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    ro.observe(textEl);
    return () => ro.disconnect();
  }, [text]);

  const scrollDuration = Math.max(6, cycleWidth / 28);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden min-w-0 w-full ${className}`}
      title={text}
    >
      <span
        ref={measureRef}
        className="invisible absolute left-0 top-0 whitespace-nowrap pointer-events-none"
        aria-hidden="true"
      >
        {text}
      </span>
      {shouldScroll ? (
        <motion.div
          className="flex w-max whitespace-nowrap"
          animate={{ x: [0, -cycleWidth] }}
          transition={{
            duration: scrollDuration,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          <span className="pr-8">{text}</span>
          <span className="pr-8" aria-hidden="true">{text}</span>
        </motion.div>
      ) : (
        <span className="inline-block whitespace-nowrap">{text}</span>
      )}
    </div>
  );
};

export default MarqueeText;
