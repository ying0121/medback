import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useChatTheme } from "@/contexts/ChatThemeContext";

const ColorModeToggle = () => {
  const { colorMode, toggleColorMode } = useChatTheme();
  const isDark = colorMode === "dark";

  return (
    <motion.button
      type="button"
      onClick={toggleColorMode}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className="w-8 h-8 rounded-full border border-border/80 bg-muted/60 text-foreground flex items-center justify-center hover:border-primary/40 hover:bg-primary/10 transition-colors"
    >
      {isDark ? <Sun className="h-4 w-4 text-primary" /> : <Moon className="h-4 w-4 text-primary" />}
    </motion.button>
  );
};

export default ColorModeToggle;
