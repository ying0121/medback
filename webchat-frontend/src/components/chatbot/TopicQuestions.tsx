import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Topic } from "./topicsData";

interface TopicQuestionsProps {
  // Topic selected in TopicSelector; defines icon/title/question list.
  topic: Topic;
  // Called when all question steps are answered.
  onComplete: (answers: Record<number, string>) => void;
  // Returns to topic list view when user exits at step 0.
  onBack: () => void;
}

// Multi-step questionnaire tied to a selected topic.
// Each step can be either:
// - predefined options (buttons), or
// - free-text answer (input field).
const TopicQuestions = ({ topic, onComplete, onBack }: TopicQuestionsProps) => {
  // Zero-based index into topic.questions.
  const [currentStep, setCurrentStep] = useState(0);
  // Stores collected answers keyed by step index.
  const [answers, setAnswers] = useState<Record<number, string>>({});
  // Controlled input value for text-entry steps.
  const [textInput, setTextInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const question = topic.questions[currentStep];
  const isLastStep = currentStep === topic.questions.length - 1;

  useEffect(() => {
    // Auto-focus text field to streamline keyboard-only completion.
    if (!question.options && inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentStep, question.options]);

  const advance = (answer: string) => {
    // Persist answer for current step before moving forward.
    const newAnswers = { ...answers, [currentStep]: answer };
    setAnswers(newAnswers);
    setTextInput("");

    if (isLastStep) {
      onComplete(newAnswers);
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleSelectOption = (opt: string) => advance(opt);

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    advance(textInput.trim());
  };

  const handleBack = () => {
    // Go to previous step when possible; otherwise return to topic list.
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
      setTextInput("");
    } else {
      onBack();
    }
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-center mb-3">
        <motion.button
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={handleBack}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          {currentStep > 0 ? "Previous question" : "All topics"}
        </motion.button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 mb-2"
      >
        <span className="text-lg">{topic.icon}</span>
        <h4 className="text-sm font-semibold text-foreground font-display">{topic.title}</h4>
      </motion.div>

      {/* Progress indicator */}
      <div className="flex gap-1 mb-3">
        {topic.questions.map((_, i) => (
          <motion.div
            key={i}
            className={`h-1.5 rounded-full flex-1 transition-colors duration-300 ${
              i <= currentStep ? "bg-primary" : "bg-muted"
            }`}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: i * 0.05 }}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
        >
          {/* Current question prompt for the active step. */}
          <p className="text-xs text-muted-foreground mb-3">{question.text}</p>
          {question.options ? (
            <div className="flex flex-wrap gap-1.5">
              {question.options.map((opt) => (
                <motion.button
                  key={opt}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleSelectOption(opt)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 hover:border-primary/40 transition-all"
                >
                  {opt}
                </motion.button>
              ))}
            </div>
          ) : (
            <motion.form
              onSubmit={handleTextSubmit}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type your answer..."
                className="flex-1 bg-muted rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
              <motion.button
                type="submit"
                disabled={!textInput.trim()}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-8 h-8 rounded-lg bg-gradient-to-r from-primary to-accent flex items-center justify-center disabled:opacity-50 transition-opacity"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-primary-foreground">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </motion.button>
            </motion.form>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default TopicQuestions;
