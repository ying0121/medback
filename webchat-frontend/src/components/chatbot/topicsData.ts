// Shared topic/question schema for guided chatbot intake flows.
// A topic is rendered as a card, then expanded into step-by-step prompts.
export interface TopicQuestion {
  // Prompt shown to the user for this step.
  text: string;
  // Optional multiple-choice answers; if omitted, a text input is used.
  options?: string[];
}

export interface Topic {
  // Stable identifier for rendering and business logic.
  id: string;
  // Emoji icon shown in topic card and question header.
  icon: string;
  // Human-readable topic title.
  title: string;
  // Ordered questionnaire for this topic.
  questions: TopicQuestion[];
}

// Curated starter intents tailored to common clinic workflows.
export const topics: Topic[] = [
  {
    id: "appointment",
    icon: "📅",
    title: "Appointment Request",
    questions: [
      { text: "Would you like to request a new appointment?" },
      { text: "What kind of appointment do you need?", options: ["New Visit", "Follow-Up", "Physical Exam", "Consultation"] },
      { text: "Please share your preferred date and time." },
    ],
  },
  {
    id: "medication",
    icon: "💊",
    title: "Medication Request",
    questions: [
      { text: "Are you requesting a new medication or a medication refill?", options: ["New Medication", "Medication Refill"] },
      { text: "Please enter the medication name and your pharmacy details." },
    ],
  },
  {
    id: "prescription",
    icon: "📋",
    title: "Prescription Refill",
    questions: [
      { text: "Which medication would you like to refill?" },
      { text: "Has your pharmacy information changed?", options: ["Yes", "No"] },
    ],
  },
  {
    id: "referral",
    icon: "🔗",
    title: "Referral Request",
    questions: [
      { text: "Do you need a referral to a specialist?", options: ["Yes", "No"] },
      { text: "Please tell us the specialist type and any urgency." },
    ],
  },
  {
    id: "test-results",
    icon: "🧪",
    title: "Test Results",
    questions: [
      { text: "Are you asking about blood work, imaging, or another test?", options: ["Blood Work", "Imaging", "Other"] },
      { text: "Please share the date of the test or the name of the provider." },
    ],
  },
  {
    id: "letter",
    icon: "✉️",
    title: "Letter Request",
    questions: [
      { text: "What type of letter do you need?", options: ["Return to Work", "School Note", "Medical Clearance", "Other"] },
      { text: "Please provide any details you'd like included." },
    ],
  },
  {
    id: "clinic",
    icon: "📍",
    title: "Clinic Location",
    questions: [
      { text: "Our clinic is located at 123 Health Ave, Suite 200, Medical City, ST 12345." },
      { text: "Would you like driving directions?", options: ["Yes", "No"] },
    ],
  },
  {
    id: "insurance",
    icon: "🛡️",
    title: "Accepted Insurances",
    questions: [
      { text: "We accept the following insurance plans: Aetna, Blue Cross Blue Shield, Cigna, UnitedHealthcare, Medicare, and Medicaid." },
      { text: "Would you like help verifying if your plan is accepted?", options: ["Yes", "No"] },
    ],
  },
];
