import { motion } from "framer-motion";
import ClinicAvatar from "./ClinicAvatar";

interface TypingIndicatorProps {
  assistantAvatarUrl?: string | null;
}

// Lightweight skeleton row shown while waiting for backend response.
const TypingIndicator = ({ assistantAvatarUrl }: TypingIndicatorProps) => {
  return (
    <div className="flex items-start gap-3 px-4 py-2">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
        <ClinicAvatar src={assistantAvatarUrl} size="md" />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-chat-bot rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5"
      >
        {/* Three staggered dots create a familiar "typing" motion pattern. */}
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-2 h-2 rounded-full bg-primary"
            animate={{
              y: [0, -8, 0],
              opacity: [0.4, 1, 0.4],
            }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut",
            }}
          />
        ))}
      </motion.div>
    </div>
  );
};

export default TypingIndicator;
