import { useState } from "react";
import ChatBubble from "./ChatBubble";
import ChatWindow from "./ChatWindow";

// HealthChatbot is the root orchestrator for the chatbot UI.
// It owns the single source of truth for "open vs closed" state,
// then delegates presentation to:
// - ChatBubble: floating launcher/close button
// - ChatWindow: full interactive chat panel
const HealthChatbot = () => {
  // Controls whether the full chat window is visible on screen.
  const [isOpen, setIsOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [clinicAvatarUrl, setClinicAvatarUrl] = useState<string | null>(null);

  return (
    <>
      {/* Keep ChatWindow mounted so websocket/session persist across closes. */}
      <ChatWindow
        isOpen={isOpen}
        onConnectionStatusChange={setConnectionStatus}
        onClinicAvatarUrlChange={setClinicAvatarUrl}
      />

      {/* Bubble remains mounted and toggles the chat panel visibility. */}
      <ChatBubble
        isOpen={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        connectionStatus={connectionStatus}
        avatarUrl={clinicAvatarUrl}
      />
    </>
  );
};

export default HealthChatbot;
