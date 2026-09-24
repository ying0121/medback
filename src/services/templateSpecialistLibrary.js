/**
 * Specialist personas + FULL feature intent taxonomies per agent type.
 *
 * Rule: a topic template never strips features. Scheduler topics always include
 * book + reschedule + cancel + same-day + telehealth + reminders. Intake topics
 * always include the full intake spectrum. Topic focus only adds emphasis paths.
 */

function msg(label, prompt, guideText = "") {
  return { type: "message", label, prompt, guideText };
}

function q(label, prompt, options, guideText = "") {
  const step = { type: "question", label, prompt, options };
  if (guideText) step.guideText = guideText;
  return step;
}

function tool(toolId, label) {
  return { type: "tool", toolId, label };
}

function confirmTool(toolId, label, ask) {
  return [
    q(`Confirm ${label}`, ask || `Would you like me to ${label.toLowerCase()} now?`, [
      "Yes, please",
      "No thanks",
      "Speak to staff"
    ]),
    tool(toolId, label),
    msg("Done", "I've completed that step. You'll get a confirmation if one is available.")
  ];
}

function intent(id, label, synonyms, steps) {
  return { id, label, synonyms, steps };
}

const TYPE_PERSONAS = {
  receptionist: {
    role: "patient front-desk specialist",
    specialty: "clinic access, providers, routing, and day-of support",
    tone: "welcoming, efficient, lobby-desk professional",
    voice:
      "You sound like the clinic's best front-desk lead — you know the building, the providers, and when to route clinical questions.",
    boundaries: [
      "Never diagnose or interpret symptoms",
      "Never invent hours, parking, or provider schedules",
      "Route clinical, billing, or refill requests to the right path or staff"
    ]
  },
  scheduler: {
    role: "patient scheduling specialist",
    specialty: "complete medical appointment orchestration",
    tone: "organized, reassuring, schedule-savvy",
    voice:
      "You sound like an experienced medical scheduler who handles booking, changes, cancellations, same-day access, and telehealth in one conversation.",
    boundaries: [
      "Never invent open slots — only use clinic scheduling rules/tools",
      "Collect visit reason at a high level; do not diagnose",
      "Escalate same-day emergencies to 911 / clinical staff",
      "Always offer the full appointment toolkit: book, reschedule, cancel, same-day, telehealth, reminders"
    ]
  },
  intake: {
    role: "pre-visit medical intake specialist",
    specialty: "complete chart intake across all clinical sections",
    tone: "careful, private, chart-accurate",
    voice:
      "You sound like a seasoned intake coordinator who can open any intake section the patient needs — not only one form.",
    boundaries: [
      "Never demand full SSN on the call",
      "Confirm sensitive fields back to the patient before saving",
      "Escalate clinical red flags to staff",
      "Offer the full intake spectrum even when the topic emphasizes one section"
    ]
  },
  triage: {
    role: "nurse-line clinical triage specialist",
    specialty: "complete symptom urgency screening and disposition",
    tone: "clinically careful, non-alarmist, decisive on red flags",
    voice:
      "You sound like an outpatient nurse triage specialist with a full disposition toolkit — emergency, same-day, routine, advice, or transfer.",
    boundaries: [
      "Never diagnose or prescribe",
      "Emergencies → 911 / ER immediately",
      "Disposition only: self-care guidance, clinic visit, or clinician transfer"
    ]
  },
  billing: {
    role: "patient financial counseling specialist",
    specialty: "complete medical billing and payment counseling",
    tone: "empathetic, clear, compliant",
    voice:
      "You sound like a clinic financial counselor who can handle balances, plans, estimates, denials, prior auth, and refunds in one desk.",
    boundaries: [
      "Never invent balances, coverage, or prior-auth outcomes",
      "Do not make clinical coverage decisions",
      "Escalate disputes to billing staff"
    ]
  },
  pharmacy: {
    role: "clinic pharmacy coordination specialist",
    specialty: "complete prescription coordination for patients",
    tone: "precise, safety-first, non-prescribing",
    voice:
      "You sound like a medical assistant who coordinates the full Rx lifecycle — refills, PA, pickup, safety — never a prescribing clinician.",
    boundaries: [
      "Never approve refills, change doses, or authorize controlled substances",
      "Side-effect emergencies → 911 / clinical staff",
      "Route clinical approval to the care team"
    ]
  },
  lab: {
    role: "lab and diagnostics coordination specialist",
    specialty: "complete labs/imaging patient logistics",
    tone: "clear, careful, non-interpretive",
    voice:
      "You sound like a diagnostics coordinator who handles prep, status, results logistics, and review booking — clinicians interpret results.",
    boundaries: [
      "Never interpret lab or imaging results",
      "Abnormal/urgent results → clinician callback path",
      "Use clinic prep instructions only"
    ]
  },
  chronic_care: {
    role: "chronic care management specialist",
    specialty: "complete chronic disease check-in and care coordination",
    tone: "supportive coach, clinically bounded",
    voice:
      "You sound like a care manager with a full chronic-care toolkit — readings, adherence, gaps, booking — not independent prescribing.",
    boundaries: [
      "Never change medication doses",
      "Red-flag symptoms → urgent/emergency routing",
      "Reinforce the patient's existing care plan only"
    ]
  },
  pediatrics: {
    role: "pediatric clinic care specialist",
    specialty: "complete pediatric outpatient support for caregivers",
    tone: "warm with caregivers, age-aware, safety-first",
    voice:
      "You sound like an experienced pediatric desk that can handle well, sick, vaccines, forms, and privacy questions in one place.",
    boundaries: [
      "Infants under 3 months with fever → urgent clinical path",
      "Never replace an exam when one is needed",
      "Respect teen privacy; escalate confidential concerns to staff"
    ]
  },
  referral: {
    role: "care referral and transitions specialist",
    specialty: "complete referral, records, imaging, and auth coordination",
    tone: "coordinating, thorough, patient-advocate",
    voice:
      "You sound like a referral coordinator who can run the full referral toolkit — outbound, inbound, records, imaging, PA, DME, home health.",
    boundaries: [
      "Never invent authorization or records status",
      "Capture specialty, urgency, and insurance constraints accurately",
      "Hand incomplete clinical packets to referral staff"
    ]
  },
  followup: {
    role: "post-visit follow-up specialist",
    specialty: "complete post-visit, results, adherence, and rebooking follow-up",
    tone: "checking-in, attentive, non-diagnostic",
    voice:
      "You sound like a follow-up desk that covers recovery, results logistics, adherence, no-shows, and rebooking in one conversation.",
    boundaries: [
      "Worsening/red-flag symptoms → clinical staff or 911",
      "Do not interpret new results as a diagnosis",
      "Book return visits within clinic rules"
    ]
  },
  afterhours: {
    role: "after-hours patient safety specialist",
    specialty: "complete nights/weekends answering and safety routing",
    tone: "calm night-desk professional",
    voice:
      "You sound like the clinic's after-hours answering specialist with a full toolkit — emergency, urgent, message, wait-until-open, meds.",
    boundaries: [
      "Emergencies → 911 / ER without delay",
      "Never invent on-call numbers",
      "Do not approve after-hours controlled refills"
    ]
  },
  campaign: {
    role: "population-health outreach specialist",
    specialty: "complete outreach with book, defer, update, and opt-out",
    tone: "brief, respectful, easy opt-out",
    voice:
      "You sound like a care-gap outreach specialist who can book, reschedule, update info, call later, or opt out — never spammy.",
    boundaries: [
      "Honor opt-out / call-later immediately",
      "Keep outreach short",
      "Book only into real clinic workflows"
    ]
  },
  concierge: {
    role: "patient concierge and care navigation specialist",
    specialty: "complete multi-need clinic navigation",
    tone: "high-touch, coordinating, clinic ambassador",
    voice:
      "You sound like a patient concierge who can navigate scheduling, intake, billing route, and care-team needs without overstepping clinical boundaries.",
    boundaries: [
      "Detect the primary need and open the full matching toolkit",
      "Do not diagnose",
      "Transfer complex multi-department issues to staff when needed"
    ]
  }
};

function buildPersona(template) {
  const typeId = String(template?.typeId || "receptionist");
  const name = String(template?.name || "Clinic specialist").trim();
  const summary = String(template?.summary || "").trim();
  const typeDefaults = TYPE_PERSONAS[typeId] || TYPE_PERSONAS.receptionist;
  const specialtyFocus = summary || typeDefaults.specialty;

  const systemRole = [
    `You are {{agent_name}}, a real ${typeDefaults.role} at {{clinic_name}}.`,
    `Specialty focus for this topic: ${specialtyFocus}.`,
    `This workflow topic is: “${name}”.`,
    typeDefaults.voice,
    "Speak like an experienced outpatient clinic specialist: calm, precise, warm, never robotic.",
    "This desk contains ALL standard features for your specialty — not a single micro-action.",
    "Detect the patient's true intent early, then follow the matching specialized path.",
    "One short turn, then wait. Do not dump multiple questions at once.",
    "Boundaries:",
    ...typeDefaults.boundaries.map((b) => `- ${b}`),
    "If the request is outside your specialty scope, say so briefly and offer transfer to the right staff."
  ].join("\n");

  return {
    role: typeDefaults.role,
    specialty: specialtyFocus,
    tone: typeDefaults.tone,
    boundaries: typeDefaults.boundaries,
    systemRole
  };
}

/** ——— Full feature packs (always included for the type) ——— */

function fullAppointmentIntents(summary) {
  return [
    intent(
      "book",
      "Book a visit",
      ["schedule", "make an appointment", "new appointment", "need to be seen", "set up a visit"],
      [
        q("Patient status", "Are you new to {{clinic_name}}, or have you been seen here before?", [
          "New patient",
          "Existing patient",
          "Not sure",
          "Speak to staff"
        ]),
        q("Visit type", "What kind of visit do you need?", [
          "New patient exam",
          "Follow-up",
          "Same-day / sick",
          "Procedure / specialty",
          "Telehealth",
          "Wellness / physical",
          "Speak to staff"
        ]),
        q("Chief concern", "In a few words, what is the main reason for the visit?", [
          "Routine / wellness",
          "New problem",
          "Results follow-up",
          "Forms / clearance",
          "Other"
        ], "High-level reason only — not a diagnosis."),
        q("Provider", "Specific provider, or soonest available clinician?", [
          "Specific provider",
          "Soonest available",
          "Any in specialty",
          "Not sure"
        ]),
        q("Location / modality", "In-clinic at a specific location, first available site, or telehealth?", [
          "Specific location",
          "First available site",
          "Telehealth",
          "Not sure"
        ]),
        q("Timing", "What timing works best?", [
          "Morning",
          "Afternoon",
          "This week if possible",
          "Flexible"
        ]),
        msg(
          "Schedule",
          "I'll check openings that match clinic scheduling rules and confirm with you.",
          `Full appointment desk · topic: ${summary}. Never invent slots.`
        ),
        ...confirmTool("book_appointment", "Book visit", "Should I book that appointment now?"),
        q("Reminder", "Text reminder, email reminder, both, or none?", [
          "Text",
          "Email",
          "Both",
          "None"
        ]),
        q("What to bring", "Would you like a quick reminder of what to bring?", [
          "Yes",
          "No thanks"
        ])
      ]
    ),
    intent(
      "reschedule",
      "Reschedule an existing visit",
      ["move my appointment", "change the time", "different day", "reschedule"],
      [
        q("Which visit", "Which appointment are we moving — date known, or look up by name and date of birth?", [
          "I know the date",
          "Look it up",
          "Speak to staff"
        ]),
        q("New timing", "What timing works better?", ["Morning", "Afternoon", "Sooner", "Flexible"]),
        q("Modality change", "Keep the same visit type, or switch in-clinic / telehealth?", [
          "Same type",
          "Switch to telehealth",
          "Switch to in-clinic",
          "Not sure"
        ]),
        ...confirmTool("reschedule_appointment", "Reschedule", "Should I reschedule to that time?"),
        q("Reminder", "Update your reminder preference?", ["Text", "Email", "Both", "None"])
      ]
    ),
    intent(
      "cancel",
      "Cancel a visit",
      ["cancel appointment", "can't make it", "won't be coming", "cancel my visit"],
      [
        q("Cancel confirm", "Just to confirm — cancel, or would you rather reschedule?", [
          "Cancel",
          "Actually reschedule",
          "Speak to staff"
        ]),
        q("Which visit", "Do you know the appointment date, or should we look it up?", [
          "I know the date",
          "Look it up",
          "Speak to staff"
        ]),
        ...confirmTool("cancel_appointment", "Cancel visit", "Should I cancel that appointment now?"),
        q("Rebook later", "Would you like to book a new time before we finish?", [
          "Yes, book now",
          "Not now",
          "Speak to staff"
        ])
      ]
    ),
    intent(
      "same_day",
      "Same-day or urgent visit",
      ["today", "sick visit", "urgent appointment", "walk-in", "need to be seen today"],
      [
        q(
          "Same-day screen",
          "Any severe chest pain, trouble breathing, or emergency symptoms right now?",
          ["No", "Yes — emergency", "Not sure", "Speak to staff"]
        ),
        q("Same-day need", "Do you need to be seen today, or within the next day or two?", [
          "Today",
          "Next day or two",
          "Flexible",
          "Speak to staff"
        ]),
        q("Reason", "Briefly, what is going on?", [
          "Sick / new problem",
          "Follow-up can't wait",
          "Other",
          "Speak to staff"
        ]),
        ...confirmTool("book_appointment", "Same-day book", "Should I look for a same-day opening now?")
      ]
    ),
    intent(
      "confirm_reminder",
      "Confirm visit or change reminders",
      ["confirm appointment", "am I still scheduled", "reminder", "what time is my visit"],
      [
        q("Confirm need", "Do you want to confirm the time, change reminders, or update details?", [
          "Confirm time",
          "Change reminders",
          "Update details",
          "Speak to staff"
        ]),
        ...confirmTool(
          "send_appointment_reminder",
          "Send confirmation",
          "Should I send a confirmation or reminder now?"
        ),
        q("Also change visit", "Need to reschedule or cancel instead?", [
          "Reschedule",
          "Cancel",
          "No, I'm good"
        ])
      ]
    ),
    intent(
      "telehealth",
      "Telehealth visit help",
      ["video visit", "virtual visit", "zoom visit", "telehealth", "online appointment"],
      [
        q("Telehealth action", "Book a telehealth visit, reschedule one, tech-check, or join instructions?", [
          "Book telehealth",
          "Reschedule telehealth",
          "Tech check",
          "Join instructions",
          "Speak to staff"
        ]),
        q("Device", "Will you join from phone, tablet, or computer?", [
          "Phone",
          "Tablet",
          "Computer",
          "Not sure"
        ]),
        ...confirmTool("book_appointment", "Telehealth book/change", "Proceed with that telehealth scheduling step?"),
        ...confirmTool("send_sms", "Send join/tech tips", "Text join or tech-check tips?")
      ]
    )
  ];
}

function fullIntakeIntents(summary) {
  return [
    intent(
      "demographics_contact",
      "Demographics & contact info",
      ["change phone", "address", "email", "emergency contact", "name spelling"],
      [
        q("Identity", "Please confirm the patient's full name and date of birth.", [
          "I'll share now",
          "Calling for someone else",
          "Speak to staff"
        ]),
        q("Fields", "What should we update — phone, email, address, emergency contact, or several?", [
          "Phone",
          "Email",
          "Address",
          "Emergency contact",
          "Several"
        ]),
        msg("Confirm", "I'll repeat each detail back before saving.", "No full SSN."),
        ...confirmTool("update_patient_info", "Save demographics", "Save these updates now?")
      ]
    ),
    intent(
      "medications",
      "Medications list",
      ["med list", "prescriptions", "what I'm taking", "supplements"],
      [
        q("Meds", "Share prescription, OTC, and supplement names one at a time?", [
          "I'll list them",
          "No medications",
          "Not sure",
          "Speak to staff"
        ]),
        ...confirmTool("update_patient_info", "Save medications", "Save the medication list now?")
      ]
    ),
    intent(
      "allergies",
      "Allergies & reactions",
      ["allergy", "allergic", "reaction", "rash from medicine"],
      [
        q("Allergies", "Any medication, food, or other allergies — including reactions?", [
          "Yes — I'll list",
          "No known allergies",
          "Not sure",
          "Speak to staff"
        ]),
        ...confirmTool("update_patient_info", "Save allergies", "Save allergy details now?")
      ]
    ),
    intent(
      "insurance",
      "Insurance & coverage details",
      ["insurance", "member id", "new plan", "card", "subscriber"],
      [
        q("Payer", "Plan name and member ID?", [
          "I'll share now",
          "Self-pay",
          "Card photo later",
          "Speak to staff"
        ]),
        q("Subscriber", "Is the patient the subscriber, or a dependent?", [
          "Subscriber",
          "Dependent",
          "Not sure"
        ]),
        ...confirmTool("update_patient_info", "Save insurance", "Save insurance details now?"),
        msg("Verify", "Benefits still need clinic verification — I won't claim coverage is confirmed.", summary)
      ]
    ),
    intent(
      "consents_forms",
      "Consents, HIPAA, or forms",
      ["consent", "hipaa", "authorization", "forms", "paperwork"],
      [
        q("Which", "Treatment consent, HIPAA notice, or other forms?", [
          "Consent",
          "HIPAA",
          "Other forms",
          "Speak to staff"
        ]),
        ...confirmTool("update_patient_info", "Record acknowledgement", "Record that acknowledgement now?"),
        ...confirmTool("send_sms", "Send forms link", "Text a forms or portal link?")
      ]
    ),
    intent(
      "full_packet",
      "Complete intake packet",
      ["full intake", "new patient packet", "go through everything", "all forms"],
      [
        msg(
          "Packet",
          "We'll cover contact, emergency contact, medications, allergies, insurance, then consents — you can skip sections you already finished.",
          `Full intake · ${summary}`
        ),
        q("Start section", "Where should we start?", [
          "Contact",
          "Medications",
          "Allergies",
          "Insurance",
          "Consents"
        ]),
        ...confirmTool("update_patient_info", "Save progress", "Save what we've captured so far?"),
        ...confirmTool("send_sms", "Finish online", "Text a portal link to finish anything online?")
      ]
    )
  ];
}

function fullTriageIntents(summary) {
  return [
    intent(
      "emergency",
      "Emergency or severe symptoms",
      ["911", "can't breathe", "chest pain", "stroke", "suicidal", "severe bleeding"],
      [
        q(
          "Confirm emergency",
          "Severe chest pain, trouble breathing, stroke symptoms, heavy bleeding, or thoughts of harming yourself?",
          ["Yes — emergency", "No", "Not sure", "Speak to staff"]
        ),
        msg(
          "Emergency direction",
          "If this is an emergency, hang up and dial 911 or go to the nearest ER now. I can also connect you to clinic staff if you can stay on the line.",
          "Safety first."
        )
      ]
    ),
    intent(
      "symptom_screen",
      "Symptom concern — need triage",
      ["symptoms", "not feeling well", "fever", "pain", "cough", "sick"],
      [
        q("Who", "About you, or caregiver for someone else?", ["Myself", "Caregiver", "Speak to staff"]),
        q("Main symptom", "Main symptom?", [
          "Fever",
          "Pain",
          "Breathing / cough",
          "GI / stomach",
          "Injury / wound",
          "Mental health",
          "Other"
        ]),
        q("Onset severity", "When did it start, and mild / moderate / severe now?", [
          "Mild",
          "Moderate",
          "Severe",
          "Getting worse",
          "Speak to staff"
        ]),
        q("Associated", "Fever, vomiting, dizziness, rash, or other associated symptoms?", [
          "Yes — I'll describe",
          "No",
          "Not sure"
        ]),
        msg(
          "Disposition",
          "I'll guide next steps — protocol self-care, same-day visit, or clinical staff. I cannot diagnose.",
          summary
        ),
        q("Next", "What do you want next?", [
          "Same-day visit",
          "Routine visit",
          "Nurse / clinical staff",
          "Advice only",
          "Speak to staff"
        ]),
        ...confirmTool("book_appointment", "Book from triage", "Book a clinic visit now?")
      ]
    ),
    intent(
      "med_side_effect",
      "Medication side effect",
      ["side effect", "reaction", "after starting medicine"],
      [
        q("Side-effect emergency", "Trouble breathing, swelling, or severe allergic symptoms?", [
          "No",
          "Yes — emergency",
          "Not sure",
          "Speak to staff"
        ]),
        q("Which med", "Which medication, and when did it start?", [
          "I'll share details",
          "Not sure",
          "Speak to staff"
        ]),
        msg("Route", "I'll route this to clinical staff — I cannot advise stopping or changing doses.", summary),
        q("Connect", "Transfer now, or leave an urgent message?", [
          "Transfer now",
          "Urgent message",
          "Speak to staff"
        ])
      ]
    ),
    intent(
      "advice_callback",
      "Advice or nurse callback",
      ["is it normal", "advice", "callback", "nurse line"],
      [
        q("Advice topic", "After-visit advice, home-care tips, or when to be seen?", [
          "After a visit",
          "Home care tips",
          "When to be seen",
          "Speak to staff"
        ]),
        msg("Bound", "I can share clinic guidance, not a personal diagnosis.", summary),
        q("Enough", "Does that answer it, or nurse callback?", [
          "I'm good",
          "Nurse callback",
          "Book a visit",
          "Speak to staff"
        ])
      ]
    )
  ];
}

function fullBillingIntents(summary) {
  return [
    intent(
      "balance_pay",
      "Balance, bill, or make a payment",
      ["bill", "balance", "what do I owe", "pay my bill", "statement"],
      [
        q("Identity", "Confirm patient name and date of birth on the account.", [
          "I'll share",
          "Someone else",
          "Speak to staff"
        ]),
        q("Need", "Explain a statement, check balance, or make a payment?", [
          "Explain statement",
          "Check balance",
          "Make a payment",
          "Speak to staff"
        ]),
        msg("Honest", "I'll use clinic billing information only — I won't invent amounts.", summary),
        ...confirmTool("collect_payment", "Payment", "Start a payment now?"),
        q("Summary", "Text or email a summary?", ["Text", "Email", "No"])
      ]
    ),
    intent(
      "payment_plan",
      "Payment plan or financial assistance",
      ["payment plan", "can't afford", "financial assistance", "hardship"],
      [
        q("Plan need", "Payment plan, hardship assistance, or pay today?", [
          "Payment plan",
          "Hardship",
          "Pay today",
          "Speak to staff"
        ]),
        ...confirmTool("collect_payment", "Payment options", "Walk through payment options now?")
      ]
    ),
    intent(
      "insurance_denial_pa",
      "Insurance, denial, or prior authorization",
      ["insurance", "denied", "prior auth", "coverage", "claim"],
      [
        q("Topic", "Coverage, claim denial, prior auth, or something else?", [
          "Coverage",
          "Denial",
          "Prior auth",
          "Other",
          "Speak to staff"
        ]),
        q("Auth ladder", "If prior auth — pending, approved, denied, or need to start?", [
          "Pending",
          "Approved",
          "Denied",
          "Need to start",
          "Not PA"
        ]),
        msg("Status", "I only report known status — never invent outcomes.", summary),
        q("Next", "Coordinator transfer, email summary, or estimate?", [
          "Transfer",
          "Email summary",
          "Estimate",
          "Speak to staff"
        ])
      ]
    ),
    intent(
      "estimate_selfpay",
      "Cost estimate or self-pay quote",
      ["estimate", "how much", "self-pay", "price", "quote"],
      [
        q("Service", "Which visit or procedure is the estimate for?", [
          "I'll describe",
          "Not sure",
          "Speak to staff"
        ]),
        msg(
          "Disclaimer",
          "Estimates are not a guarantee of final cost or coverage.",
          summary
        ),
        q("Send", "Email or text the estimate information?", ["Email", "Text", "Neither", "Speak to staff"])
      ]
    ),
    intent(
      "refund",
      "Refund or credit request",
      ["refund", "credit", "overcharged", "money back"],
      [
        q("Details", "Do you have a statement date or payment date for the refund request?", [
          "Yes",
          "Not sure",
          "Speak to staff"
        ]),
        msg("Intake", "I'll capture the refund request for billing staff review.", summary),
        ...confirmTool("update_patient_info", "Capture refund request", "Save this refund request now?")
      ]
    )
  ];
}

function fullPharmacyIntents(summary) {
  return [
    intent(
      "refill",
      "Prescription refill",
      ["refill", "renew", "ran out", "need more medication"],
      [
        q("Who", "Patient, caregiver, or pharmacy?", ["Patient", "Caregiver", "Pharmacy", "Speak to staff"]),
        q("Medication", "Which medication and dose if known?", [
          "Name and dose",
          "Name only",
          "Not sure",
          "Speak to staff"
        ]),
        q("Urgency", "Routine, almost out, or urgent?", ["Routine", "Almost out", "Urgent", "Speak to staff"]),
        msg(
          "Policy",
          "I can route for clinician review — I cannot approve, change doses, or authorize controlled substances.",
          summary
        ),
        q("Pharmacy", "On file, different pharmacy, or mail-order?", [
          "On file",
          "Different pharmacy",
          "Mail order",
          "Not sure"
        ]),
        ...confirmTool("update_patient_info", "Capture refill", "Save refill details?"),
        ...confirmTool("send_sms", "Confirm received", "Text confirmation that we received the request?")
      ]
    ),
    intent(
      "prior_auth",
      "Medication prior authorization",
      ["prior auth", "PA", "insurance won't cover medication"],
      [
        q("PA status", "Check status, start new, or denial/appeal?", [
          "Check status",
          "Start new",
          "Denial / appeal",
          "Speak to staff"
        ]),
        ...confirmTool("update_patient_info", "Save PA request", "Save prior-auth details now?")
      ]
    ),
    intent(
      "logistics",
      "Pick-up, transfer, or mail-order logistics",
      ["pickup", "transfer pharmacy", "mail order", "specialty pharmacy"],
      [
        q("Logistics", "Pick-up, transfer, or mail-order/specialty?", [
          "Pick-up",
          "Transfer",
          "Mail order / specialty",
          "Speak to staff"
        ]),
        ...confirmTool("send_sms", "Send pharmacy info", "Text pharmacy details?")
      ]
    ),
    intent(
      "side_effect",
      "Side effect or medication safety",
      ["side effect", "reaction", "allergic to medicine"],
      [
        q("Emergency", "Trouble breathing, swelling, or severe allergy symptoms?", [
          "No",
          "Yes — emergency",
          "Speak to staff"
        ]),
        msg("Escalate", "This needs clinical review — no dose changes from me.", summary),
        q("Connect", "Transfer to clinical staff now?", ["Yes, transfer", "Leave message", "Speak to staff"])
      ]
    ),
    intent(
      "controlled_policy",
      "Controlled substance policy questions",
      ["controlled", "narcotic", "stimulant refill policy"],
      [
        msg(
          "Policy",
          "Controlled medications follow stricter clinic rules and always need clinician approval — I can't authorize them on this call.",
          summary
        ),
        q("Next", "Leave a clinician message, or discuss a non-controlled refill instead?", [
          "Clinician message",
          "Other refill",
          "Speak to staff"
        ])
      ]
    ),
    intent(
      "med_list",
      "Medication list / reconciliation prep",
      ["med list", "reconciliation", "what to bring for meds"],
      [
        q("List", "Build or update the medication list for an upcoming visit?", [
          "Build / update list",
          "Just tips on what to bring",
          "Speak to staff"
        ]),
        ...confirmTool("update_patient_info", "Save med list", "Save the medication list now?")
      ]
    )
  ];
}

function fullLabIntents(summary) {
  return [
    intent(
      "prep",
      "Lab or imaging preparation",
      ["fasting", "prep", "how to prepare", "before my test"],
      [
        q("Prep type", "Fasting, medication holds, arrival timing, or imaging prep?", [
          "Fasting",
          "Medication holds",
          "Arrival timing",
          "Imaging prep",
          "Speak to staff"
        ]),
        msg("Prep", "I'll share {{clinic_name}} preparation instructions.", summary),
        ...confirmTool("send_sms", "Send prep", "Text the prep steps?")
      ]
    ),
    intent(
      "order_status",
      "Order status",
      ["was it ordered", "order status", "has my lab been sent"],
      [
        q("Identity", "Confirm patient name and date of birth.", ["I'll share", "Speak to staff"]),
        msg("Status", "I'll check order logistics — not clinical results.", summary)
      ]
    ),
    intent(
      "results",
      "Results ready or pending",
      ["results", "lab results", "are my results in"],
      [
        q("State", "Ready, waiting, or need clinician about abnormal results?", [
          "Ready",
          "Waiting",
          "Abnormal — need clinician",
          "Speak to staff"
        ]),
        msg("No interpretation", "I help with logistics only — I cannot interpret results.", summary),
        ...confirmTool("send_sms", "Portal link", "Text a portal link?"),
        q("Visit", "Book a visit to review results with a clinician?", [
          "Yes, book",
          "No thanks",
          "Speak to staff"
        ])
      ]
    ),
    intent(
      "book_review",
      "Book a results or diagnostics visit",
      ["review results", "results appointment", "lab visit"],
      [...confirmTool("book_appointment", "Diagnostics visit", "Book that visit now?")]
    ),
    intent(
      "locations_insurance",
      "Lab location or insurance options",
      ["where do I go", "lab location", "does insurance cover the lab"],
      [
        msg("Options", "I'll share preferred locations and insurance-related logistics from clinic information.", summary),
        ...confirmTool("send_sms", "Send locations", "Text location options?")
      ]
    )
  ];
}

function fullChronicIntents(summary) {
  return [
    intent(
      "checkin",
      "Care check-in & home readings",
      ["check in", "readings", "how I've been", "monitoring"],
      [
        q("Red flags", "Chest pain, severe shortness of breath, fainting, or sudden worsening?", [
          "No",
          "Yes — emergency",
          "Not sure",
          "Speak to staff"
        ]),
        q("Readings", "Home readings in range, out of range, or not tracking?", [
          "In range",
          "Out of range",
          "Not tracking",
          "Speak to staff"
        ]),
        q("Symptoms", "Since last visit — better, same, or worse?", ["Better", "Same", "Worse", "Speak to staff"]),
        msg("Coach", "I'll reinforce your care plan — I cannot change doses.", summary)
      ]
    ),
    intent(
      "adherence_refill",
      "Medication adherence or refill needs",
      ["missed doses", "ran out", "adherence", "refill"],
      [
        q("Adherence", "Taking meds as prescribed, missed some, need refill review, or side effects?", [
          "As prescribed",
          "Missed some",
          "Need refill review",
          "Side effects",
          "Speak to staff"
        ]),
        ...confirmTool("update_patient_info", "Note for care team", "Save a note for the care team?")
      ]
    ),
    intent(
      "book_followup",
      "Book chronic-care follow-up",
      ["follow-up", "see my doctor", "overdue visit"],
      [...confirmTool("book_appointment", "Chronic follow-up", "Book that follow-up now?")]
    ),
    intent(
      "care_gap",
      "Care gap or due services",
      ["overdue", "due for labs", "care gap", "missing visit"],
      [
        q("Gap", "Due labs, overdue visit, vaccine, or something else?", [
          "Labs",
          "Visit",
          "Vaccine",
          "Other",
          "Speak to staff"
        ]),
        ...confirmTool("book_appointment", "Close care gap", "Schedule that now?")
      ]
    ),
    intent(
      "worsening",
      "Worsening symptoms",
      ["getting worse", "flare", "can't breathe well"],
      [
        q("Emergency", "Is this an emergency right now?", ["No", "Yes — emergency", "Speak to staff"]),
        q("Connect", "Same-day visit or clinical staff transfer?", [
          "Same-day visit",
          "Transfer to staff",
          "Speak to staff"
        ])
      ]
    )
  ];
}

function fullPediatricsIntents(summary) {
  return [
    intent(
      "well_vaccine",
      "Well-child or vaccines",
      ["well child", "checkup", "vaccines", "shots", "physical"],
      [
        q("Caregiver", "Parent/caregiver calling about a child?", [
          "Parent / caregiver",
          "Teen patient",
          "Speak to staff"
        ]),
        q("Age", "Child's age band?", ["Under 3 months", "Infant / toddler", "School-age", "Teen"]),
        q("Visit", "Well-child, vaccines, or both?", ["Well-child", "Vaccines", "Both", "Speak to staff"]),
        ...confirmTool("book_appointment", "Pediatric well/vaccine visit", "Book that visit now?"),
        q("Reminder", "Text reminder?", ["Yes", "No"])
      ]
    ),
    intent(
      "sick",
      "Sick child / fever",
      ["fever", "sick kid", "vomiting", "not acting right"],
      [
        q(
          "Infant fever",
          "Under 3 months with fever, or trouble breathing / unusual sleepiness / dehydration?",
          ["No", "Yes — urgent", "Yes — emergency", "Not sure", "Speak to staff"]
        ),
        q("Main issue", "Fever, breathing, stomach, injury, rash, or other?", [
          "Fever",
          "Breathing",
          "Stomach",
          "Injury",
          "Rash",
          "Other"
        ]),
        msg("Route", "I'll route using pediatric guidance — phone advice doesn't replace exams when needed.", summary),
        q("Next", "Sick visit, nurse callback, or emergency guidance?", [
          "Sick visit",
          "Nurse callback",
          "Emergency guidance",
          "Speak to staff"
        ]),
        ...confirmTool("book_appointment", "Sick visit", "Book a sick visit now?")
      ]
    ),
    intent(
      "forms",
      "School / sports forms",
      ["school form", "sports physical", "camp form"],
      [
        q("Form type", "School, sports, camp, or other?", ["School", "Sports", "Camp", "Other", "Speak to staff"]),
        ...confirmTool("update_patient_info", "Capture form request", "Save the forms request?"),
        q("Exam needed", "Do you also need to schedule the exam for the form?", [
          "Yes, schedule",
          "Forms only",
          "Speak to staff"
        ])
      ]
    ),
    intent(
      "newborn",
      "Newborn follow-up",
      ["newborn", "baby checkup", "weight check"],
      [
        q("Concern", "Routine newborn visit, feeding/weight concern, or urgent worry?", [
          "Routine visit",
          "Feeding / weight",
          "Urgent worry",
          "Speak to staff"
        ]),
        ...confirmTool("book_appointment", "Newborn visit", "Book the newborn visit now?")
      ]
    ),
    intent(
      "behavioral_teen",
      "Behavioral concern or teen privacy",
      ["behavior", "ADHD", "anxiety", "teen confidential", "adolescent"],
      [
        q("Path", "Behavioral/developmental concern, or adolescent confidentiality / visit help?", [
          "Behavioral concern",
          "Teen privacy / visit",
          "Speak to staff"
        ]),
        msg("Sensitive", "I'll route carefully and respect privacy rules.", summary),
        q("Next", "Schedule visit or transfer to clinical staff?", [
          "Schedule visit",
          "Transfer to staff",
          "Speak to staff"
        ])
      ]
    ),
    intent(
      "reschedule_cancel_peds",
      "Reschedule or cancel a pediatric visit",
      ["reschedule", "cancel", "move appointment", "can't bring child"],
      [
        q("Change", "Reschedule or cancel?", ["Reschedule", "Cancel", "Speak to staff"]),
        ...confirmTool("reschedule_appointment", "Change pediatric visit", "Proceed with that change?"),
        ...confirmTool("cancel_appointment", "Cancel pediatric visit", "Cancel that visit now?")
      ]
    )
  ];
}

function fullReferralIntents(summary) {
  return [
    intent(
      "new_referral",
      "New outbound or inbound referral",
      ["referral", "see a specialist", "referred to"],
      [
        q("Direction", "Outbound from us, or inbound referral to schedule?", [
          "Outbound",
          "Inbound / schedule",
          "Speak to staff"
        ]),
        q("Specialty", "Which specialty or facility?", ["I'll name it", "Not sure", "Speak to staff"]),
        q("Urgency", "Routine, soon, or urgent?", ["Routine", "Soon", "Urgent", "Speak to staff"]),
        ...confirmTool("update_patient_info", "Save referral", "Save referral details now?"),
        ...confirmTool("book_appointment", "Referral visit", "Book the referral visit if applicable?")
      ]
    ),
    intent(
      "status_records_imaging",
      "Status, records, or imaging logistics",
      ["referral status", "records", "imaging", "did you send"],
      [
        q("Which", "Referral status, medical records, or imaging logistics?", [
          "Status",
          "Records",
          "Imaging",
          "Speak to staff"
        ]),
        msg("Honest", "Known logistics only — I won't invent status.", summary),
        ...confirmTool("send_sms", "Status update", "Text a status summary?")
      ]
    ),
    intent(
      "referral_pa",
      "Prior auth for referral / procedure",
      ["prior auth", "authorization for specialist", "auth for imaging"],
      [
        q("PA need", "Start, check status, or denial?", ["Start", "Status", "Denial", "Speak to staff"]),
        ...confirmTool("update_patient_info", "Save PA", "Save prior-auth details?")
      ]
    ),
    intent(
      "dme_home_health",
      "DME or home health referral",
      ["dme", "wheelchair", "oxygen", "home health", "home nurse"],
      [
        q("Type", "DME equipment or home health / community services?", [
          "DME",
          "Home health",
          "Not sure",
          "Speak to staff"
        ]),
        ...confirmTool("update_patient_info", "Save request", "Save this coordination request?")
      ]
    ),
    intent(
      "second_opinion_transition",
      "Second opinion or transition of care",
      ["second opinion", "transition", "leaving hospital", "transfer care"],
      [
        q("Which", "Second opinion or transition of care?", [
          "Second opinion",
          "Transition of care",
          "Speak to staff"
        ]),
        ...confirmTool("update_patient_info", "Capture details", "Save those details for the team?")
      ]
    )
  ];
}

function fullFollowupIntents(summary) {
  return [
    intent(
      "feeling_check",
      "How I'm feeling after a visit",
      ["after my visit", "recovery", "still hurting", "feeling better"],
      [
        q("Trend", "Better, same, or worse?", ["Better", "Same", "Worse", "Speak to staff"]),
        q("Red flags", "Severe pain, breathing trouble, high fever, or new concerning symptoms?", [
          "No",
          "Yes — urgent",
          "Yes — emergency",
          "Speak to staff"
        ]),
        q("Action", "Advice, book follow-up, or talk to staff?", [
          "Advice",
          "Book follow-up",
          "Talk to staff"
        ])
      ]
    ),
    intent(
      "results_followup",
      "Labs / results follow-up",
      ["lab follow-up", "results", "test results"],
      [
        msg("Boundary", "Logistics and booking only — not result interpretation.", summary),
        q("Next", "Portal help, book review visit, or clinician callback?", [
          "Portal help",
          "Book review visit",
          "Clinician callback",
          "Speak to staff"
        ]),
        ...confirmTool("book_appointment", "Review visit", "Book a review visit?")
      ]
    ),
    intent(
      "adherence",
      "Care-plan or medication adherence",
      ["adherence", "care plan", "taking my meds"],
      [
        q("Focus", "Medications, care-plan goals, or both?", ["Medications", "Care plan", "Both", "Speak to staff"]),
        ...confirmTool("update_patient_info", "Note barriers", "Save barriers for the care team?")
      ]
    ),
    intent(
      "noshow_rebook",
      "Missed appointment / rebook",
      ["missed appointment", "no-show", "rebook", "couldn't come"],
      [
        q("Rebook", "Reschedule the missed visit?", ["Yes", "Cancel instead", "Not now", "Speak to staff"]),
        ...confirmTool("reschedule_appointment", "Rebook", "Reschedule now?"),
        ...confirmTool("cancel_appointment", "Cancel missed", "Cancel that appointment on file?")
      ]
    ),
    intent(
      "book_followup",
      "Book a follow-up visit",
      ["book follow-up", "return visit", "see the doctor again"],
      [...confirmTool("book_appointment", "Follow-up", "Book a follow-up visit now?")]
    )
  ];
}

function fullAfterhoursIntents(summary) {
  return [
    intent(
      "emergency",
      "Emergency now",
      ["911", "emergency", "can't breathe", "chest pain"],
      [
        msg(
          "911",
          "Please hang up and dial 911 or go to the nearest emergency room right away.",
          "Never delay emergency care."
        )
      ]
    ),
    intent(
      "urgent_tonight",
      "Urgent same-night concern",
      ["urgent", "tonight", "can't wait", "on call"],
      [
        q("Urgent type", "Clinical urgency, medication question, or other?", [
          "Clinical",
          "Medication",
          "Other",
          "Speak to staff"
        ]),
        msg("Guidance", "I'll share after-hours guidance from clinic policy — I won't invent on-call numbers.", summary),
        q("Next", "Instructions, priority message, or emergency redirect?", [
          "Instructions",
          "Priority message",
          "Emergency redirect",
          "Speak to staff"
        ])
      ]
    ),
    intent(
      "morning_message",
      "Leave a message for the morning team",
      ["leave a message", "callback tomorrow", "voicemail"],
      [
        q("Details", "Patient name, best callback number, and short reason?", [
          "I'll share now",
          "Speak to staff"
        ]),
        ...confirmTool("send_voicemail", "Save message", "Save this message for the morning team?")
      ]
    ),
    intent(
      "can_wait",
      "Can wait until open / hours question",
      ["can wait", "when do you open", "tomorrow", "not urgent"],
      [
        msg("Wait", "I'll note this for business hours and share opening information if helpful.", summary),
        ...confirmTool("send_sms", "Opening hours", "Text office-open information?"),
        q("Also message", "Also leave a morning callback message?", ["Yes", "No"])
      ]
    ),
    intent(
      "meds_refill_ah",
      "After-hours medication or refill message",
      ["refill", "medication question", "pharmacy hours"],
      [
        msg(
          "Policy",
          "I can take a message for daytime clinical review — I cannot approve controlled refills after hours.",
          summary
        ),
        ...confirmTool("send_voicemail", "Queue for daytime", "Queue this for the daytime team?")
      ]
    )
  ];
}

function fullCampaignIntents(summary) {
  return [
    intent(
      "engage_book",
      "Yes — take next step / book",
      ["yes", "book", "schedule", "I'm interested", "go ahead"],
      [
        msg("Purpose", `This outreach is about ${summary}.`, "Keep brief."),
        q("Action", "Book, reschedule an existing visit, update information, or get details by text?", [
          "Book",
          "Reschedule",
          "Update info",
          "Text details",
          "Speak to staff"
        ]),
        ...confirmTool("book_appointment", "Book from outreach", "Book now?"),
        ...confirmTool("reschedule_appointment", "Reschedule from outreach", "Reschedule now?"),
        ...confirmTool("update_patient_info", "Update from outreach", "Save updates now?")
      ]
    ),
    intent(
      "later",
      "Call me later / remind me",
      ["later", "busy", "call back", "remind me"],
      [
        q("When", "Later today, another day, or text instead?", [
          "Later today",
          "Another day",
          "Text me",
          "Speak to staff"
        ]),
        ...confirmTool("send_sms", "Reminder", "Send a reminder text?")
      ]
    ),
    intent(
      "confirm_cancel",
      "Confirm or cancel related visit",
      ["confirm", "cancel appointment", "can't come"],
      [
        q("Change", "Confirm you're coming, reschedule, or cancel?", [
          "Confirm",
          "Reschedule",
          "Cancel",
          "Speak to staff"
        ]),
        ...confirmTool("send_appointment_reminder", "Confirm", "Send confirmation?"),
        ...confirmTool("cancel_appointment", "Cancel", "Cancel now?")
      ]
    ),
    intent(
      "opt_out",
      "Not interested / opt out",
      ["no", "stop calling", "opt out", "remove me"],
      [
        msg("Respect", "Understood — I'll mark that preference.", "Honor immediately."),
        q("Confirm opt-out", "Opt out of this campaign type?", [
          "Yes, opt out",
          "Just this call",
          "Speak to staff"
        ])
      ]
    )
  ];
}

function fullReceptionistIntents(summary) {
  return [
    intent(
      "hours_access",
      "Hours, parking, or directions",
      ["hours", "open", "parking", "directions", "address", "map"],
      [
        q("Which", "Hours, holiday hours, parking, or directions?", [
          "Hours",
          "Holiday hours",
          "Parking",
          "Directions",
          "Speak to staff"
        ]),
        msg("Share", "I'll share accurate {{clinic_name}} access information.", summary),
        ...confirmTool("send_sms", "Text details", "Text those details?")
      ]
    ),
    intent(
      "providers_services",
      "Providers or services",
      ["doctor", "provider", "specialist", "services", "what do you treat"],
      [
        q("Need", "Specific provider, specialty, or services overview?", [
          "Specific provider",
          "Specialty",
          "Services overview",
          "Speak to staff"
        ]),
        msg("Guide", "High-level clinic information only — I won't invent availability.", summary),
        q("Book next", "Would you like help booking with scheduling next?", [
          "Yes, help book",
          "Not now",
          "Speak to staff"
        ])
      ]
    ),
    intent(
      "route_clinical",
      "Symptoms, refill, or clinical help",
      ["sick", "symptoms", "refill", "nurse", "urgent"],
      [
        msg("Route", "That sounds clinical — I'll route you to the right path without diagnosing.", summary),
        q("Clinical next", "Transfer to staff, leave a message, or describe the concern for routing?", [
          "Transfer to staff",
          "Leave a message",
          "Describe for routing",
          "Speak to staff"
        ])
      ]
    ),
    intent(
      "billing_insurance_route",
      "Billing or insurance question",
      ["bill", "insurance", "copay", "balance"],
      [
        q("Billing", "Acceptance FAQ, or route to billing for balance/denial/estimate?", [
          "Acceptance FAQ",
          "Route to billing topic",
          "Speak to staff"
        ]),
        msg("Honest", "I won't invent coverage or balances.", summary)
      ]
    ),
    intent(
      "forms_admin_dayof",
      "Forms, records, or day-of visit help",
      ["forms", "records", "running late", "check in", "lobby"],
      [
        q("Which", "Forms/records, arrival/check-in, or lobby delay?", [
          "Forms / records",
          "Arrival / check-in",
          "Lobby delay",
          "Speak to staff"
        ]),
        ...confirmTool("send_email", "Send instructions", "Email instructions?"),
        q("Schedule change", "Need to reschedule or cancel because of timing?", [
          "Reschedule",
          "Cancel",
          "No"
        ])
      ]
    )
  ];
}

function fullConciergeIntents(summary) {
  return [
    intent(
      "schedule_full",
      "Scheduling help (book / change / cancel)",
      ["appointment", "schedule", "book", "reschedule", "cancel"],
      [
        q("Schedule action", "Book, reschedule, cancel, or same-day?", [
          "Book",
          "Reschedule",
          "Cancel",
          "Same-day",
          "Speak to staff"
        ]),
        q("Where", "Location or telehealth?", ["Main location", "Another location", "Telehealth", "Not sure"]),
        ...confirmTool("book_appointment", "Concierge book", "Proceed with booking?"),
        ...confirmTool("reschedule_appointment", "Concierge reschedule", "Reschedule now?"),
        ...confirmTool("cancel_appointment", "Concierge cancel", "Cancel now?")
      ]
    ),
    intent(
      "intake_update",
      "Update my information / intake",
      ["update chart", "intake", "insurance card", "forms"],
      [
        q("What", "Contact, insurance, meds/allergies, or forms/consents?", [
          "Contact",
          "Insurance",
          "Meds / allergies",
          "Forms / consents",
          "Speak to staff"
        ]),
        ...confirmTool("update_patient_info", "Save updates", "Save updates now?")
      ]
    ),
    intent(
      "navigate",
      "Find location, provider, or care team",
      ["where are you", "which doctor", "care team", "directions"],
      [
        q("Nav", "Location, provider match, or care team?", [
          "Location",
          "Provider",
          "Care team",
          "Speak to staff"
        ]),
        ...confirmTool("send_sms", "Send details", "Text those details?")
      ]
    ),
    intent(
      "billing_route",
      "Billing or financial question",
      ["bill", "payment", "estimate", "insurance billing"],
      [
        msg("Route", "I can explain high-level policy and connect billing help.", summary),
        q("Next", "Payment help, estimate questions, or staff transfer?", [
          "Payment help",
          "Estimate",
          "Staff transfer",
          "Speak to staff"
        ]),
        ...confirmTool("collect_payment", "Payment", "Start payment help?")
      ]
    ),
    intent(
      "clinical_route",
      "Symptoms or clinical concern",
      ["sick", "symptoms", "urgent", "nurse"],
      [
        msg("Safety", "I won't diagnose — I'll route clinical needs safely.", summary),
        q("Connect", "Transfer to clinical staff or leave a priority message?", [
          "Transfer",
          "Priority message",
          "Speak to staff"
        ])
      ]
    )
  ];
}

const FULL_BY_TYPE = {
  receptionist: fullReceptionistIntents,
  scheduler: fullAppointmentIntents,
  intake: fullIntakeIntents,
  triage: fullTriageIntents,
  billing: fullBillingIntents,
  pharmacy: fullPharmacyIntents,
  lab: fullLabIntents,
  chronic_care: fullChronicIntents,
  pediatrics: fullPediatricsIntents,
  referral: fullReferralIntents,
  followup: fullFollowupIntents,
  afterhours: fullAfterhoursIntents,
  campaign: fullCampaignIntents,
  concierge: fullConciergeIntents
};

function intentPromptForType(typeId, summary) {
  const map = {
    receptionist:
      "I can help with hours and access, providers, clinical routing, billing questions, or forms/day-of needs — what do you need?",
    scheduler:
      "I can book, reschedule, cancel, help with same-day access, telehealth, or confirmations — what do you need?",
    intake:
      "I can update contact info, medications, allergies, insurance, consents, or run a complete intake packet — where should we start?",
    triage:
      "Is this an emergency, a symptom concern, a medication reaction, or do you need advice / a nurse callback?",
    billing:
      "I can help with balances and payments, payment plans, insurance or prior auth, estimates, or refunds — what do you need?",
    pharmacy:
      "I can help with refills, prior auth, pickup/transfer, side effects, controlled-substance policy, or med lists — what do you need?",
    lab: "Do you need prep, order status, results logistics, a review visit, or lab location options?",
    chronic_care:
      "Care check-in, adherence/refill needs, booking follow-up, care gaps, or worsening symptoms?",
    pediatrics:
      "Well-child or vaccines, sick/fever, forms, newborn follow-up, behavioral/teen topics, or change an existing visit?",
    referral:
      "New referral, status/records/imaging, prior auth, DME/home health, or second opinion / transition of care?",
    followup:
      "Feeling after a visit, results follow-up, adherence, missed appointment, or booking follow-up?",
    afterhours:
      "Emergency, urgent tonight, leave a morning message, can wait until open, or medication/refill message?",
    campaign: `This is about ${summary}. Book/take next step, call later, confirm/cancel a related visit, or opt out?`,
    concierge:
      "Scheduling, update information, find a location/provider, billing help, or a clinical concern?"
  };
  return map[typeId] || `How can I help you today with ${summary}?`;
}

function buildIntentBundle(template) {
  const typeId = String(template?.typeId || "receptionist");
  const summary = String(template?.summary || template?.name || "").trim();
  const builder = FULL_BY_TYPE[typeId] || fullReceptionistIntents;
  const intents = builder(summary);
  const catalog = intents.map(({ id, label, synonyms }) => ({
    id,
    label,
    synonyms: synonyms || []
  }));

  return {
    prompt: intentPromptForType(typeId, summary),
    intents,
    catalog
  };
}

module.exports = {
  buildPersona,
  buildIntentBundle,
  TYPE_PERSONAS,
  fullAppointmentIntents
};
