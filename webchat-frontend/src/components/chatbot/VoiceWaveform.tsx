import { motion } from "framer-motion";

interface VoiceWaveformProps {
  // True while mic capture mode is active.
  isActive: boolean;
  // Number of visual bars to render in the waveform strip.
  barCount?: number;
  // Real-time amplitude samples mapped to each bar.
  levels?: number[];
}

// Decorative waveform visualization for voice-input mode.
// Uses live analyser levels when available.
const VoiceWaveform = ({ isActive, barCount = 32, levels = [] }: VoiceWaveformProps) => {
  return (
    <div className="flex items-center justify-center gap-[3px] h-18">
      {Array.from({ length: barCount }).map((_, i) => (
        <motion.div
          key={i}
          className="w-1 rounded-full bg-gradient-to-t from-primary to-accent"
          animate={
            isActive
              ? {
                  height: Math.max(7, (levels[i] ?? 0) * 40),
                }
              : { height: 5 }
          }
          transition={
            isActive
              ? {
                  duration: 0.08,
                  ease: "easeOut",
                }
              : { duration: 0.3 }
          }
        />
      ))}
    </div>
  );
};

export default VoiceWaveform;
