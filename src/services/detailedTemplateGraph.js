/**
 * Expand compact template graphSpecs into detailed medical conversation brains
 * with ~18–22 nodes (start/end included) and thorough prompts.
 */

const { buildAgentGraph, normalizeGraph } = require("./agentGraphBuilder");
const { getFlowSubagentTool } = require("../constants/flowSubagentTools");
const { getAgentType } = require("../constants/agentTypes");

function toolStep(toolId, label) {
  const tool = getFlowSubagentTool(toolId);
  return {
    type: "tool",
    toolId,
    label: label || tool?.name || toolId
  };
}

function msg(label, prompt) {
  return { type: "message", label, prompt };
}

function q(label, prompt, options) {
  return { type: "question", label, prompt, options };
}

/**
 * Build a rich graphSpec (≥15 conversation steps) for any catalog template.
 */
function buildDetailedGraphSpec(template) {
  const typeId = String(template?.typeId || "receptionist");
  const type = getAgentType(typeId);
  const name = String(template?.name || type?.name || "Clinic assistant").trim();
  const summary = String(template?.summary || type?.shortDescription || "").trim();
  const description = String(template?.description || type?.longDescription || "").trim();
  const tools = Array.isArray(template?.defaultTools) ? template.defaultTools.map(String) : [];
  const existing = template?.graphSpec && typeof template.graphSpec === "object" ? template.graphSpec : {};
  const existingSteps = Array.isArray(existing.steps) ? existing.steps : [];

  const greeting =
    String(existing.greeting || "").trim() ||
    `Thank you for contacting the medical clinic. I'm the ${name} assistant helping patients and caregivers. ${summary || "How can I help with your care today?"}`;

  const closing =
    String(existing.closing || "").trim() ||
    `Thank you for trusting our clinic with your care. If symptoms worsen or this becomes an emergency, call emergency services. Goodbye.`;

  const primaryTool = tools.find((id) => id !== "transfer_to_human") || tools[0] || null;
  const secondaryTools = tools.filter((id) => id !== primaryTool && id !== "transfer_to_human").slice(0, 2);

  /** Core spine — always patient/medicine scoped */
  const spine = [
    msg(
      "Medical role & scope",
      `You are the “${name}” medical clinic agent for patients and caregivers. Purpose: ${summary || description.slice(0, 180) || "support outpatient patient care"}. Stay within medicine and patient support. Do not diagnose, prescribe, change medication doses, or invent lab interpretations. Emergencies (chest pain, trouble breathing, severe bleeding, stroke signs, suicidal thoughts): direct to emergency services / ER and warm-transfer if possible.`
    ),
    q(
      "Verify patient relationship",
      "For patient privacy, who am I speaking with — the patient, a parent/guardian, or another authorized caregiver?",
      ["I am the patient", "Parent or guardian", "Authorized caregiver", "Prefer not to say"]
    ),
    msg(
      "HIPAA & privacy",
      "Confirm HIPAA-aware handling: only collect what is needed for this patient request, do not share PHI outside the care team, and offer a human clinician/staff member anytime."
    ),
    q(
      "Language check",
      "Are you comfortable continuing in English for this patient care conversation, or do you need another language or a person?",
      ["Continue in English", "Need another language", "Transfer to a person"]
    ),
    msg(
      "Patient need",
      `Acknowledge the caller and restate that this is a medical clinic conversation for “${name}”. Ask what the patient needs help with today related to: ${summary || name}.`
    ),
    q(
      "Main patient intent",
      existingSteps.find((s) => s.type === "question")?.prompt ||
        `What does the patient need help with regarding ${name}?`,
      existingSteps.find((s) => s.type === "question")?.options?.length
        ? existingSteps.find((s) => s.type === "question").options
        : ["Primary care request", "Status check", "Something else", "Speak to clinical staff"]
    ),
    msg(
      "Clinical clarifying details",
      "Ask 2–3 short clarifying questions needed for this patient workflow (visit type, dates, symptoms at a high level, pharmacy, caregiver relationship). Do not demand full SSN on the call."
    ),
    msg(
      "Patient guidance",
      `Using clinic medical knowledge for “${name}”, give clear next steps for the patient/caregiver: what happens next, timing, and documents to bring. Keep a warm clinical tone.`
    ),
    q(
      "Confirm understanding",
      "Does that answer the patient's question, or should we adjust before taking an action?",
      ["Yes, that helps", "Need more detail", "Change my request", "Transfer to clinical staff"]
    )
  ];

  /** Insert original template steps with wrapping detail messages */
  const expandedOriginal = [];
  for (const step of existingSteps) {
    if (!step || typeof step !== "object") continue;
    if (step.type === "question" && expandedOriginal.length === 0) {
      // already covered by Main intent — skip duplicate first question
      continue;
    }
    if (step.type === "message") {
      expandedOriginal.push(
        msg(
          step.label || "Guidance",
          step.prompt ||
            `Provide detailed guidance for the “${name}” workflow. Be specific about clinic process, timing, and what the caller should do next.`
        )
      );
      continue;
    }
    if (step.type === "tool") {
      const toolId = String(step.toolId || "").trim();
      const tool = getFlowSubagentTool(toolId);
      expandedOriginal.push(
        msg(
          `Prepare: ${step.label || tool?.name || toolId}`,
          `Before running ${tool?.name || toolId}, confirm you have the minimum required details, read back the key facts to the caller, and get verbal go-ahead.`
        )
      );
      expandedOriginal.push(toolStep(toolId, step.label));
      expandedOriginal.push(
        msg(
          `Confirm: ${step.label || tool?.name || toolId}`,
          `Confirm the result of ${tool?.name || toolId} in plain language (success, pending, or needs staff). Tell the caller what to expect next (confirmation SMS/email, callback window, portal update).`
        )
      );
      continue;
    }
    if (step.type === "branch") {
      expandedOriginal.push({
        type: "branch",
        label: step.label || "Path",
        branches: step.branches || ["Continue", "Alternate path", "Escalate"]
      });
      continue;
    }
    if (step.type === "question") {
      expandedOriginal.push(
        q(
          step.label || "Follow-up question",
          step.prompt || "Which option fits best?",
          step.options?.length ? step.options : ["Yes", "No", "Not sure"]
        )
      );
    }
  }

  /** Ensure tools from defaultTools appear if not already in expandedOriginal */
  const usedTools = new Set(
    expandedOriginal.filter((s) => s.type === "tool").map((s) => s.toolId)
  );
  const toolBlock = [];
  if (primaryTool && !usedTools.has(primaryTool)) {
    const tool = getFlowSubagentTool(primaryTool);
    toolBlock.push(
      msg(
        `Prepare ${tool?.name || primaryTool}`,
        `Collect or confirm any missing fields required for ${tool?.name || primaryTool}. Summarize the action you are about to take for “${name}”.`
      ),
      toolStep(primaryTool),
      msg(
        `After ${tool?.name || primaryTool}`,
        `Explain the outcome clearly and what the caller should do if they do not receive a confirmation within the expected window.`
      )
    );
    usedTools.add(primaryTool);
  }
  for (const toolId of secondaryTools) {
    if (usedTools.has(toolId)) continue;
    const tool = getFlowSubagentTool(toolId);
    toolBlock.push(
      q(
        `Also ${tool?.name || toolId}?`,
        `Would you also like me to ${String(tool?.description || tool?.name || toolId).toLowerCase()}?`,
        ["Yes, please", "No thanks", "Ask me later"]
      ),
      toolStep(toolId),
      msg(
        `${tool?.name || toolId} follow-through`,
        `Confirm whether that step completed and offer a brief next action.`
      )
    );
    usedTools.add(toolId);
  }

  const wrapUp = [
    q(
      "Anything else",
      "Is there anything else I can help with on this call related to the clinic?",
      ["Yes, another question", "No, I'm done", "Transfer to a person"]
    ),
    msg(
      "Offer channels",
      "If helpful, mention the patient portal, callback options, or that you can text/email a summary when clinic tools allow. Keep it optional and consent-based."
    ),
    q(
      "Human handoff",
      "Would you like me to connect you with a staff member now?",
      ["Yes, transfer me", "No, finish here"]
    ),
    toolStep("transfer_to_human", "Transfer to staff"),
    msg(
      "Safety reminder",
      "Remind the caller: for life-threatening symptoms they should call emergency services. For non-urgent clinical questions, nursing/clinical staff will follow clinic protocol."
    )
  ];

  // Assemble and pad to ensure enough steps for ≥15–20 nodes after build
  let steps = [...spine, ...expandedOriginal, ...toolBlock, ...wrapUp];

  // Type-specific enrichment mid-flow
  const typeExtra = typeSpecificSteps(typeId, name, summary);
  if (typeExtra.length) {
    // Insert after clarify details (index ~6 in spine)
    steps = [...spine.slice(0, 7), ...typeExtra, ...spine.slice(7), ...expandedOriginal, ...toolBlock, ...wrapUp];
  }

  // Deduplicate consecutive identical tool ids
  const deduped = [];
  for (const step of steps) {
    const prev = deduped[deduped.length - 1];
    if (
      prev &&
      prev.type === "tool" &&
      step.type === "tool" &&
      prev.toolId === step.toolId
    ) {
      continue;
    }
    deduped.push(step);
  }

  return { greeting, steps: deduped, closing };
}

function typeSpecificSteps(typeId, name, summary) {
  switch (typeId) {
    case "receptionist":
      return [
        q(
          "Patient front-desk topic",
          "Is this about clinic hours/directions, insurance acceptance for medical visits, which providers see patients, wait times, or another front-desk question?",
          ["Hours or directions", "Insurance FAQ", "Providers", "Wait times", "Other"]
        ),
        msg(
          "Clinic policy details",
          `Share accurate medical clinic policy for “${name}”: hours, holiday closures, parking for patients, and when staff must verify information in person. Never invent clinical advice.`
        )
      ];
    case "scheduler":
      return [
        q(
          "Patient visit type",
          "What kind of medical visit does the patient need — new patient exam, follow-up, same-day sick visit, telehealth, or something else?",
          ["New patient", "Follow-up", "Same-day", "Telehealth", "Other"]
        ),
        msg(
          "Clinical scheduling rules",
          "Explain medical scheduling rules: lead time, cancellation window, what to bring to the visit, and that slots depend on provider calendars and clinic hours."
        ),
        q(
          "Preferred visit timing",
          "Does the patient prefer morning, afternoon, or the soonest available medical appointment?",
          ["Morning", "Afternoon", "Soonest available", "Specific date"]
        )
      ];
    case "intake":
      return [
        msg(
          "Patient intake roadmap",
          `Explain that “${name}” will walk the patient through demographics, medical insurance, medications/allergies, and consents one section at a time. The patient or caregiver can pause or transfer anytime.`
        ),
        q(
          "Intake section",
          "Which patient intake section should we start with?",
          ["Demographics", "Insurance", "Medications & allergies", "Consents", "All of the above"]
        ),
        msg(
          "Chart accuracy check",
          "Read back key patient intake fields and ask them to correct anything before saving to the medical chart context."
        )
      ];
    case "triage":
      return [
        msg(
          "Clinical triage disclaimer",
          "State clearly: this is patient symptom screening for urgency — not a diagnosis and not an ER substitute. Emergencies → call emergency services immediately."
        ),
        q(
          "Patient red-flag screen",
          "Is the patient having chest pain, severe shortness of breath, uncontrolled bleeding, stroke symptoms, or thoughts of self-harm right now?",
          ["Yes — emergency now", "No", "Not sure"]
        ),
        msg(
          "Symptom timeline",
          "Ask when patient symptoms started, severity (mild/moderate/severe), fever if any, and whether they are worsening. Document for clinical staff."
        ),
        q(
          "Urgency path",
          "Based on what you shared, should we treat this as urgent same-day clinical review, routine medical follow-up, or home monitoring with nurse escalation if needed?",
          ["Urgent same-day", "Routine follow-up", "Home monitoring", "Transfer to nurse"]
        )
      ];
    case "billing":
      return [
        q(
          "Patient billing topic",
          "Is this about a patient medical balance, statement, insurance denial, estimate/copay, payment plan, or refund?",
          ["Balance", "Statement", "Denial", "Estimate/copay", "Payment plan", "Refund"]
        ),
        msg(
          "Medical billing caution",
          "Do not guess exact patient balances. If account data is unavailable, explain how to verify on the statement/portal and offer payment collection or transfer to medical billing staff."
        ),
        q(
          "Payment ready",
          "Would the patient like to make a payment now, set up a plan, or just get information?",
          ["Pay now", "Payment plan", "Information only", "Billing staff"]
        )
      ];
    case "followup":
      return [
        q(
          "Patient follow-up type",
          "Is this a post-visit check-in, lab/results question, medication adherence, procedure prep, or care reminder for the patient?",
          ["Post-visit", "Results", "Medication", "Procedure prep", "Reminder"]
        ),
        msg(
          "Patient status capture",
          `Capture a brief status for “${name}”: how the patient is feeling, whether care instructions were followed, and any barriers. Flag concerning symptoms for clinical escalation.`
        ),
        q(
          "Book return visit?",
          "Would the patient like to schedule a return or follow-up medical visit?",
          ["Yes, book", "Not now", "Transfer to care team"]
        )
      ];
    case "referral":
      return [
        q(
          "Care referral direction",
          "Is this about an outbound specialist referral, inbound referral scheduling, medical records, imaging, or prior authorization for the patient?",
          ["Outbound referral", "Inbound scheduling", "Records", "Imaging", "Prior auth"]
        ),
        msg(
          "Referral checklist",
          "Explain typical care-referral steps: order status, insurance authorization, specialist availability, and what documents the patient should bring."
        )
      ];
    case "campaign":
      return [
        msg(
          "Patient outreach intro",
          `This is a medical outreach conversation for “${name}”. ${summary} Confirm it is a convenient time; if not, offer a callback or SMS. Respect opt-outs.`
        ),
        q(
          "Consent to continue",
          "Is now a good time for a short patient care message from the clinic?",
          ["Yes, continue", "Call me later", "Text me instead", "Stop outreach"]
        ),
        msg(
          "Care-gap value",
          "Deliver the medical campaign purpose in 2–3 sentences, then ask one clear CTA (book a visit, confirm, update insurance, or decline)."
        )
      ];
    case "afterhours":
      return [
        msg(
          "After-hours patient framing",
          "State the medical clinic is closed or outside phone hours. Explain what you can do now for the patient vs what requires next-business-day clinical staff."
        ),
        q(
          "After-hours patient need",
          "Does the patient need urgent clinical guidance, a message for staff, medication/pharmacy info, or appointment help when we reopen?",
          ["Urgent clinical", "Leave a message", "Pharmacy/meds", "Appointments", "Other"]
        ),
        msg(
          "On-call safety rules",
          "If urgent but not emergency, explain on-call nurse/provider process. If emergency, direct the patient to ER/emergency services immediately."
        )
      ];
    case "concierge":
      return [
        q(
          "Care navigator lane",
          "I can help the patient with scheduling, intake, care messaging, billing pointers, or connecting to the right medical team. Where should we start?",
          ["Scheduling", "Intake", "Messaging", "Billing pointer", "Human navigator"]
        ),
        msg(
          "Orchestrate care steps",
          `For “${name}”, outline a short patient care plan with 2–3 steps, confirm the patient/caregiver agrees, then execute the first step carefully.`
        )
      ];
    case "pharmacy":
      return [
        msg(
          "Medication scope",
          `You support patient medication workflows for “${name}”. Never change doses, approve refills clinically, or invent pharmacy fill status. Escalate adverse reactions and emergencies immediately.`
        ),
        q(
          "Medication need",
          "Is this about a refill request, pharmacy pick-up/transfer, prior authorization, side-effect concern, or controlled-substance policy?",
          ["Refill", "Pick-up / transfer", "Prior auth", "Side effect", "Policy / other"]
        ),
        msg(
          "Capture Rx details",
          "Ask medication name as the patient knows it, pharmacy preference, and when they will run out. Document for clinical review — do not promise approval."
        ),
        q(
          "Safety check",
          "Is the patient having trouble breathing, facial/throat swelling, severe rash, or other urgent medication reactions right now?",
          ["Yes — emergency", "No", "Not sure — transfer to nurse"]
        )
      ];
    case "lab":
      return [
        msg(
          "Labs & diagnostics scope",
          `Help the patient with lab/diagnostic logistics for “${name}”. Never interpret lab or imaging results. Results questions route to the ordering clinician.`
        ),
        q(
          "Lab topic",
          "Does the patient need fasting/prep instructions, lab location/hours, order status, results-ready notice, or to book a follow-up visit?",
          ["Prep / fasting", "Location / hours", "Order status", "Results ready", "Book follow-up"]
        ),
        msg(
          "Results boundary",
          "If asking about results content: explain that clinical interpretation stays with licensed medical staff, then offer to schedule a results visit or leave a message for the care team."
        ),
        q(
          "Next clinical step",
          "Would the patient like prep instructions by SMS, a follow-up visit with the ordering clinician, or to speak with staff?",
          ["Send instructions", "Book follow-up", "Speak to staff", "Done for now"]
        )
      ];
    case "chronic_care":
      return [
        msg(
          "Chronic care framing",
          `Support ongoing disease management for the patient under “${name}”. Reinforce the care plan; do not replace the clinician. Escalate red-flag symptoms quickly.`
        ),
        q(
          "Condition check-in",
          "Is this a routine adherence check-in, home-monitoring question, symptom change, medication concern, or scheduling with the care team?",
          ["Adherence check-in", "Home monitoring", "Symptom change", "Medication", "Schedule visit"]
        ),
        msg(
          "Home readings & barriers",
          "Ask briefly about recent home readings (if relevant), medication adherence barriers, and whether symptoms are worse than usual. Document for the care team."
        ),
        q(
          "Red-flag chronic symptoms",
          "Is the patient having chest pain, severe shortness of breath, fainting, confusion, or other urgent warning signs right now?",
          ["Yes — emergency / ER", "No", "Not sure — transfer to nurse"]
        )
      ];
    case "pediatrics":
      return [
        msg(
          "Pediatrics & caregiver framing",
          `You are speaking with a parent/caregiver about a child patient for “${name}”. Center the child’s safety. Emergencies → ER/911. Do not diagnose.`
        ),
        q(
          "Caregiver topic",
          "Is this about well-child scheduling, vaccines, school/sports forms, fever/sick-visit triage, or newborn follow-up?",
          ["Well-child visit", "Vaccines", "School / sports forms", "Sick / fever", "Newborn follow-up"]
        ),
        msg(
          "Child safety screen",
          "For fever or illness concerns, ask age group (infant vs older child), fever height if known, breathing difficulty, lethargy, and hydration. Escalate concerning answers to nursing."
        ),
        q(
          "Next pediatric step",
          "Would you like to book a pediatric visit, get nurse triage, receive a vaccine reminder, or leave a message for the care team?",
          ["Book visit", "Nurse triage", "Vaccine reminder", "Message care team"]
        )
      ];
    default:
      return [
        msg(
          "Patient workflow detail",
          `Provide careful, medicine-focused next steps for the patient/caregiver tailored to “${name}”. ${summary}`
        )
      ];
  }
}

function resolveDetailedTemplateGraph(template) {
  const spec = buildDetailedGraphSpec(template);
  const graph = buildAgentGraph(spec);
  return normalizeGraph(graph);
}

function countNodes(graph) {
  return Array.isArray(graph?.nodes) ? graph.nodes.length : 0;
}

module.exports = {
  buildDetailedGraphSpec,
  resolveDetailedTemplateGraph,
  countNodes
};
