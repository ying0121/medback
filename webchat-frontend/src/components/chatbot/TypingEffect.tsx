import { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface TypingEffectProps {
  // Full text to progressively reveal.
  text: string;
  // Delay between characters (ms). Lower = faster typing animation.
  speed?: number;
  // Optional lifecycle callback fired once typing completes.
  onComplete?: () => void;
  // Optional callback fired every character tick (used for auto-scroll).
  onTick?: () => void;
}

// Simulates "AI is typing" by progressively revealing characters
// and showing a blinking caret while the animation is active.
const TypingEffect = ({ text, speed = 18, onComplete, onTick }: TypingEffectProps) => {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Reset animation whenever the input text changes.
    setDisplayed("");
    setDone(false);
    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
        onTick?.();
      } else {
        clearInterval(interval);
        setDone(true);
        onComplete?.();
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed, onComplete]);

  return (
    <span className="block whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
      {displayed}
      {!done && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity }}
          className="inline-block w-0.5 h-4 bg-primary ml-0.5 align-text-bottom"
        />
      )}
    </span>
  );
};

export default TypingEffect;
