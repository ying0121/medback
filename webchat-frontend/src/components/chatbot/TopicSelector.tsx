import { motion } from "framer-motion";
import { topics, type Topic } from "./topicsData";

interface TopicSelectorProps {
  // Called when user chooses one of the predefined support topics.
  onSelectTopic: (topic: Topic) => void;
}

// Presents quick-start topic cards to guide users before free-text chat.
// This helps reduce typing effort and standardizes common requests.
const TopicSelector = ({ onSelectTopic }: TopicSelectorProps) => {
  return (
    <div className="px-4 py-3">
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-xs font-medium text-muted-foreground mb-3"
      >
        How can I help you today? Choose a topic:
      </motion.p>

      {/* Responsive two-column card layout for available topic shortcuts. */}
      <div className="grid grid-cols-2 gap-2">
        {topics.map((topic, i) => (
          <motion.button
            key={topic.id}
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: i * 0.06, type: "spring", stiffness: 300, damping: 24 }}
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => onSelectTopic(topic)}
            className="flex items-center gap-2.5 px-3 py-3 rounded-xl bg-secondary/60 border border-border hover:border-primary/40 hover:bg-secondary transition-colors text-left group"
          >
            <span className="text-lg flex-shrink-0">{topic.icon}</span>
            <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors leading-tight">
              {topic.title}
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export default TopicSelector;
