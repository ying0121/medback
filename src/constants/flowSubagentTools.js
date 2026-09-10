/**
 * Subagent tools available on conversation-flow nodes.
 * These are backend actions (not just AI replies).
 */

const FLOW_SUBAGENT_TOOLS = [
  {
    id: "book_appointment",
    name: "Book appointment",
    description: "Schedule a patient visit using clinic calendar / EHR.",
    category: "appointments"
  },
  {
    id: "cancel_appointment",
    name: "Cancel appointment",
    description: "Cancel an existing appointment for the patient.",
    category: "appointments"
  },
  {
    id: "reschedule_appointment",
    name: "Reschedule appointment",
    description: "Move an appointment to a new date/time.",
    category: "appointments"
  },
  {
    id: "send_appointment_reminder",
    name: "Send appointment reminder",
    description: "Notify the patient about an upcoming appointment.",
    category: "appointments"
  },
  {
    id: "send_voicemail",
    name: "Send voicemail",
    description: "Drop a voicemail message to the patient phone number.",
    category: "messaging"
  },
  {
    id: "send_sms",
    name: "Send text message",
    description: "Send an SMS / text message to the patient.",
    category: "messaging"
  },
  {
    id: "send_email",
    name: "Send email",
    description: "Send an email to the patient.",
    category: "messaging"
  },
  {
    id: "transfer_to_human",
    name: "Transfer to human",
    description: "Hand the call off to a clinic staff member / queue.",
    category: "call"
  },
  {
    id: "collect_payment",
    name: "Collect payment",
    description: "Start a billing / payment collection step.",
    category: "billing"
  },
  {
    id: "update_patient_info",
    name: "Update patient info",
    description: "Save updated patient contact or demographic details.",
    category: "patient"
  }
];

function getFlowSubagentTool(toolId) {
  return FLOW_SUBAGENT_TOOLS.find((t) => t.id === String(toolId || "")) || null;
}

function listFlowSubagentTools() {
  return FLOW_SUBAGENT_TOOLS.map((t) => ({ ...t }));
}

module.exports = {
  FLOW_SUBAGENT_TOOLS,
  getFlowSubagentTool,
  listFlowSubagentTools
};
