import { motion, AnimatePresence } from "framer-motion";
import ClinicAvatar from "./ClinicAvatar";
import ConnectionStatusBadge from "./ConnectionStatusBadge";

interface ChatBubbleProps {
  // Whether the expanded chat panel is currently visible.
  isOpen: boolean;
  // Click handler provided by parent to open/close the chatbot.
  onClick: () => void;
  // Mirrors websocket connectivity while chat is collapsed.
  connectionStatus: "connecting" | "connected" | "disconnected";
  avatarUrl?: string | null;
}

// Floating launcher button shown at the bottom-right of the page.
// It doubles as:
// - open trigger (bot avatar)
// - close trigger (X icon)
// and includes supporting attention animations.
const ChatBubble = ({ isOpen, onClick, connectionStatus, avatarUrl }: ChatBubbleProps) => {
  return (
    <div className="fixed bottom-24 right-6 z-[2147483647]">
      {/* Pulse rings */}
      <AnimatePresence>
        {!isOpen && (
          <>
            <motion.div
              className="absolute inset-0 rounded-full bg-primary"
              initial={{ scale: 1, opacity: 0.4 }}
              animate={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
            />
            <motion.div
              className="absolute inset-0 rounded-full bg-primary"
              initial={{ scale: 1, opacity: 0.3 }}
              animate={{ scale: 1.4, opacity: 0 }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
            />
          </>
        )}
      </AnimatePresence>

      <motion.button
        onClick={onClick}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className="relative w-14 h-14 rounded-full bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/30 flex items-center justify-center"
      >
        {/* Icon swaps based on open state for clearer affordance. */}
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.svg
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2 }}
              width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-primary-foreground"
            >
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            </motion.svg>
          ) : (
            <motion.div
              key="chat"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", stiffness: 400 }}
              className="overflow-hidden rounded-full"
            >
              <ClinicAvatar src={avatarUrl} size="bubble" imgClassName="object-contain bg-card" />
            </motion.div>
          )}
        </AnimatePresence>

        {!isOpen && (
          <ConnectionStatusBadge
            status={connectionStatus}
            size="md"
            className="absolute -top-1 -right-1"
          />
        )}
      </motion.button>
    </div>
  );
};

export default ChatBubble;
