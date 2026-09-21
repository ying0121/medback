/**
 * Medical / patient-centered agent type catalog.
 * Every type is scoped to outpatient medicine and patient care — not generic business bots.
 * Complexity is a 1–5 scale (simple patient FAQ → full care orchestration).
 */

const AGENT_TYPES = [
  {
    id: "receptionist",
    name: "Patient front desk",
    complexity: 1,
    shortDescription: "Patient-facing hours, directions, providers, and lobby questions.",
    longDescription:
      "First-line medical receptionist for patients and caregivers: clinic hours, holiday closures, parking, directions to the exam building, which providers see which conditions at a high level, wait-time notices, and where to drop forms. Routes prescription refill requests and clinical questions to the right medical staff queue. Never diagnoses. Built for outpatient medical practices that want patients greeted like a clinic front desk — not a generic call center.",
    defaultTools: ["transfer_to_human", "send_sms", "send_email"],
    color: "#0DA2E7"
  },
  {
    id: "scheduler",
    name: "Patient scheduling",
    complexity: 2,
    shortDescription: "Books, reschedules, and cancels patient medical visits.",
    longDescription:
      "Patient appointment scheduling for medical visits: new patient exams, follow-ups, same-day sick visits, specialist slots, pediatric well-child, annual physicals, procedures, and telehealth. Confirms patient identity lightly, collects visit reason (chief concern), preferred times, and provider preferences, then books on the clinic calendar. Designed so patients can schedule care without waiting on hold while respecting clinical scheduling rules.",
    defaultTools: [
      "book_appointment",
      "reschedule_appointment",
      "cancel_appointment",
      "send_appointment_reminder",
      "transfer_to_human"
    ],
    color: "#21CAB9"
  },
  {
    id: "intake",
    name: "Patient intake",
    complexity: 3,
    shortDescription: "Demographics, insurance, meds, allergies, and consents before the visit.",
    longDescription:
      "Pre-visit medical intake for patients: demographics, insurance cards, medication and allergy lists, problem history, consents, HIPAA notices, referral paperwork, symptom questionnaires, and telehealth tech checks. Saves updates to the patient chart context and escalates clinical red flags to staff. Keeps medical records cleaner and shortens rooming time for clinicians.",
    defaultTools: ["update_patient_info", "send_sms", "send_email", "transfer_to_human"],
    color: "#11C589"
  },
  {
    id: "triage",
    name: "Clinical triage",
    complexity: 3,
    shortDescription: "Patient symptom screening with urgent medical escalation.",
    longDescription:
      "Nurse-line style clinical triage for patients: flu/COVID screens, urgent-versus-routine routing, pediatric fever, medication side effects, wound checks, and post-op concerns. Red flags (chest pain, stroke signs, severe breathing trouble, suicidal thoughts) always redirect to emergency care or warm-transfer to a clinician. Does not diagnose or prescribe — it stratifies urgency for medical staff.",
    defaultTools: ["transfer_to_human", "send_sms", "book_appointment"],
    color: "#EF4343"
  },
  {
    id: "billing",
    name: "Patient billing",
    complexity: 3,
    shortDescription: "Patient balances, estimates, insurance, and medical payments.",
    longDescription:
      "Patient financial counseling for medical bills: balances, statements, insurance denials, copay/coinsurance estimates, HSA/FSA, payment plans, refunds, prior-auth status, and self-pay quotes for visits and procedures. Can start payment collection and escalate account disputes to medical billing staff. Tone stays compliant and patient-empathetic — never invents clinical coverage decisions.",
    defaultTools: ["collect_payment", "send_email", "send_sms", "transfer_to_human"],
    color: "#F59F0A"
  },
  {
    id: "followup",
    name: "Patient follow-up",
    complexity: 3,
    shortDescription: "Post-visit check-ins, adherence, labs, and care-plan outreach.",
    longDescription:
      "Longitudinal patient follow-up after medical visits: recovery check-ins, lab-results-ready notices, care-plan and medication adherence, procedure prep, no-show recovery, chronic care touchpoints, discharge follow-up, and vaccine reminders. Captures patient-reported status, books return visits, and escalates concerning symptoms to clinical staff.",
    defaultTools: [
      "send_sms",
      "send_email",
      "send_appointment_reminder",
      "book_appointment",
      "transfer_to_human"
    ],
    color: "#7444E4"
  },
  {
    id: "referral",
    name: "Care referral",
    complexity: 4,
    shortDescription: "Specialist referrals, records, imaging, and care transitions.",
    longDescription:
      "Coordinates patient referral journeys between medical providers: outbound specialist referrals, inbound referral scheduling, records requests, imaging order status, referral prior auth, second opinions, transitions of care, DME, and home health. Gathers clinical context and insurance constraints, then routes incomplete items to referral coordinators so patients are not left in limbo.",
    defaultTools: [
      "book_appointment",
      "update_patient_info",
      "send_email",
      "send_sms",
      "transfer_to_human"
    ],
    color: "#9449DF"
  },
  {
    id: "campaign",
    name: "Patient outreach",
    complexity: 4,
    shortDescription: "Medical recalls, vaccine drives, and care-gap campaigns.",
    longDescription:
      "Population-health outreach to patients: appointment reminders, overdue care recalls, flu/COVID vaccine drives, wellness visits, chronic care gaps, insurance card updates, procedural consent campaigns, and re-engagement of inactive patients. Conversations are short, clinically purposeful, with easy opt-outs and booking into medical visits — not generic marketing spam.",
    defaultTools: [
      "send_appointment_reminder",
      "send_sms",
      "send_email",
      "send_voicemail",
      "book_appointment"
    ],
    color: "#E44494"
  },
  {
    id: "afterhours",
    name: "After-hours patient line",
    complexity: 4,
    shortDescription: "Nights/weekends patient answering with emergency redirect.",
    longDescription:
      "After-hours medical answering for patients when the clinic is closed: urgent-care guidance, on-call nurse paths, emergency redirect to ER/911, holiday coverage, after-hours medication questions, pharmacy hours, and next-day callbacks. Prioritizes patient safety and never delays emergency care. Captures clinical messages for the care team to review when the office reopens.",
    defaultTools: ["transfer_to_human", "send_voicemail", "send_sms", "send_email"],
    color: "#2474F5"
  },
  {
    id: "concierge",
    name: "Patient care navigator",
    complexity: 5,
    shortDescription: "High-touch coordination across visits, intake, and care teams.",
    longDescription:
      "Premium patient care navigation that combines front desk, scheduling, light intake, and care coordination: multi-location routing, bilingual family medicine, specialty clinic orchestration, surgical coordination, oncology support navigation, and chronic care hubs. Uses multiple medical tools in one patient conversation and keeps continuity across complex care journeys.",
    defaultTools: [
      "book_appointment",
      "reschedule_appointment",
      "cancel_appointment",
      "update_patient_info",
      "collect_payment",
      "send_sms",
      "send_email",
      "transfer_to_human"
    ],
    color: "#F97415"
  },
  {
    id: "pharmacy",
    name: "Medication & pharmacy",
    complexity: 3,
    shortDescription: "Refills, pharmacy routing, and medication questions for patients.",
    longDescription:
      "Patient medication support: refill request routing, pharmacy transfer questions, medication pick-up timing, prior-auth status for prescriptions, side-effect triage with escalation, and controlled-substance policy reminders. Never changes doses or invents clinical advice. Escalates adverse reactions and urgent med issues to clinical staff immediately.",
    defaultTools: ["transfer_to_human", "send_sms", "send_email", "update_patient_info"],
    color: "#059669"
  },
  {
    id: "lab",
    name: "Labs & diagnostics",
    complexity: 3,
    shortDescription: "Lab orders, results readiness, and diagnostic visit help.",
    longDescription:
      "Helps patients with laboratory and diagnostic workflows: fasting instructions, lab location/hours, order status, results-ready notifications (without interpreting results), imaging prep, and booking related follow-up visits with the ordering clinician. Clinical interpretation of results always stays with licensed medical staff.",
    defaultTools: [
      "send_sms",
      "send_email",
      "book_appointment",
      "send_appointment_reminder",
      "transfer_to_human"
    ],
    color: "#0284C7"
  },
  {
    id: "chronic_care",
    name: "Chronic care",
    complexity: 4,
    shortDescription: "Ongoing disease management check-ins for patients.",
    longDescription:
      "Supports patients living with chronic conditions (diabetes, hypertension, asthma, heart failure, COPD, and similar): adherence check-ins, home-monitoring reminders, care-plan reinforcement, symptom watch lists, and scheduling with the care team. Escalates red-flag symptoms quickly. Complements — never replaces — the patient’s clinician.",
    defaultTools: [
      "send_sms",
      "send_email",
      "book_appointment",
      "send_appointment_reminder",
      "update_patient_info",
      "transfer_to_human"
    ],
    color: "#7C3AED"
  },
  {
    id: "pediatrics",
    name: "Pediatrics & caregivers",
    complexity: 3,
    shortDescription: "Well-child, sick visits, and caregiver guidance for kids.",
    longDescription:
      "Pediatric outpatient support for parents and caregivers: well-child scheduling, vaccine reminders, school/sports forms, fever and sick-visit triage with nurse escalation, newborn follow-up, and caregiver education pointers from clinic knowledge. Speaks with caregivers while centering the child’s safety; emergencies always redirect to ER/911.",
    defaultTools: [
      "book_appointment",
      "send_appointment_reminder",
      "send_sms",
      "send_email",
      "transfer_to_human"
    ],
    color: "#DB2777"
  }
];

function getAgentType(id) {
  const key = String(id || "")
    .trim()
    .toLowerCase();
  return AGENT_TYPES.find((t) => t.id === key) || null;
}

function listAgentTypes() {
  return AGENT_TYPES.map((t) => ({ ...t, defaultTools: [...t.defaultTools] }));
}

module.exports = {
  AGENT_TYPES,
  getAgentType,
  listAgentTypes
};
