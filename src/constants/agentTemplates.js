/**
 * Medical agent template catalog (metadata + lazy graphSpec).
 * Graphs are resolved via resolveTemplateGraph → detailedTemplateGraph (≥15–20 nodes).
 * All templates are patient / medicine scoped.
 */

const { normalizeGraph } = require("../services/agentGraphBuilder");
const { resolveDetailedTemplateGraph } = require("../services/detailedTemplateGraph");
const { EXTRA_AGENT_TEMPLATES } = require("./agentTemplatesExtra");


const AGENT_TEMPLATES = [
  {
    "id": "receptionist-front-desk-hours",
    "typeId": "receptionist",
    "name": "Front desk hours & directions",
    "summary": "Answers clinic hours, holiday closures, and how to get to the office.",
    "description": "Use the “Front desk hours & directions” receptionist template when callers need open hours, holiday changes, or step-by-step directions without speaking to a medical assistant. In conversation, the agent shares weekday and weekend hours, lobby versus phone coverage, driving or transit directions, suite numbers, and parking tips drawn from clinic knowledge. Enabled tools typically include transfer to human, SMS, and email for sending map links, with clear escalation when the request exceeds the agent’s scope. This template is designed for primary care, pediatrics, and specialty outpatient sites that want high FAQ containment with a warm branded voice. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "transfer_to_human",
      "send_sms",
      "send_email"
    ],
    "suggestedVoice": "marin",
    "tags": [
      "hours",
      "directions",
      "faq",
      "front-desk"
    ],
    "graphSpec": {
      "greeting": "Thank you for calling. I can help with clinic hours and directions.",
      "steps": [
        {
          "type": "question",
          "label": "Need",
          "prompt": "Are you looking for hours, directions, or something else?",
          "options": [
            "Hours",
            "Directions",
            "Something else"
          ]
        },
        {
          "type": "message",
          "label": "Answer",
          "prompt": "Provide hours or directions from clinic knowledge clearly."
        },
        {
          "type": "question",
          "label": "Send link?",
          "prompt": "Would you like directions by text?",
          "options": [
            "Yes, text me",
            "No thanks"
          ]
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Send directions"
        }
      ],
      "closing": "Is there anything else I can help with today?"
    }
  },
  {
    "id": "receptionist-insurance-faq",
    "typeId": "receptionist",
    "name": "Insurance acceptance FAQ",
    "summary": "Explains accepted plans at a high level and when to verify benefits.",
    "description": "Use the “Insurance acceptance FAQ” receptionist template for pre-visit callers asking whether the clinic accepts their insurance plan. In conversation, the agent lists commonly accepted commercial, Medicare, and Medicaid plans, stresses that benefits still require verification, and explains self-pay options when a plan is not contracted. Enabled tools typically include email, SMS, and transfer to billing staff, with clear escalation when the request exceeds the agent’s scope. This template is designed for multi-payer US outpatient clinics that need consistent coverage messaging without overpromising benefits. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "transfer_to_human",
      "send_email",
      "send_sms"
    ],
    "suggestedVoice": "cedar",
    "tags": [
      "insurance",
      "faq",
      "payers"
    ],
    "graphSpec": {
      "greeting": "I can help with which insurance plans our clinic generally accepts.",
      "steps": [
        {
          "type": "question",
          "label": "Plan type",
          "prompt": "Is this commercial, Medicare, Medicaid, or self-pay?",
          "options": [
            "Commercial",
            "Medicare",
            "Medicaid",
            "Self-pay"
          ]
        },
        {
          "type": "message",
          "label": "Overview",
          "prompt": "Summarize acceptance for that category and note verification is still required."
        },
        {
          "type": "question",
          "label": "Next",
          "prompt": "Would you like a payer list emailed or to speak with billing?",
          "options": [
            "Email payer list",
            "Speak with billing",
            "All set"
          ]
        },
        {
          "type": "tool",
          "toolId": "send_email",
          "label": "Email payer list"
        }
      ],
      "closing": "Thank you for checking coverage with us."
    }
  },
  {
    "id": "receptionist-provider-list",
    "typeId": "receptionist",
    "name": "Provider directory helper",
    "summary": "Lists clinicians, specialties, languages, and new-patient availability.",
    "description": "Use the “Provider directory helper” receptionist template when patients ask who practices at the clinic and whether they are accepting new patients. In conversation, the agent presents provider names, credentials, specialties, languages, and new-patient status, then offers a handoff to scheduling when the caller is ready to book. Enabled tools typically include human transfer, SMS, and email for bio links, with clear escalation when the request exceeds the agent’s scope. This template is designed for group practices and multi-specialty outpatient centers with frequent directory questions. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "transfer_to_human",
      "send_sms",
      "send_email"
    ],
    "suggestedVoice": "coral",
    "tags": [
      "providers",
      "directory",
      "faq"
    ],
    "graphSpec": {
      "greeting": "I can help you learn about our providers and specialties.",
      "steps": [
        {
          "type": "question",
          "label": "Filter",
          "prompt": "Looking for a specialty, language, or a named clinician?",
          "options": [
            "Specialty",
            "Language",
            "Named clinician",
            "Browse"
          ]
        },
        {
          "type": "message",
          "label": "Directory",
          "prompt": "Share matching providers and new-patient status."
        },
        {
          "type": "question",
          "label": "Book?",
          "prompt": "Would you like to be transferred to scheduling?",
          "options": [
            "Yes, transfer",
            "Send me the list",
            "Not now"
          ]
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Transfer to scheduling"
        }
      ],
      "closing": "Happy to help you find the right clinician."
    }
  },
  {
    "id": "receptionist-new-patient-welcome",
    "typeId": "receptionist",
    "name": "New patient welcome & what to bring",
    "summary": "Welcomes new patients and explains prep items for the first visit.",
    "description": "Use the “New patient welcome & what to bring” receptionist template to orient first-time patients before their initial appointment. In conversation, the agent covers arrival time, photo ID, insurance cards, medication lists, referral paperwork, portal forms, and check-in expectations. Enabled tools typically include SMS checklist delivery, email portal instructions, patient info updates, and human transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for family medicine and specialty clinics that want fewer incomplete first visits and clearer onboarding. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_sms",
      "send_email",
      "transfer_to_human",
      "update_patient_info"
    ],
    "suggestedVoice": "marin",
    "tags": [
      "new-patient",
      "welcome",
      "prep"
    ],
    "graphSpec": {
      "greeting": "Welcome to our clinic. I can explain what to bring to your first visit.",
      "steps": [
        {
          "type": "message",
          "label": "What to bring",
          "prompt": "Explain ID, insurance cards, medication list, referrals, and arrival time."
        },
        {
          "type": "question",
          "label": "Checklist",
          "prompt": "Would you like a checklist by text?",
          "options": [
            "Yes, text me",
            "Email instead",
            "No thanks"
          ]
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Send checklist"
        }
      ],
      "closing": "We look forward to seeing you at your first visit."
    }
  },
  {
    "id": "receptionist-rx-refill-routing",
    "typeId": "receptionist",
    "name": "Prescription refill request routing",
    "summary": "Captures refill requests and routes them to the right clinical queue.",
    "description": "Use the “Prescription refill request routing” receptionist template for refill callers who need structured routing rather than clinical advice from the front desk. In conversation, the agent collects medication name, dose if offered, pharmacy, and urgency; states that clinicians must approve refills; and escalates side-effect or controlled-substance concerns. Enabled tools typically include SMS confirmation, patient info updates, and transfer to the refill queue, with clear escalation when the request exceeds the agent’s scope. This template is designed for outpatient clinics with high refill volume that want clean handoffs into nursing workflows. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "transfer_to_human",
      "send_sms",
      "update_patient_info"
    ],
    "suggestedVoice": "sage",
    "tags": [
      "refill",
      "pharmacy",
      "routing"
    ],
    "graphSpec": {
      "greeting": "I can submit a prescription refill request for clinical review. I cannot approve refills myself.",
      "steps": [
        {
          "type": "question",
          "label": "Urgency",
          "prompt": "Are you out of medication today, or is this a routine refill?",
          "options": [
            "Out today",
            "Routine refill",
            "Having side effects"
          ]
        },
        {
          "type": "message",
          "label": "Details",
          "prompt": "Ask for medication name, dose, pharmacy, and last fill date if known."
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Confirm received"
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Route to refill queue"
        }
      ],
      "closing": "A clinical team member will review your refill request."
    }
  },
  {
    "id": "receptionist-wait-times",
    "typeId": "receptionist",
    "name": "Lobby wait times & delay notices",
    "summary": "Shares estimated wait times and offers reschedule options when delayed.",
    "description": "Use the “Lobby wait times & delay notices” receptionist template on busy clinic days when patients ask about lobby waits or delayed sessions. In conversation, the agent shares high-level wait guidance with caveats, offers to keep the visit, reschedule, or speak with the front desk, and avoids inventing precise minute counts. Enabled tools typically include reschedule appointment, SMS updates, and human transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for high-volume primary care and outpatient sites managing late-running sessions and overflow. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "transfer_to_human",
      "send_sms",
      "reschedule_appointment"
    ],
    "suggestedVoice": "echo",
    "tags": [
      "wait-times",
      "lobby",
      "delays"
    ],
    "graphSpec": {
      "greeting": "I can share current wait guidance and help adjust your visit if needed.",
      "steps": [
        {
          "type": "message",
          "label": "Wait estimate",
          "prompt": "Share latest delay guidance and note that times change."
        },
        {
          "type": "question",
          "label": "Adjust?",
          "prompt": "Keep your visit, reschedule, or speak with the front desk?",
          "options": [
            "Keep visit",
            "Reschedule",
            "Front desk"
          ]
        },
        {
          "type": "tool",
          "toolId": "reschedule_appointment",
          "label": "Reschedule"
        }
      ],
      "closing": "Thank you for your patience with our clinic schedule."
    }
  },
  {
    "id": "receptionist-parking-access",
    "typeId": "receptionist",
    "name": "Parking & building access",
    "summary": "Explains parking lots, validation, elevators, and accessibility entrances.",
    "description": "Use the “Parking & building access” receptionist template for campus wayfinding calls about parking, elevators, and accessible entrances. In conversation, the agent explains visitor lots, validation, shuttle notes, suite numbers, after-hours doors, wheelchair access, and drop-off zones. Enabled tools typically include SMS map links, email, and transfer to the security or front desk, with clear escalation when the request exceeds the agent’s scope. This template is designed for hospital-campus outpatient buildings and multi-tower medical offices with frequent navigation questions. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_sms",
      "send_email",
      "transfer_to_human"
    ],
    "suggestedVoice": "alloy",
    "tags": [
      "parking",
      "access",
      "accessibility"
    ],
    "graphSpec": {
      "greeting": "I can help with parking, building entrances, and suite directions.",
      "steps": [
        {
          "type": "question",
          "label": "Topic",
          "prompt": "Parking, accessibility access, or suite directions?",
          "options": [
            "Parking",
            "Accessibility",
            "Suite directions"
          ]
        },
        {
          "type": "message",
          "label": "Access answer",
          "prompt": "Provide matching campus guidance and offer a map link."
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Text map link"
        }
      ],
      "closing": "Ask the front desk for help once you arrive if you need it."
    }
  },
  {
    "id": "receptionist-holiday-hours",
    "typeId": "receptionist",
    "name": "Holiday hours & closure calendar",
    "summary": "Announces holiday closures, modified hours, and urgent alternatives.",
    "description": "Use the “Holiday hours & closure calendar” receptionist template around US holidays when closure and modified-hours questions spike. In conversation, the agent lists holiday hours, early closures, which services remain open, and urgent-care or on-call alternatives, always prioritizing 911 for emergencies. Enabled tools typically include email schedule summaries, SMS, voicemail, and human transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for outpatient groups that publish annual holiday calendars and need consistent multi-channel messaging. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_email",
      "send_sms",
      "transfer_to_human",
      "send_voicemail"
    ],
    "suggestedVoice": "ash",
    "tags": [
      "holiday",
      "hours",
      "closures"
    ],
    "graphSpec": {
      "greeting": "I can share holiday hours and what to do if you need care while we are closed.",
      "steps": [
        {
          "type": "message",
          "label": "Holiday schedule",
          "prompt": "List upcoming holiday closures and modified hours."
        },
        {
          "type": "question",
          "label": "Need care?",
          "prompt": "Need care guidance now, or just the schedule?",
          "options": [
            "Need care guidance",
            "Just the schedule",
            "Speak to someone"
          ]
        },
        {
          "type": "message",
          "label": "Alternatives",
          "prompt": "Explain urgent care options and emphasize 911 for emergencies."
        },
        {
          "type": "tool",
          "toolId": "send_email",
          "label": "Email holiday schedule"
        }
      ],
      "closing": "Thank you for checking our holiday hours."
    }
  },
  {
    "id": "receptionist-general-faq",
    "typeId": "receptionist",
    "name": "General clinic FAQ concierge",
    "summary": "Catch-all FAQ for services, forms, fax numbers, and office policies.",
    "description": "Use the “General clinic FAQ concierge” receptionist template as a broad first-line FAQ when callers are unsure which department they need. In conversation, the agent answers services, new-patient policies, records fax numbers, forms, visitor rules, and routing to nursing versus billing, escalating clinical concerns instead of guessing. Enabled tools typically include human transfer, SMS of portal links, and email of policy summaries, with clear escalation when the request exceeds the agent’s scope. This template is designed for clinics launching their first medical voice agent and wanting safe, broad deflection. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "transfer_to_human",
      "send_sms",
      "send_email"
    ],
    "suggestedVoice": "marin",
    "tags": [
      "faq",
      "policies",
      "general"
    ],
    "graphSpec": {
      "greeting": "Thanks for calling. I can help with common questions or connect you to the right team.",
      "steps": [
        {
          "type": "question",
          "label": "Topic",
          "prompt": "What can I help with today?",
          "options": [
            "Services & policies",
            "Forms & records",
            "Billing",
            "Clinical concern"
          ]
        },
        {
          "type": "message",
          "label": "FAQ answer",
          "prompt": "Answer non-clinical topics from knowledge; prepare warm transfer for clinical concerns."
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Transfer if needed"
        }
      ],
      "closing": "Please call again if another question comes up."
    }
  },
  {
    "id": "scheduler-new-visit-book",
    "typeId": "scheduler",
    "name": "New visit booking",
    "summary": "Books a new outpatient visit with reason, provider preference, and slot.",
    "description": "Use the “New visit booking” scheduler template as the primary booking flow for patients ready to schedule a new office visit. In conversation, the agent confirms identity, collects visit reason, preferred clinician or first available, modality, and date windows, then books and confirms location or video instructions. Enabled tools typically include book appointment, appointment reminders, and human transfer when slots or auth block booking, with clear escalation when the request exceeds the agent’s scope. This template is designed for primary care and specialty clinics enabling self-service scheduling on phone or chat. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "send_appointment_reminder",
      "transfer_to_human"
    ],
    "suggestedVoice": "cedar",
    "tags": [
      "booking",
      "new-visit",
      "calendar"
    ],
    "graphSpec": {
      "greeting": "I can help you book a new visit with our clinic.",
      "steps": [
        {
          "type": "message",
          "label": "Identify",
          "prompt": "Confirm patient name and date of birth, then ask for the visit reason."
        },
        {
          "type": "question",
          "label": "Preference",
          "prompt": "Preferred provider, or first available?",
          "options": [
            "Preferred provider",
            "First available",
            "Not sure"
          ]
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book visit"
        },
        {
          "type": "tool",
          "toolId": "send_appointment_reminder",
          "label": "Send confirmation"
        }
      ],
      "closing": "Your visit is confirmed. Please arrive a few minutes early with ID and insurance."
    }
  },
  {
    "id": "scheduler-reschedule",
    "typeId": "scheduler",
    "name": "Appointment reschedule",
    "summary": "Moves an existing appointment to a new date and time.",
    "description": "Use the “Appointment reschedule” scheduler template when patients need to change an upcoming visit without canceling care entirely. In conversation, the agent locates the appointment, reviews reschedule policy at a high level, offers new slots, commits the change, and sends confirmation. Enabled tools typically include reschedule appointment, reminders, and human transfer for complex blocks, with clear escalation when the request exceeds the agent’s scope. This template is designed for clinics that want patients to self-manage schedule changes and reduce phone-tree backlog. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "reschedule_appointment",
      "send_appointment_reminder",
      "transfer_to_human"
    ],
    "suggestedVoice": "echo",
    "tags": [
      "reschedule",
      "calendar"
    ],
    "graphSpec": {
      "greeting": "I can help reschedule an existing appointment.",
      "steps": [
        {
          "type": "message",
          "label": "Find visit",
          "prompt": "Confirm identity and which appointment to move."
        },
        {
          "type": "question",
          "label": "Window",
          "prompt": "What timing works better?",
          "options": [
            "This week",
            "Next week",
            "Flexible"
          ]
        },
        {
          "type": "tool",
          "toolId": "reschedule_appointment",
          "label": "Reschedule"
        },
        {
          "type": "tool",
          "toolId": "send_appointment_reminder",
          "label": "Confirm new time"
        }
      ],
      "closing": "Your appointment has been moved. We will see you at the new time."
    }
  },
  {
    "id": "scheduler-cancel",
    "typeId": "scheduler",
    "name": "Appointment cancellation",
    "summary": "Cancels a visit, captures reason, and offers rebooking.",
    "description": "Use the “Appointment cancellation” scheduler template for patients who must cancel and where you want structured reasons plus an easy rebook path. In conversation, the agent confirms the appointment, captures a brief reason, cancels via tool, and offers to book a future slot. Enabled tools typically include cancel appointment, book appointment, SMS confirmation, and human transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for practices focused on converting cancellations into future visits instead of no-shows. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "cancel_appointment",
      "book_appointment",
      "send_sms",
      "transfer_to_human"
    ],
    "suggestedVoice": "sage",
    "tags": [
      "cancel",
      "no-show-prevention"
    ],
    "graphSpec": {
      "greeting": "I can help cancel an appointment and, if you like, find another time.",
      "steps": [
        {
          "type": "message",
          "label": "Confirm visit",
          "prompt": "Confirm which appointment to cancel and capture a brief reason."
        },
        {
          "type": "tool",
          "toolId": "cancel_appointment",
          "label": "Cancel"
        },
        {
          "type": "question",
          "label": "Rebook?",
          "prompt": "Would you like to schedule a new visit now?",
          "options": [
            "Yes, rebook",
            "Not now",
            "Speak with staff"
          ]
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Rebook"
        }
      ],
      "closing": "Your cancellation is complete. Take care."
    }
  },
  {
    "id": "scheduler-same-day",
    "typeId": "scheduler",
    "name": "Same-day visit finder",
    "summary": "Finds same-day openings for acute but non-emergent needs.",
    "description": "Use the “Same-day visit finder” scheduler template for callers who need to be seen today for non-emergency problems. In conversation, the agent screens emergencies with 911 language, checks same-day capacity, books in-clinic or telehealth slots, and offers next-day or urgent-care guidance when full. Enabled tools typically include book appointment, reminders, and immediate human transfer for red flags, with clear escalation when the request exceeds the agent’s scope. This template is designed for primary care clinics protecting nurse lines from pure scheduling while preserving timely access. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "transfer_to_human",
      "send_appointment_reminder"
    ],
    "suggestedVoice": "ash",
    "tags": [
      "same-day",
      "acute",
      "access"
    ],
    "graphSpec": {
      "greeting": "I can look for a same-day appointment. If this is an emergency, please hang up and dial 911.",
      "steps": [
        {
          "type": "question",
          "label": "Emergency screen",
          "prompt": "Are you having chest pain, trouble breathing, or severe bleeding?",
          "options": [
            "No",
            "Yes — emergency"
          ]
        },
        {
          "type": "message",
          "label": "Need",
          "prompt": "Ask briefly what needs to be addressed today."
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book same-day"
        },
        {
          "type": "tool",
          "toolId": "send_appointment_reminder",
          "label": "Confirm"
        }
      ],
      "closing": "You are booked for today. Arrive on time with your ID and insurance card."
    }
  },
  {
    "id": "scheduler-followup-visit",
    "typeId": "scheduler",
    "name": "Follow-up visit booking",
    "summary": "Schedules clinician-recommended follow-up visits within a target window.",
    "description": "Use the “Follow-up visit booking” scheduler template for patients told to return within a specific timeframe after a visit, procedure, or discharge. In conversation, the agent confirms the recommended window and clinician, books the follow-up, attaches reminders, and transfers when timing guidance is unclear. Enabled tools typically include book appointment, reminders, SMS prep tips, and human transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for chronic disease clinics and post-procedure pathways with protocolized return visits. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "send_appointment_reminder",
      "send_sms",
      "transfer_to_human"
    ],
    "suggestedVoice": "marin",
    "tags": [
      "follow-up",
      "booking"
    ],
    "graphSpec": {
      "greeting": "I can help schedule the follow-up visit your clinician recommended.",
      "steps": [
        {
          "type": "message",
          "label": "Window",
          "prompt": "Confirm the recommended timeframe and provider."
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book follow-up"
        },
        {
          "type": "tool",
          "toolId": "send_appointment_reminder",
          "label": "Send reminder"
        }
      ],
      "closing": "Your follow-up is on the calendar. We look forward to seeing you."
    }
  },
  {
    "id": "scheduler-specialist-slot",
    "typeId": "scheduler",
    "name": "Specialist appointment slotting",
    "summary": "Books specialty visits with referral and authorization checks.",
    "description": "Use the “Specialist appointment slotting” scheduler template when scheduling specialty clinics where referrals, prior auth, or longer visit types matter. In conversation, the agent collects referring provider info if required, preferred specialist, urgency, and insurance constraints, then books an appropriate slot length. Enabled tools typically include book appointment, reminders, email prep, and transfer to referral coordinators, with clear escalation when the request exceeds the agent’s scope. This template is designed for multi-specialty groups and specialty outpatient departments with gated scheduling rules. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "transfer_to_human",
      "send_email",
      "send_appointment_reminder"
    ],
    "suggestedVoice": "cedar",
    "tags": [
      "specialty",
      "referral",
      "booking"
    ],
    "graphSpec": {
      "greeting": "I can help schedule a specialty appointment and check what paperwork we need.",
      "steps": [
        {
          "type": "question",
          "label": "Referral",
          "prompt": "Do you already have a referral for this specialty visit?",
          "options": [
            "Yes",
            "No",
            "Not sure"
          ]
        },
        {
          "type": "message",
          "label": "Details",
          "prompt": "Collect specialty, preferred clinician, and urgency."
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book specialty slot"
        },
        {
          "type": "tool",
          "toolId": "send_appointment_reminder",
          "label": "Confirm"
        }
      ],
      "closing": "Your specialty visit is scheduled. Bring any referral paperwork to the appointment."
    }
  },
  {
    "id": "scheduler-pediatric-well-child",
    "typeId": "scheduler",
    "name": "Pediatric well-child scheduling",
    "summary": "Books well-child visits with age-based slot guidance and guardian details.",
    "description": "Use the “Pediatric well-child scheduling” scheduler template for pediatric practices scheduling routine well-child checks across ages. In conversation, the agent confirms the child’s identity, age-based visit type, guardian contact, and vaccine-visit expectations, then books and reminds guardians what to bring. Enabled tools typically include book appointment, reminders, SMS, and transfer for catch-up vaccine complexity, with clear escalation when the request exceeds the agent’s scope. This template is designed for busy pediatric outpatient clinics and family medicine sites with large pediatric panels. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "send_appointment_reminder",
      "send_sms",
      "transfer_to_human"
    ],
    "suggestedVoice": "coral",
    "tags": [
      "pediatrics",
      "well-child",
      "booking"
    ],
    "graphSpec": {
      "greeting": "I can help schedule a well-child visit for your child.",
      "steps": [
        {
          "type": "message",
          "label": "Child details",
          "prompt": "Confirm child name, date of birth, and guardian contact."
        },
        {
          "type": "question",
          "label": "Visit type",
          "prompt": "Routine well-child check or vaccine-focused visit?",
          "options": [
            "Well-child",
            "Vaccines",
            "Not sure"
          ]
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book well-child"
        },
        {
          "type": "tool",
          "toolId": "send_appointment_reminder",
          "label": "Remind guardian"
        }
      ],
      "closing": "Please bring your child's insurance card and vaccine record if you have it."
    }
  },
  {
    "id": "scheduler-annual-physical",
    "typeId": "scheduler",
    "name": "Annual physical / wellness visit",
    "summary": "Schedules preventive physicals and distinguishes them from problem visits.",
    "description": "Use the “Annual physical / wellness visit” scheduler template for adults requesting an annual physical, Medicare wellness visit, or preventive checkup. In conversation, the agent explains that preventive visits may differ from problem-focused visits for billing, asks about active concerns, books the correct visit type, and shares prep notes. Enabled tools typically include book appointment, reminders, email prep, and human transfer for combined problem visits, with clear escalation when the request exceeds the agent’s scope. This template is designed for primary care clinics growing preventive visit completion with accurate patient expectations. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "send_appointment_reminder",
      "send_email",
      "transfer_to_human"
    ],
    "suggestedVoice": "ballad",
    "tags": [
      "physical",
      "wellness",
      "preventive"
    ],
    "graphSpec": {
      "greeting": "I can help schedule your annual physical or wellness visit.",
      "steps": [
        {
          "type": "question",
          "label": "Concerns",
          "prompt": "Preventive only, or do you also have a new concern?",
          "options": [
            "Preventive only",
            "Also have concerns",
            "Not sure"
          ]
        },
        {
          "type": "message",
          "label": "Expectations",
          "prompt": "Set expectations about visit type and any prep such as fasting labs."
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book physical"
        },
        {
          "type": "tool",
          "toolId": "send_appointment_reminder",
          "label": "Confirm"
        }
      ],
      "closing": "Your wellness visit is booked. We will remind you beforehand."
    }
  },
  {
    "id": "scheduler-telehealth-book",
    "typeId": "scheduler",
    "name": "Telehealth visit booking",
    "summary": "Books video visits and confirms device readiness and join instructions.",
    "description": "Use the “Telehealth visit booking” scheduler template when patients prefer a virtual visit or policy routes certain concerns to telehealth first. In conversation, the agent confirms telehealth eligibility at a policy level, books a video slot, verifies contact info, sends join-link instructions, and offers a brief tech-check. Enabled tools typically include book appointment, reminders, SMS, email, and transfer for platform troubleshooting, with clear escalation when the request exceeds the agent’s scope. This template is designed for hybrid primary care and specialty clinics expanding virtual access. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "send_appointment_reminder",
      "send_sms",
      "send_email",
      "transfer_to_human"
    ],
    "suggestedVoice": "shimmer",
    "tags": [
      "telehealth",
      "video",
      "booking"
    ],
    "graphSpec": {
      "greeting": "I can book a telehealth visit and send you join instructions.",
      "steps": [
        {
          "type": "message",
          "label": "Eligibility",
          "prompt": "Confirm the concern is appropriate for telehealth; escalate emergencies."
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book telehealth"
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Send join instructions"
        },
        {
          "type": "question",
          "label": "Tech check",
          "prompt": "Would you like quick tips for testing camera and microphone?",
          "options": [
            "Yes",
            "No"
          ]
        }
      ],
      "closing": "Join a few minutes early so we can help with connection issues."
    }
  },
  {
    "id": "intake-new-patient-demographics",
    "typeId": "intake",
    "name": "New patient demographics capture",
    "summary": "Collects legal name, DOB, contacts, address, and emergency contact.",
    "description": "Use the “New patient demographics capture” intake template before a first visit when registration staff want cleaner charts with less lobby time. In conversation, the agent walks through legal name, preferred name, date of birth, phones, email, mailing address, preferred pharmacy, and emergency contact, then saves updates. Enabled tools typically include update patient info, SMS confirmation, email summary, and human transfer for identity mismatches, with clear escalation when the request exceeds the agent’s scope. This template is designed for outpatient clinics onboarding new patients by phone or chat before arrival. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "update_patient_info",
      "send_sms",
      "send_email",
      "transfer_to_human"
    ],
    "suggestedVoice": "marin",
    "tags": [
      "demographics",
      "registration",
      "new-patient"
    ],
    "graphSpec": {
      "greeting": "I can help collect your registration details before your first visit.",
      "steps": [
        {
          "type": "message",
          "label": "Identity",
          "prompt": "Collect legal name, preferred name, and date of birth."
        },
        {
          "type": "message",
          "label": "Contacts",
          "prompt": "Collect phone, email, address, and emergency contact."
        },
        {
          "type": "tool",
          "toolId": "update_patient_info",
          "label": "Save demographics"
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Confirm saved"
        }
      ],
      "closing": "Thanks for completing your registration details."
    }
  },
  {
    "id": "intake-insurance-capture",
    "typeId": "intake",
    "name": "Insurance card & subscriber capture",
    "summary": "Captures payer, member ID, group number, and subscriber relationship.",
    "description": "Use the “Insurance card & subscriber capture” intake template to gather insurance details ahead of visits and reduce front-desk bottlenecks. In conversation, the agent collects primary and secondary payer names, member IDs, group numbers, subscriber name and DOB, and relationship to patient, then stores the record. Enabled tools typically include update patient info, email for card photos if policy allows, SMS, and billing transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for US outpatient clinics with multi-payer panels and frequent eligibility rework. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "update_patient_info",
      "send_email",
      "send_sms",
      "transfer_to_human"
    ],
    "suggestedVoice": "cedar",
    "tags": [
      "insurance",
      "eligibility",
      "intake"
    ],
    "graphSpec": {
      "greeting": "I can collect your insurance details so we can verify benefits before your visit.",
      "steps": [
        {
          "type": "message",
          "label": "Primary plan",
          "prompt": "Collect payer name, member ID, group number, and subscriber info."
        },
        {
          "type": "question",
          "label": "Secondary?",
          "prompt": "Do you also have secondary coverage?",
          "options": [
            "Yes",
            "No"
          ]
        },
        {
          "type": "tool",
          "toolId": "update_patient_info",
          "label": "Save insurance"
        },
        {
          "type": "tool",
          "toolId": "send_email",
          "label": "Email next steps"
        }
      ],
      "closing": "We will verify benefits and contact you if anything looks incomplete."
    }
  },
  {
    "id": "intake-medication-list",
    "typeId": "intake",
    "name": "Medication list intake",
    "summary": "Builds a current medication list including dose, frequency, and pharmacy.",
    "description": "Use the “Medication list intake” intake template for pre-visit medication reconciliation support without providing clinical dosing advice. In conversation, the agent asks for prescription and OTC medications, doses and frequencies if known, prescribing clinicians when offered, and preferred pharmacy, then saves the list. Enabled tools typically include update patient info, SMS of the captured list for patient review, and nursing transfer for unclear regimens, with clear escalation when the request exceeds the agent’s scope. This template is designed for primary care and specialty clinics that want better med lists before clinician review. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "update_patient_info",
      "send_sms",
      "transfer_to_human"
    ],
    "suggestedVoice": "sage",
    "tags": [
      "medications",
      "reconciliation",
      "intake"
    ],
    "graphSpec": {
      "greeting": "I can help capture your current medication list for your chart.",
      "steps": [
        {
          "type": "message",
          "label": "Meds",
          "prompt": "Collect medication names, doses, frequencies, and pharmacy."
        },
        {
          "type": "question",
          "label": "OTC",
          "prompt": "Any vitamins, supplements, or over-the-counter medicines to add?",
          "options": [
            "Yes",
            "No"
          ]
        },
        {
          "type": "tool",
          "toolId": "update_patient_info",
          "label": "Save medication list"
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Text list for review"
        }
      ],
      "closing": "Your clinician will review this list at your visit."
    }
  },
  {
    "id": "intake-allergy-check",
    "typeId": "intake",
    "name": "Allergy & reaction check",
    "summary": "Documents drug, food, and environmental allergies with reaction details.",
    "description": "Use the “Allergy & reaction check” intake template during pre-visit intake when allergy documentation is incomplete or outdated. In conversation, the agent asks about medication, food, and environmental allergies, reaction type and severity if known, and whether an epinephrine prescription exists, then updates the chart fields. Enabled tools typically include update patient info and immediate transfer for active allergic reactions, with clear escalation when the request exceeds the agent’s scope. This template is designed for any outpatient clinic that needs reliable allergy data before prescribing or procedures. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "update_patient_info",
      "transfer_to_human",
      "send_sms"
    ],
    "suggestedVoice": "echo",
    "tags": [
      "allergies",
      "safety",
      "intake"
    ],
    "graphSpec": {
      "greeting": "I can update your allergy information for your medical record.",
      "steps": [
        {
          "type": "question",
          "label": "Any allergies?",
          "prompt": "Do you have any medication, food, or environmental allergies?",
          "options": [
            "Yes",
            "No known allergies",
            "Not sure"
          ]
        },
        {
          "type": "message",
          "label": "Details",
          "prompt": "Collect allergen names and reaction details if allergies exist."
        },
        {
          "type": "tool",
          "toolId": "update_patient_info",
          "label": "Save allergies"
        }
      ],
      "closing": "Thank you. Please tell your clinician about any new reactions."
    }
  },
  {
    "id": "intake-consent-forms",
    "typeId": "intake",
    "name": "Consent & treatment authorization",
    "summary": "Walks through treatment consent and financial responsibility acknowledgements.",
    "description": "Use the “Consent & treatment authorization” intake template to complete standard consents before an in-person or telehealth encounter. In conversation, the agent summarizes treatment consent, financial responsibility, and communication preferences in plain language, records acknowledgements, and flags questions for staff. Enabled tools typically include update patient info, email consent summaries, and human transfer for legal questions, with clear escalation when the request exceeds the agent’s scope. This template is designed for clinics reducing clipboard time while keeping consent documentation auditable. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "update_patient_info",
      "send_email",
      "transfer_to_human"
    ],
    "suggestedVoice": "alloy",
    "tags": [
      "consent",
      "forms",
      "intake"
    ],
    "graphSpec": {
      "greeting": "I can walk you through our standard consent and financial forms.",
      "steps": [
        {
          "type": "message",
          "label": "Consent summary",
          "prompt": "Summarize treatment consent and financial responsibility in plain language."
        },
        {
          "type": "question",
          "label": "Agree?",
          "prompt": "Do you acknowledge and agree to these terms?",
          "options": [
            "I agree",
            "I have questions",
            "Prefer to speak with staff"
          ]
        },
        {
          "type": "tool",
          "toolId": "update_patient_info",
          "label": "Record acknowledgement"
        },
        {
          "type": "tool",
          "toolId": "send_email",
          "label": "Email copy"
        }
      ],
      "closing": "Your acknowledgements have been recorded. Thank you."
    }
  },
  {
    "id": "intake-telehealth-tech-check",
    "typeId": "intake",
    "name": "Telehealth technology check",
    "summary": "Confirms device, browser, camera, mic, and quiet space before a video visit.",
    "description": "Use the “Telehealth technology check” intake template the day before or morning of a telehealth appointment to reduce failed video starts. In conversation, the agent checks device type, app or browser readiness, camera and microphone access, lighting, and a private space, then sends join tips or escalates tech support. Enabled tools typically include SMS join tips, email instructions, patient contact updates, and human transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for hybrid clinics with meaningful telehealth volume and older adult panels. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_sms",
      "send_email",
      "update_patient_info",
      "transfer_to_human"
    ],
    "suggestedVoice": "shimmer",
    "tags": [
      "telehealth",
      "tech-check",
      "intake"
    ],
    "graphSpec": {
      "greeting": "Let's make sure your device is ready for your telehealth visit.",
      "steps": [
        {
          "type": "question",
          "label": "Device",
          "prompt": "Will you join from a smartphone, tablet, or computer?",
          "options": [
            "Smartphone",
            "Tablet",
            "Computer"
          ]
        },
        {
          "type": "message",
          "label": "Checklist",
          "prompt": "Guide camera, mic, browser or app, and private space checks."
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Send join tips"
        },
        {
          "type": "question",
          "label": "Stuck?",
          "prompt": "Do you need a staff member for tech help?",
          "options": [
            "Yes, transfer",
            "I'm ready"
          ]
        }
      ],
      "closing": "You are set for your video visit. Join a few minutes early."
    }
  },
  {
    "id": "intake-referral-intake",
    "typeId": "intake",
    "name": "Referral paperwork intake",
    "summary": "Collects referring provider, reason, and attached authorization details.",
    "description": "Use the “Referral paperwork intake” intake template for inbound referred patients before their first specialty visit. In conversation, the agent captures referring clinician, specialty requested, clinical reason at a high level, auth numbers if known, and preferred appointment windows, then updates records. Enabled tools typically include update patient info, email missing-docs checklist, and transfer to referral desk, with clear escalation when the request exceeds the agent’s scope. This template is designed for specialty outpatient departments that lose time chasing incomplete referral packets. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "update_patient_info",
      "send_email",
      "transfer_to_human"
    ],
    "suggestedVoice": "cedar",
    "tags": [
      "referral",
      "paperwork",
      "intake"
    ],
    "graphSpec": {
      "greeting": "I can help collect referral details so we can prepare your specialty visit.",
      "steps": [
        {
          "type": "message",
          "label": "Referral source",
          "prompt": "Collect referring provider, specialty, and reason for referral."
        },
        {
          "type": "question",
          "label": "Auth",
          "prompt": "Do you have a prior authorization or referral number?",
          "options": [
            "Yes",
            "No",
            "Not sure"
          ]
        },
        {
          "type": "tool",
          "toolId": "update_patient_info",
          "label": "Save referral intake"
        },
        {
          "type": "tool",
          "toolId": "send_email",
          "label": "Email missing docs list"
        }
      ],
      "closing": "Thank you. Our referral team will review and follow up if anything is missing."
    }
  },
  {
    "id": "intake-symptoms-form",
    "typeId": "intake",
    "name": "Pre-visit symptoms questionnaire",
    "summary": "Captures chief complaint, onset, severity, and related symptoms for the chart.",
    "description": "Use the “Pre-visit symptoms questionnaire” intake template to structure a pre-visit symptom form without diagnosing or prescribing. In conversation, the agent asks chief complaint, onset, severity, associated symptoms, and what makes it better or worse, documents answers, and escalates red flags immediately. Enabled tools typically include update patient info, SMS of answers for patient confirmation, and urgent human transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for primary care and specialty clinics that want richer chief-complaint context before rooming. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "update_patient_info",
      "send_sms",
      "transfer_to_human"
    ],
    "suggestedVoice": "verse",
    "tags": [
      "symptoms",
      "questionnaire",
      "intake"
    ],
    "graphSpec": {
      "greeting": "I can capture your symptoms for your clinician. This is not a diagnosis.",
      "steps": [
        {
          "type": "message",
          "label": "Chief complaint",
          "prompt": "Ask what brings them in, onset, and severity."
        },
        {
          "type": "question",
          "label": "Red flags",
          "prompt": "Any chest pain, trouble breathing, or severe bleeding right now?",
          "options": [
            "No",
            "Yes"
          ]
        },
        {
          "type": "tool",
          "toolId": "update_patient_info",
          "label": "Save symptom answers"
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Confirm captured"
        }
      ],
      "closing": "Your answers will be available for your clinician at the visit."
    }
  },
  {
    "id": "intake-hipaa-notice",
    "typeId": "intake",
    "name": "HIPAA notice acknowledgement",
    "summary": "Delivers Notice of Privacy Practices summary and records acknowledgement.",
    "description": "Use the “HIPAA notice acknowledgement” intake template for new patients or annual re-acknowledgement of privacy practices. In conversation, the agent summarizes how PHI is used and shared at a high level, how to request records or restrictions, and records acknowledgement or routes questions to privacy staff. Enabled tools typically include update patient info, email NPP summary, and transfer for privacy officer questions, with clear escalation when the request exceeds the agent’s scope. This template is designed for US outpatient clinics maintaining HIPAA acknowledgement workflows on phone and chat. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "update_patient_info",
      "send_email",
      "transfer_to_human"
    ],
    "suggestedVoice": "ballad",
    "tags": [
      "hipaa",
      "privacy",
      "intake"
    ],
    "graphSpec": {
      "greeting": "I can review our Notice of Privacy Practices and record your acknowledgement.",
      "steps": [
        {
          "type": "message",
          "label": "NPP summary",
          "prompt": "Summarize privacy practices and patient rights in plain language."
        },
        {
          "type": "question",
          "label": "Acknowledge?",
          "prompt": "Do you acknowledge receipt of this notice?",
          "options": [
            "I acknowledge",
            "I have questions",
            "Speak with privacy staff"
          ]
        },
        {
          "type": "tool",
          "toolId": "update_patient_info",
          "label": "Record acknowledgement"
        },
        {
          "type": "tool",
          "toolId": "send_email",
          "label": "Email NPP summary"
        }
      ],
      "closing": "Thank you for reviewing our privacy notice."
    }
  },
  {
    "id": "triage-nurse-line-symptom-screen",
    "typeId": "triage",
    "name": "Nurse line symptom screen",
    "summary": "Structured symptom screening with urgency routing to nurse or schedule.",
    "description": "Use the “Nurse line symptom screen” triage template as a first-line nurse-line screen for common outpatient symptom calls. In conversation, the agent collects chief concern, onset, severity, and key associated symptoms, then routes to urgent transfer, same-day booking, or routine scheduling without diagnosing. Enabled tools typically include transfer to human, book appointment, and SMS callback confirmation, with clear escalation when the request exceeds the agent’s scope. This template is designed for primary care and multi-specialty groups operating advice lines with MA or RN backup. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "transfer_to_human",
      "book_appointment",
      "send_sms"
    ],
    "suggestedVoice": "sage",
    "tags": [
      "nurse-line",
      "symptoms",
      "triage"
    ],
    "graphSpec": {
      "greeting": "I can help screen your symptoms and connect you to the right level of care. This is not a diagnosis.",
      "steps": [
        {
          "type": "message",
          "label": "Concern",
          "prompt": "Ask for the main symptom, onset, and severity."
        },
        {
          "type": "question",
          "label": "Urgency",
          "prompt": "Based on what you shared, do you need a nurse now, a same-day visit, or routine follow-up?",
          "options": [
            "Nurse now",
            "Same-day visit",
            "Routine follow-up"
          ]
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Warm transfer nurse"
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book if routine/same-day"
        }
      ],
      "closing": "Thank you for sharing those details so we can help you promptly."
    }
  },
  {
    "id": "triage-covid-flu-screen",
    "typeId": "triage",
    "name": "COVID / flu symptom screen",
    "summary": "Screens respiratory viral symptoms and routes testing or visit options.",
    "description": "Use the “COVID / flu symptom screen” triage template during respiratory season for fever, cough, sore throat, and exposure questions. In conversation, the agent asks about fever, cough, shortness of breath, exposure, and high-risk conditions, then routes to testing guidance, telehealth, or in-person evaluation per clinic policy. Enabled tools typically include book appointment, SMS instructions, and urgent transfer for breathing difficulty, with clear escalation when the request exceeds the agent’s scope. This template is designed for primary care and urgent-care-adjacent outpatient clinics during viral seasons. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "send_sms",
      "transfer_to_human"
    ],
    "suggestedVoice": "echo",
    "tags": [
      "covid",
      "flu",
      "respiratory",
      "triage"
    ],
    "graphSpec": {
      "greeting": "I can help screen cold, flu, or COVID-like symptoms and explain next steps.",
      "steps": [
        {
          "type": "question",
          "label": "Breathing",
          "prompt": "Are you having trouble breathing or chest pain right now?",
          "options": [
            "No",
            "Yes"
          ]
        },
        {
          "type": "message",
          "label": "Symptom set",
          "prompt": "Ask about fever, cough, sore throat, exposure, and symptom day."
        },
        {
          "type": "question",
          "label": "Path",
          "prompt": "Would you like testing guidance, a telehealth visit, or an in-person slot?",
          "options": [
            "Testing guidance",
            "Telehealth",
            "In-person"
          ]
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book visit"
        }
      ],
      "closing": "If breathing worsens, seek emergency care immediately."
    }
  },
  {
    "id": "triage-urgent-vs-routine",
    "typeId": "triage",
    "name": "Patient urgent vs routine clinical routing",
    "summary": "Separates urgent outpatient needs from routine requests and emergencies.",
    "description": "Use the “Urgent versus routine routing” triage template as a general acuity router before scheduling or nurse transfer. In conversation, the agent uses a short acuity tree to distinguish emergencies (911), urgent same-day needs, and routine issues, then books or transfers accordingly. Enabled tools typically include transfer to human, book appointment, and SMS with care guidance, with clear escalation when the request exceeds the agent’s scope. This template is designed for clinics that want consistent acuity language across front desk and nurse lines. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "transfer_to_human",
      "book_appointment",
      "send_sms"
    ],
    "suggestedVoice": "ash",
    "tags": [
      "acuity",
      "routing",
      "triage"
    ],
    "graphSpec": {
      "greeting": "I can help determine whether this needs urgent attention, a routine visit, or emergency care.",
      "steps": [
        {
          "type": "question",
          "label": "Emergency",
          "prompt": "Is this a life-threatening emergency such as severe chest pain or inability to breathe?",
          "options": [
            "No",
            "Yes — call 911"
          ]
        },
        {
          "type": "branch",
          "label": "Acuity",
          "branches": [
            "Urgent same-day",
            "Routine scheduling",
            "Nurse advice"
          ]
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book appropriate slot"
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Transfer nurse"
        }
      ],
      "closing": "Thank you. We will get you to the right next step."
    }
  },
  {
    "id": "triage-chest-pain-red-flags",
    "typeId": "triage",
    "name": "Chest pain red-flag escalation",
    "summary": "Always escalates chest pain with emergency guidance and warm transfer.",
    "description": "Use the “Chest pain red-flag escalation” triage template whenever a caller reports chest pain, pressure, or equivalent cardiac red flags. In conversation, the agent immediately advises 911 for severe or worsening symptoms, avoids clinical reassurance, captures minimal identifying details if safe, and warm-transfers to a clinician or emergency protocol. Enabled tools typically include transfer to human and SMS with emergency instructions when appropriate, with clear escalation when the request exceeds the agent’s scope. This template is designed for every outpatient clinic that needs a fail-safe chest-pain path with zero delay. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "transfer_to_human",
      "send_sms"
    ],
    "suggestedVoice": "ash",
    "tags": [
      "chest-pain",
      "red-flag",
      "emergency",
      "triage"
    ],
    "graphSpec": {
      "greeting": "Chest pain can be serious. If you are in severe distress, hang up and dial 911 now.",
      "steps": [
        {
          "type": "question",
          "label": "Severity",
          "prompt": "Is the pain severe, spreading to arm or jaw, or paired with trouble breathing or fainting?",
          "options": [
            "Yes — emergency",
            "Mild and improving",
            "Not sure"
          ]
        },
        {
          "type": "message",
          "label": "Emergency guidance",
          "prompt": "Instruct to call 911 or go to the nearest ER for red-flag answers; do not minimize."
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Immediate warm transfer"
        }
      ],
      "closing": "Please seek emergency care if symptoms worsen at any time."
    }
  },
  {
    "id": "triage-medication-side-effects",
    "typeId": "triage",
    "name": "Medication side effect screen",
    "summary": "Screens possible medication side effects and routes to nursing or urgent care.",
    "description": "Use the “Medication side effect screen” triage template for callers worried about reactions after starting or changing a medication. In conversation, the agent identifies the medication if known, timing of symptoms, severity, and allergy-like features, then escalates anaphylaxis signs immediately or routes to nurse review. Enabled tools typically include transfer to human, SMS of reported details, and optional appointment booking, with clear escalation when the request exceeds the agent’s scope. This template is designed for primary care and specialty clinics with high prescription volume. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "transfer_to_human",
      "send_sms",
      "book_appointment"
    ],
    "suggestedVoice": "sage",
    "tags": [
      "side-effects",
      "medications",
      "triage"
    ],
    "graphSpec": {
      "greeting": "I can help document possible medication side effects and connect you to a clinician. I cannot change prescriptions myself.",
      "steps": [
        {
          "type": "question",
          "label": "Severe reaction",
          "prompt": "Any swelling of lips or tongue, trouble breathing, or widespread hives?",
          "options": [
            "No",
            "Yes"
          ]
        },
        {
          "type": "message",
          "label": "Details",
          "prompt": "Collect medication name, when started, and symptom details."
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Transfer to nursing"
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Confirm report submitted"
        }
      ],
      "closing": "A clinician will review your report. Seek emergency care if symptoms escalate."
    }
  },
  {
    "id": "triage-pediatric-fever",
    "typeId": "triage",
    "name": "Pediatric fever screen",
    "summary": "Screens pediatric fever with age-based urgency and caregiver guidance.",
    "description": "Use the “Pediatric fever screen” triage template for caregiver calls about a child’s fever in outpatient pediatric or family practice settings. In conversation, the agent asks age, temperature if known, duration, fluid intake, lethargy, and rash, then routes infants and toxic-appearing children to urgent transfer while offering routine follow-up for milder cases. Enabled tools typically include transfer to human, book appointment, and SMS caregiver guidance, with clear escalation when the request exceeds the agent’s scope. This template is designed for pediatric and family medicine clinics with high after-hours and daytime fever call volume. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "transfer_to_human",
      "book_appointment",
      "send_sms"
    ],
    "suggestedVoice": "coral",
    "tags": [
      "pediatrics",
      "fever",
      "triage"
    ],
    "graphSpec": {
      "greeting": "I can help screen your child's fever and guide next steps. For emergencies, call 911.",
      "steps": [
        {
          "type": "message",
          "label": "Age and temp",
          "prompt": "Ask child age, temperature if known, and how long the fever has lasted."
        },
        {
          "type": "question",
          "label": "Red flags",
          "prompt": "Is the child under 3 months, very lethargic, struggling to breathe, or not drinking?",
          "options": [
            "No",
            "Yes"
          ]
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Urgent nurse transfer"
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book pediatric visit"
        }
      ],
      "closing": "Trust your instincts—seek urgent care if your child looks worse."
    }
  },
  {
    "id": "triage-mental-health-warm-transfer",
    "typeId": "triage",
    "name": "Mental health warm transfer",
    "summary": "Supports distressed callers with compassionate language and immediate human handoff.",
    "description": "Use the “Mental health warm transfer” triage template for mental health crisis language, suicidal ideation mentions, or severe emotional distress. In conversation, the agent uses calm supportive language, avoids therapy or diagnosis, offers crisis resources at a high level, and warm-transfers to a clinician or crisis pathway without delay. Enabled tools typically include transfer to human and SMS with clinic crisis contacts when safe, with clear escalation when the request exceeds the agent’s scope. This template is designed for all outpatient clinics that need a safe, non-judgmental escalation path for behavioral health crises. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "transfer_to_human",
      "send_sms"
    ],
    "suggestedVoice": "ballad",
    "tags": [
      "mental-health",
      "crisis",
      "warm-transfer",
      "triage"
    ],
    "graphSpec": {
      "greeting": "I'm glad you reached out. I can connect you with someone who can help right away.",
      "steps": [
        {
          "type": "question",
          "label": "Safety",
          "prompt": "Are you in immediate danger or thinking about harming yourself right now?",
          "options": [
            "Yes",
            "No",
            "Prefer not to say"
          ]
        },
        {
          "type": "message",
          "label": "Support",
          "prompt": "Acknowledge feelings, avoid diagnosing, and prepare an immediate warm transfer."
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Warm transfer to clinician/crisis path"
        }
      ],
      "closing": "You are not alone. Please stay on the line for a team member."
    }
  },
  {
    "id": "triage-wound-check",
    "typeId": "triage",
    "name": "Wound check triage",
    "summary": "Screens wound concerns for infection signs and visit urgency.",
    "description": "Use the “Wound check triage” triage template for post-procedure or accidental wound questions about redness, drainage, or pain. In conversation, the agent asks about wound location, fever, spreading redness, pus, odor, and bleeding, then routes to urgent evaluation or routine wound-check booking. Enabled tools typically include book appointment, transfer to human, and SMS wound-care reminders from clinic policy, with clear escalation when the request exceeds the agent’s scope. This template is designed for surgical and primary care outpatient clinics managing post-op and minor injury follow-up. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "transfer_to_human",
      "send_sms"
    ],
    "suggestedVoice": "verse",
    "tags": [
      "wound",
      "infection",
      "triage"
    ],
    "graphSpec": {
      "greeting": "I can help screen your wound concern and arrange the right follow-up.",
      "steps": [
        {
          "type": "question",
          "label": "Infection signs",
          "prompt": "Any fever, spreading redness, heavy drainage, or uncontrolled bleeding?",
          "options": [
            "No",
            "Yes"
          ]
        },
        {
          "type": "message",
          "label": "Details",
          "prompt": "Ask when the wound occurred or surgery date and current symptoms."
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book wound check"
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Urgent transfer if needed"
        }
      ],
      "closing": "Seek urgent care sooner if redness spreads or fever develops."
    }
  },
  {
    "id": "triage-post-op-concerns",
    "typeId": "triage",
    "name": "Patient post-operative concern screen",
    "summary": "Screens post-op pain, fever, and surgical site issues with escalation paths.",
    "description": "Use the “Post-operative concern screen” triage template for patients recently discharged after outpatient or inpatient procedures. In conversation, the agent collects procedure date, pain control status, fever, incision concerns, and calf pain or shortness of breath red flags, then escalates VTE-like symptoms and books routine post-op checks when appropriate. Enabled tools typically include transfer to human, book appointment, and SMS surgeon-office callbacks, with clear escalation when the request exceeds the agent’s scope. This template is designed for surgical specialty clinics and hospital outpatient surgery centers. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "transfer_to_human",
      "book_appointment",
      "send_sms"
    ],
    "suggestedVoice": "cedar",
    "tags": [
      "post-op",
      "surgery",
      "triage"
    ],
    "graphSpec": {
      "greeting": "I can help screen post-surgery concerns and connect you with the surgical team if needed.",
      "steps": [
        {
          "type": "question",
          "label": "Red flags",
          "prompt": "Any chest pain, trouble breathing, calf swelling, or high fever?",
          "options": [
            "No",
            "Yes"
          ]
        },
        {
          "type": "message",
          "label": "Details",
          "prompt": "Collect procedure date, pain level, and incision concerns."
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Transfer surgical nurse"
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book post-op visit"
        }
      ],
      "closing": "Please call back immediately if new red-flag symptoms appear."
    }
  },
  {
    "id": "billing-balance-inquiry",
    "typeId": "billing",
    "name": "Account balance inquiry",
    "summary": "Looks up patient balances and explains open claims at a high level.",
    "description": "Use the “Account balance inquiry” billing template for patients calling to learn what they owe and why a balance remains. In conversation, the agent verifies identity lightly, explains open balances versus pending insurance, offers a statement email, and can start payment collection when the patient is ready. Enabled tools typically include collect payment, email statement, SMS link, and transfer for complex disputes, with clear escalation when the request exceeds the agent’s scope. This template is designed for outpatient billing offices seeking after-hours and daytime balance deflection. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "collect_payment",
      "send_email",
      "send_sms",
      "transfer_to_human"
    ],
    "suggestedVoice": "cedar",
    "tags": [
      "balance",
      "statements",
      "billing"
    ],
    "graphSpec": {
      "greeting": "I can help with your account balance and payment options.",
      "steps": [
        {
          "type": "message",
          "label": "Verify",
          "prompt": "Confirm patient identity and which account or date of service they mean."
        },
        {
          "type": "message",
          "label": "Balance",
          "prompt": "Explain open balance versus amounts still pending insurance at a high level."
        },
        {
          "type": "question",
          "label": "Pay now?",
          "prompt": "Would you like to pay now, get a statement, or speak with billing?",
          "options": [
            "Pay now",
            "Email statement",
            "Speak with billing"
          ]
        },
        {
          "type": "tool",
          "toolId": "collect_payment",
          "label": "Collect payment"
        }
      ],
      "closing": "Thank you for reviewing your account with us."
    }
  },
  {
    "id": "billing-payment-plan",
    "typeId": "billing",
    "name": "Payment plan setup",
    "summary": "Explains payment plan options and starts an arranged payment path.",
    "description": "Use the “Payment plan setup” billing template for patients who cannot pay the full balance at once and need a structured plan. In conversation, the agent reviews eligibility for plans per clinic policy, explains installment expectations, captures preferred payment method, and starts collection or transfers for exceptions. Enabled tools typically include collect payment, email plan terms, SMS reminders, and billing transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for clinics offering self-pay arrangements and hardship-sensitive billing workflows. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "collect_payment",
      "send_email",
      "send_sms",
      "transfer_to_human"
    ],
    "suggestedVoice": "marin",
    "tags": [
      "payment-plan",
      "collections",
      "billing"
    ],
    "graphSpec": {
      "greeting": "I can help explore payment plan options for your balance.",
      "steps": [
        {
          "type": "message",
          "label": "Balance context",
          "prompt": "Confirm the balance amount under discussion and hardship context at a high level."
        },
        {
          "type": "question",
          "label": "Plan interest",
          "prompt": "Would you like monthly installments, a partial payment today, or to speak with billing?",
          "options": [
            "Monthly plan",
            "Partial today",
            "Speak with billing"
          ]
        },
        {
          "type": "tool",
          "toolId": "collect_payment",
          "label": "Start payment arrangement"
        },
        {
          "type": "tool",
          "toolId": "send_email",
          "label": "Email plan terms"
        }
      ],
      "closing": "Your arrangement details will be sent for your records."
    }
  },
  {
    "id": "billing-insurance-denial",
    "typeId": "billing",
    "name": "Insurance denial explanation",
    "summary": "Explains common denial reasons and next steps for appeals or patient responsibility.",
    "description": "Use the “Insurance denial explanation” billing template when patients receive EOBs showing denials and need plain-language next steps. In conversation, the agent explains frequent denial categories at a high level, distinguishes clinic versus patient actions, offers appeal routing, and avoids guaranteeing overturns. Enabled tools typically include email denial summary, SMS checklist, and transfer to billing specialists, with clear escalation when the request exceeds the agent’s scope. This template is designed for revenue-cycle teams that want consistent denial coaching without creating liability. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_email",
      "send_sms",
      "transfer_to_human"
    ],
    "suggestedVoice": "sage",
    "tags": [
      "denial",
      "insurance",
      "appeals",
      "billing"
    ],
    "graphSpec": {
      "greeting": "I can help explain an insurance denial and what usually happens next.",
      "steps": [
        {
          "type": "message",
          "label": "Denial context",
          "prompt": "Confirm date of service and any denial reason shown on the EOB."
        },
        {
          "type": "message",
          "label": "Explain",
          "prompt": "Explain common denial categories and likely next steps without promising outcomes."
        },
        {
          "type": "question",
          "label": "Next",
          "prompt": "Would you like an appeal handoff, a statement emailed, or a billing specialist?",
          "options": [
            "Appeal handoff",
            "Email statement",
            "Specialist"
          ]
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Transfer billing"
        }
      ],
      "closing": "We will keep working the claim according to payer rules."
    }
  },
  {
    "id": "billing-copay-estimate",
    "typeId": "billing",
    "name": "Copay & cost estimate",
    "summary": "Provides non-binding copay or visit cost estimates based on clinic guidance.",
    "description": "Use the “Copay & cost estimate” billing template before visits when patients ask what they will owe at check-in. In conversation, the agent shares typical copays or self-pay ranges from clinic knowledge, stresses estimates are not guarantees, and offers to collect a deposit when policy requires. Enabled tools typically include collect payment for deposits, email estimate summary, and transfer for complex benefits, with clear escalation when the request exceeds the agent’s scope. This template is designed for clinics improving price transparency conversations without benefits adjudication in-agent. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "collect_payment",
      "send_email",
      "transfer_to_human"
    ],
    "suggestedVoice": "alloy",
    "tags": [
      "copay",
      "estimate",
      "pricing",
      "billing"
    ],
    "graphSpec": {
      "greeting": "I can share a non-binding estimate of what you may owe for your visit.",
      "steps": [
        {
          "type": "message",
          "label": "Visit type",
          "prompt": "Confirm visit type and insurance versus self-pay."
        },
        {
          "type": "message",
          "label": "Estimate",
          "prompt": "Share typical copay or self-pay range and stress it is an estimate only."
        },
        {
          "type": "question",
          "label": "Deposit?",
          "prompt": "Would you like to pay a deposit now if required?",
          "options": [
            "Yes",
            "No",
            "Speak with billing"
          ]
        },
        {
          "type": "tool",
          "toolId": "collect_payment",
          "label": "Collect deposit"
        }
      ],
      "closing": "Final patient responsibility depends on insurance processing."
    }
  },
  {
    "id": "billing-statement-explanation",
    "typeId": "billing",
    "name": "Statement line-item explanation",
    "summary": "Walks patients through statement sections and common charge labels.",
    "description": "Use the “Statement line-item explanation” billing template for confused callers who received a paper or portal statement they do not understand. In conversation, the agent explains charges, adjustments, insurance payments, and patient responsibility sections in plain language, then offers payment or a specialist transfer. Enabled tools typically include email annotated summary, collect payment, and billing transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for billing departments reducing repeat calls about statement literacy. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_email",
      "collect_payment",
      "transfer_to_human"
    ],
    "suggestedVoice": "echo",
    "tags": [
      "statement",
      "explanation",
      "billing"
    ],
    "graphSpec": {
      "greeting": "I can walk you through your statement so the charges make more sense.",
      "steps": [
        {
          "type": "message",
          "label": "Sections",
          "prompt": "Explain charges, adjustments, insurance payment, and patient responsibility sections."
        },
        {
          "type": "question",
          "label": "Next",
          "prompt": "Pay now, get an emailed summary, or speak with billing?",
          "options": [
            "Pay now",
            "Email summary",
            "Speak with billing"
          ]
        },
        {
          "type": "tool",
          "toolId": "collect_payment",
          "label": "Collect payment"
        },
        {
          "type": "tool",
          "toolId": "send_email",
          "label": "Email summary"
        }
      ],
      "closing": "Please keep your statement for your records."
    }
  },
  {
    "id": "billing-hsa-fsa",
    "typeId": "billing",
    "name": "HSA / FSA payment guidance",
    "summary": "Explains using HSA/FSA cards for eligible clinic services at a high level.",
    "description": "Use the “HSA / FSA payment guidance” billing template when patients want to pay with HSA or FSA funds and need process guidance. In conversation, the agent explains that eligibility depends on plan rules, describes how clinic card processing usually works, and starts payment collection when the patient is ready. Enabled tools typically include collect payment, email receipt guidance, and transfer for card declines, with clear escalation when the request exceeds the agent’s scope. This template is designed for outpatient clinics with high consumer-driven health plan enrollment. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "collect_payment",
      "send_email",
      "transfer_to_human"
    ],
    "suggestedVoice": "coral",
    "tags": [
      "hsa",
      "fsa",
      "payment",
      "billing"
    ],
    "graphSpec": {
      "greeting": "I can help with paying using an HSA or FSA card and what to expect.",
      "steps": [
        {
          "type": "message",
          "label": "Eligibility note",
          "prompt": "Explain that HSA/FSA eligibility depends on the patient's plan rules."
        },
        {
          "type": "question",
          "label": "Pay?",
          "prompt": "Ready to pay now, need a receipt emailed, or speak with billing?",
          "options": [
            "Pay now",
            "Email receipt info",
            "Speak with billing"
          ]
        },
        {
          "type": "tool",
          "toolId": "collect_payment",
          "label": "Collect HSA/FSA payment"
        }
      ],
      "closing": "Keep your receipt for your HSA or FSA administrator if needed."
    }
  },
  {
    "id": "billing-refund-request",
    "typeId": "billing",
    "name": "Refund request intake",
    "summary": "Captures refund requests and routes them to billing review.",
    "description": "Use the “Refund request intake” billing template for patients who believe they overpaid or were billed incorrectly. In conversation, the agent documents the date of service, amount, reason for refund request, and refund method preference, then routes to billing without promising approval. Enabled tools typically include email confirmation, SMS status, and transfer to billing reviewers, with clear escalation when the request exceeds the agent’s scope. This template is designed for clinics that need structured refund intakes instead of unstructured voicemail. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_email",
      "send_sms",
      "transfer_to_human"
    ],
    "suggestedVoice": "ash",
    "tags": [
      "refund",
      "overpayment",
      "billing"
    ],
    "graphSpec": {
      "greeting": "I can help submit a refund request for billing review. Approval is not guaranteed on this call.",
      "steps": [
        {
          "type": "message",
          "label": "Details",
          "prompt": "Collect date of service, amount, and reason for the refund request."
        },
        {
          "type": "question",
          "label": "Method",
          "prompt": "Preferred refund method if approved?",
          "options": [
            "Original card",
            "Check",
            "Not sure"
          ]
        },
        {
          "type": "tool",
          "toolId": "send_email",
          "label": "Confirm request received"
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Route to billing review"
        }
      ],
      "closing": "Billing will review and contact you with the outcome."
    }
  },
  {
    "id": "billing-prior-auth-status",
    "typeId": "billing",
    "name": "Prior authorization status",
    "summary": "Checks or explains prior auth status for procedures and specialty meds.",
    "description": "Use the “Prior authorization status” billing template for patients waiting on authorization before a procedure, imaging, or specialty medication. In conversation, the agent confirms the service awaiting auth, shares known status language from clinic workflows, explains typical payer timelines, and escalates stuck cases to staff. Enabled tools typically include email status summary, SMS updates, and transfer to auth coordinators, with clear escalation when the request exceeds the agent’s scope. This template is designed for specialty clinics and imaging-heavy outpatient groups with frequent auth delays. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_email",
      "send_sms",
      "transfer_to_human"
    ],
    "suggestedVoice": "verse",
    "tags": [
      "prior-auth",
      "status",
      "billing"
    ],
    "graphSpec": {
      "greeting": "I can help check on a prior authorization and explain where it usually stands.",
      "steps": [
        {
          "type": "message",
          "label": "Service",
          "prompt": "Confirm which procedure, imaging, or medication needs authorization."
        },
        {
          "type": "message",
          "label": "Status",
          "prompt": "Share known status language and typical payer timeline caveats."
        },
        {
          "type": "question",
          "label": "Escalate?",
          "prompt": "Would you like a coordinator callback or an emailed status note?",
          "options": [
            "Coordinator callback",
            "Email status",
            "I'm all set"
          ]
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Transfer auth coordinator"
        }
      ],
      "closing": "We will keep working with your insurer on the authorization."
    }
  },
  {
    "id": "billing-self-pay-quote",
    "typeId": "billing",
    "name": "Self-pay visit quote",
    "summary": "Provides self-pay pricing guidance and collects prepayment when required.",
    "description": "Use the “Self-pay visit quote” billing template for uninsured or out-of-network patients who need cash-pay expectations before booking. In conversation, the agent shares published self-pay ranges for common visit types, explains what is and is not included, and can collect prepayment per clinic policy. Enabled tools typically include collect payment, email quote summary, and transfer for custom procedure quotes, with clear escalation when the request exceeds the agent’s scope. This template is designed for clinics with formal self-pay fee schedules and prompt-pay discounts. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "collect_payment",
      "send_email",
      "transfer_to_human"
    ],
    "suggestedVoice": "shimmer",
    "tags": [
      "self-pay",
      "quote",
      "pricing",
      "billing"
    ],
    "graphSpec": {
      "greeting": "I can share self-pay pricing guidance and help with prepayment if required.",
      "steps": [
        {
          "type": "message",
          "label": "Visit type",
          "prompt": "Confirm the visit or service type for the quote."
        },
        {
          "type": "message",
          "label": "Quote",
          "prompt": "Share published self-pay range and what is included versus excluded."
        },
        {
          "type": "question",
          "label": "Prepay?",
          "prompt": "Would you like to prepay now, email the quote, or speak with billing?",
          "options": [
            "Prepay now",
            "Email quote",
            "Speak with billing"
          ]
        },
        {
          "type": "tool",
          "toolId": "collect_payment",
          "label": "Collect prepayment"
        }
      ],
      "closing": "Custom procedure quotes may require a billing specialist."
    }
  },
  {
    "id": "followup-post-visit-checkin",
    "typeId": "followup",
    "name": "Post-visit check-in",
    "summary": "Checks how patients feel after a recent visit and flags concerning symptoms.",
    "description": "Use the “Post-visit check-in” followup template 1–3 days after outpatient visits for proactive recovery check-ins. In conversation, the agent asks about symptom improvement, new concerns, medication tolerance, and whether instructions were clear, then escalates red flags or books a return visit. Enabled tools typically include SMS/email outreach, book appointment, and human transfer for clinical concerns, with clear escalation when the request exceeds the agent’s scope. This template is designed for primary care and specialty clinics running post-visit care management outreach. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_sms",
      "send_email",
      "book_appointment",
      "transfer_to_human"
    ],
    "suggestedVoice": "marin",
    "tags": [
      "post-visit",
      "check-in",
      "followup"
    ],
    "graphSpec": {
      "greeting": "This is a quick check-in after your recent visit. How are you feeling today?",
      "steps": [
        {
          "type": "question",
          "label": "Status",
          "prompt": "Are you feeling better, about the same, or worse?",
          "options": [
            "Better",
            "About the same",
            "Worse"
          ]
        },
        {
          "type": "message",
          "label": "Details",
          "prompt": "Ask about new symptoms and whether care instructions were clear."
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book return visit if needed"
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Escalate concerning symptoms"
        }
      ],
      "closing": "Thank you for the update. Call us sooner if anything worsens."
    }
  },
  {
    "id": "followup-lab-results-ready",
    "typeId": "followup",
    "name": "Lab results ready notice",
    "summary": "Notifies patients that results are available and routes questions appropriately.",
    "description": "Use the “Lab results ready notice” followup template after labs post to the portal and patients need a nudge or clinician callback path. In conversation, the agent announces results availability without interpreting values, guides portal access, and transfers abnormal-result questions to clinical staff. Enabled tools typically include SMS/email portal links, appointment booking for result visits, and human transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for clinics that release results electronically and want fewer “are my labs in?” calls. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_sms",
      "send_email",
      "book_appointment",
      "transfer_to_human"
    ],
    "suggestedVoice": "cedar",
    "tags": [
      "labs",
      "results",
      "portal",
      "followup"
    ],
    "graphSpec": {
      "greeting": "Your lab results are available. I can help you access them or connect you with the care team.",
      "steps": [
        {
          "type": "message",
          "label": "Portal",
          "prompt": "Explain that results are in the portal and you cannot interpret values on this call."
        },
        {
          "type": "question",
          "label": "Next",
          "prompt": "Need portal help, a clinician callback, or a results visit?",
          "options": [
            "Portal help",
            "Clinician callback",
            "Book results visit"
          ]
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Send portal link"
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Clinician callback"
        }
      ],
      "closing": "Please review results in the portal and contact us with questions."
    }
  },
  {
    "id": "followup-care-plan-adherence",
    "typeId": "followup",
    "name": "Care plan adherence check",
    "summary": "Touches base on care-plan goals like diet, monitoring, and follow-up tasks.",
    "description": "Use the “Care plan adherence check” followup template for chronic care patients with documented care-plan goals needing periodic outreach. In conversation, the agent reviews assigned tasks at a high level, captures barriers, encourages adherence without shaming, and books follow-ups or escalates clinical concerns. Enabled tools typically include SMS reminders, email care-plan summary, book appointment, and transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for care management and PCMH-style primary care programs. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_sms",
      "send_email",
      "book_appointment",
      "transfer_to_human"
    ],
    "suggestedVoice": "ballad",
    "tags": [
      "care-plan",
      "adherence",
      "chronic-care",
      "followup"
    ],
    "graphSpec": {
      "greeting": "I'm checking in on the care plan goals your team set with you.",
      "steps": [
        {
          "type": "message",
          "label": "Goals",
          "prompt": "Review key care-plan tasks at a high level and ask about barriers."
        },
        {
          "type": "question",
          "label": "On track?",
          "prompt": "Would you say you are mostly on track, need tips, or need a clinician?",
          "options": [
            "On track",
            "Need tips",
            "Need clinician"
          ]
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Send reminder tips"
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book follow-up"
        }
      ],
      "closing": "Small steps count. We are here if you need support."
    }
  },
  {
    "id": "followup-medication-adherence",
    "typeId": "followup",
    "name": "Medication adherence outreach",
    "summary": "Checks whether patients are taking medications as prescribed and captures barriers.",
    "description": "Use the “Medication adherence outreach” followup template for chronic medication regimens where adherence drives outcomes. In conversation, the agent asks if doses are being taken, captures cost or side-effect barriers, avoids advising dose changes, and routes to nursing or pharmacy refill workflows. Enabled tools typically include SMS reminders, appointment booking, and transfer to clinical staff, with clear escalation when the request exceeds the agent’s scope. This template is designed for cardiology, endocrinology, and primary care adherence programs. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_sms",
      "book_appointment",
      "transfer_to_human",
      "send_appointment_reminder"
    ],
    "suggestedVoice": "sage",
    "tags": [
      "medications",
      "adherence",
      "followup"
    ],
    "graphSpec": {
      "greeting": "I'm following up about your medications. This is a check-in, not a prescription change.",
      "steps": [
        {
          "type": "question",
          "label": "Taking as prescribed?",
          "prompt": "Have you been able to take your medications as prescribed?",
          "options": [
            "Yes",
            "Mostly",
            "Having trouble"
          ]
        },
        {
          "type": "message",
          "label": "Barriers",
          "prompt": "Ask about cost, side effects, or confusion without recommending dose changes."
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Escalate clinical barriers"
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Send adherence reminder"
        }
      ],
      "closing": "Thank you for the honest update. Your care team can help with barriers."
    }
  },
  {
    "id": "followup-procedure-prep-reminder",
    "typeId": "followup",
    "name": "Procedure prep reminder",
    "summary": "Reminds patients about fasting, meds to hold, and arrival instructions before procedures.",
    "description": "Use the “Procedure prep reminder” followup template 24–72 hours before outpatient procedures or diagnostic tests requiring prep. In conversation, the agent reviews prep checklist items from clinic knowledge, confirms understanding, and escalates medication-hold questions to clinicians rather than advising independently. Enabled tools typically include appointment reminders, SMS/email prep lists, and human transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for GI, cardiology, imaging, and surgical outpatient sites with prep-sensitive procedures. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_appointment_reminder",
      "send_sms",
      "send_email",
      "transfer_to_human"
    ],
    "suggestedVoice": "echo",
    "tags": [
      "procedure",
      "prep",
      "reminder",
      "followup"
    ],
    "graphSpec": {
      "greeting": "This is a reminder about preparing for your upcoming procedure.",
      "steps": [
        {
          "type": "message",
          "label": "Prep checklist",
          "prompt": "Review fasting, arrival time, and ride-home rules from clinic knowledge."
        },
        {
          "type": "question",
          "label": "Med holds",
          "prompt": "Do you have questions about medications to hold?",
          "options": [
            "Yes — transfer",
            "No questions",
            "Resend prep list"
          ]
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Send prep list"
        },
        {
          "type": "tool",
          "toolId": "send_appointment_reminder",
          "label": "Confirm appointment"
        }
      ],
      "closing": "Following prep instructions helps keep your procedure safe and on schedule."
    }
  },
  {
    "id": "followup-no-show-recovery",
    "typeId": "followup",
    "name": "No-show recovery outreach",
    "summary": "Re-engages patients after a missed visit and offers easy rebooking.",
    "description": "Use the “No-show recovery outreach” followup template within days after a no-show to recover access and understand barriers. In conversation, the agent acknowledges the missed visit without blame, asks about barriers, offers rebooking, and can send reminder preferences for next time. Enabled tools typically include book appointment, reminders, SMS, and transfer for complex access issues, with clear escalation when the request exceeds the agent’s scope. This template is designed for clinics actively managing no-show rates and panel access. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "send_appointment_reminder",
      "send_sms",
      "transfer_to_human"
    ],
    "suggestedVoice": "coral",
    "tags": [
      "no-show",
      "rebooking",
      "followup"
    ],
    "graphSpec": {
      "greeting": "We noticed you missed a recent appointment. We would love to help you reschedule.",
      "steps": [
        {
          "type": "question",
          "label": "Rebook?",
          "prompt": "Would you like to book a new time now?",
          "options": [
            "Yes",
            "Not yet",
            "Speak with staff"
          ]
        },
        {
          "type": "message",
          "label": "Barriers",
          "prompt": "Ask briefly what got in the way to improve future reminders."
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Rebook visit"
        },
        {
          "type": "tool",
          "toolId": "send_appointment_reminder",
          "label": "Set reminder preference"
        }
      ],
      "closing": "Thanks for reconnecting. We are here when you are ready."
    }
  },
  {
    "id": "followup-chronic-care-touchpoint",
    "typeId": "followup",
    "name": "Chronic care monthly touchpoint",
    "summary": "Periodic outreach for chronic conditions covering symptoms, vitals, and goals.",
    "description": "Use the “Chronic care monthly touchpoint” followup template on a recurring cadence for hypertension, diabetes, CHF, or similar panels. In conversation, the agent asks about recent readings if patient-tracked, symptom changes, and medication supply, then books clinician visits when thresholds or concerns appear. Enabled tools typically include SMS check-ins, email summaries, book appointment, and nursing transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for chronic care management and remote monitoring-adjacent outpatient programs. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_sms",
      "send_email",
      "book_appointment",
      "transfer_to_human"
    ],
    "suggestedVoice": "verse",
    "tags": [
      "chronic-care",
      "ccm",
      "followup"
    ],
    "graphSpec": {
      "greeting": "This is your scheduled chronic care check-in from the clinic care team.",
      "steps": [
        {
          "type": "message",
          "label": "Status",
          "prompt": "Ask about recent home readings if relevant, symptoms, and medication supply."
        },
        {
          "type": "question",
          "label": "Needs",
          "prompt": "Need a clinician visit, nursing callback, or just a reminder tip?",
          "options": [
            "Book visit",
            "Nursing callback",
            "Reminder tip"
          ]
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book visit"
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Send tip"
        }
      ],
      "closing": "Thank you for staying engaged with your care plan."
    }
  },
  {
    "id": "followup-discharge-followup",
    "typeId": "followup",
    "name": "Hospital discharge follow-up",
    "summary": "Post-discharge outreach covering meds, red flags, and primary care bridging.",
    "description": "Use the “Hospital discharge follow-up” followup template within 48–72 hours after hospital or ED discharge for attributed patients. In conversation, the agent confirms discharge understanding, medication access, home support, and red-flag symptoms, then books a bridge visit or escalates urgently. Enabled tools typically include book appointment, SMS red-flag list, email after-visit summary help, and transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for primary care groups managing transitions of care quality metrics. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "send_sms",
      "send_email",
      "transfer_to_human"
    ],
    "suggestedVoice": "ash",
    "tags": [
      "discharge",
      "transitions",
      "followup"
    ],
    "graphSpec": {
      "greeting": "I'm calling to check in after your recent hospital discharge and help with follow-up care.",
      "steps": [
        {
          "type": "question",
          "label": "Red flags",
          "prompt": "Any new chest pain, trouble breathing, or fainting since discharge?",
          "options": [
            "No",
            "Yes"
          ]
        },
        {
          "type": "message",
          "label": "Meds and support",
          "prompt": "Ask about medication access and home support needs."
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book bridge visit"
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Urgent clinical transfer"
        }
      ],
      "closing": "Seek emergency care if red-flag symptoms return."
    }
  },
  {
    "id": "followup-vaccine-reminder",
    "typeId": "followup",
    "name": "Vaccine reminder & scheduling",
    "summary": "Reminds patients about due vaccines and offers booking.",
    "description": "Use the “Vaccine reminder & scheduling” followup template for influenza, COVID, pneumococcal, shingles, or childhood vaccine outreach. In conversation, the agent states which vaccine appears due from clinic outreach lists, answers high-level FAQ, books a shot visit, and transfers clinical contraindications questions. Enabled tools typically include book appointment, reminders, SMS/email education, and human transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for primary care and pediatric clinics running immunization campaigns year-round. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "send_appointment_reminder",
      "send_sms",
      "send_email",
      "transfer_to_human"
    ],
    "suggestedVoice": "shimmer",
    "tags": [
      "vaccine",
      "immunization",
      "reminder",
      "followup"
    ],
    "graphSpec": {
      "greeting": "This is a reminder that you may be due for a vaccine. I can help schedule it.",
      "steps": [
        {
          "type": "message",
          "label": "Vaccine due",
          "prompt": "State which vaccine the outreach is for and invite questions at a high level."
        },
        {
          "type": "question",
          "label": "Book?",
          "prompt": "Would you like to book a vaccine visit now?",
          "options": [
            "Yes",
            "Not now",
            "Clinical question"
          ]
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book vaccine visit"
        },
        {
          "type": "tool",
          "toolId": "send_appointment_reminder",
          "label": "Send reminder"
        }
      ],
      "closing": "Thank you for protecting your health with recommended vaccines."
    }
  },
  {
    "id": "referral-outbound-specialist",
    "typeId": "referral",
    "name": "Outbound specialist referral",
    "summary": "Starts an outbound specialist referral with clinical reason and preferred sites.",
    "description": "Use the “Outbound specialist referral” referral template when a PCP visit results in needing specialty evaluation and staff must open a referral. In conversation, the agent captures specialty needed, clinical reason at a high level, preferred specialists or facilities, urgency, and insurance constraints, then updates records and notifies coordinators. Enabled tools typically include update patient info, email referral summary, SMS status, book if same-org specialty, and transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for primary care hubs with high outbound referral volume. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "update_patient_info",
      "send_email",
      "send_sms",
      "book_appointment",
      "transfer_to_human"
    ],
    "suggestedVoice": "cedar",
    "tags": [
      "outbound",
      "specialist",
      "referral"
    ],
    "graphSpec": {
      "greeting": "I can help start a specialist referral and capture the details our coordinators need.",
      "steps": [
        {
          "type": "message",
          "label": "Specialty",
          "prompt": "Collect specialty needed, reason, urgency, and preferred facilities."
        },
        {
          "type": "tool",
          "toolId": "update_patient_info",
          "label": "Save referral request"
        },
        {
          "type": "tool",
          "toolId": "send_email",
          "label": "Email referral summary"
        },
        {
          "type": "question",
          "label": "Book internal?",
          "prompt": "If we have that specialty in-network here, book now?",
          "options": [
            "Yes, book",
            "Coordinator will follow up",
            "Speak with staff"
          ]
        }
      ],
      "closing": "A referral coordinator will follow up with next steps."
    }
  },
  {
    "id": "referral-inbound-scheduling",
    "typeId": "referral",
    "name": "Inbound referral scheduling",
    "summary": "Schedules patients referred into the specialty clinic from outside providers.",
    "description": "Use the “Inbound referral scheduling” referral template for inbound packets that are complete enough to schedule a first specialty visit. In conversation, the agent confirms referral presence, specialty visit type, urgency, and demographics, then books and lists missing documents if any. Enabled tools typically include book appointment, update patient info, email missing-docs list, and transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for specialty outpatient departments receiving community referrals. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "update_patient_info",
      "send_email",
      "transfer_to_human"
    ],
    "suggestedVoice": "marin",
    "tags": [
      "inbound",
      "scheduling",
      "referral"
    ],
    "graphSpec": {
      "greeting": "I can help schedule your visit from an outside referral.",
      "steps": [
        {
          "type": "question",
          "label": "Packet",
          "prompt": "Has your referring office already sent the referral?",
          "options": [
            "Yes",
            "No",
            "Not sure"
          ]
        },
        {
          "type": "message",
          "label": "Details",
          "prompt": "Confirm specialty, urgency, and preferred times."
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book specialty visit"
        },
        {
          "type": "tool",
          "toolId": "send_email",
          "label": "Email prep / missing docs"
        }
      ],
      "closing": "Please bring referral paperwork and insurance cards to your visit."
    }
  },
  {
    "id": "referral-records-request",
    "typeId": "referral",
    "name": "Medical records request",
    "summary": "Takes records release requests and routes them to HIM / records staff.",
    "description": "Use the “Medical records request” referral template for patients needing records sent to another provider, attorney, or themselves. In conversation, the agent captures requester identity, destination, date range, and format preferences, explains typical turnaround, and routes to records staff without fulfilling PHI over voice beyond policy. Enabled tools typically include update patient info notes, email request confirmation, and transfer to records, with clear escalation when the request exceeds the agent’s scope. This template is designed for clinics centralizing ROI requests away from clinical phone lines. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "update_patient_info",
      "send_email",
      "transfer_to_human"
    ],
    "suggestedVoice": "alloy",
    "tags": [
      "records",
      "roi",
      "referral"
    ],
    "graphSpec": {
      "greeting": "I can help submit a medical records request for our records team.",
      "steps": [
        {
          "type": "message",
          "label": "Destination",
          "prompt": "Collect where records should go, date range, and format preference."
        },
        {
          "type": "tool",
          "toolId": "update_patient_info",
          "label": "Log records request"
        },
        {
          "type": "tool",
          "toolId": "send_email",
          "label": "Confirm request received"
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Transfer records if needed"
        }
      ],
      "closing": "Records staff will process the request according to privacy rules."
    }
  },
  {
    "id": "referral-imaging-order-status",
    "typeId": "referral",
    "name": "Imaging order status",
    "summary": "Tracks imaging orders, auth, and scheduling status for referred studies.",
    "description": "Use the “Imaging order status” referral template patients ask whether an MRI, CT, ultrasound, or x-ray order is ready to schedule. In conversation, the agent confirms the study ordered, shares auth and scheduling status language, books when ready, and escalates incomplete orders. Enabled tools typically include book appointment, email status, SMS, and coordinator transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for specialty and primary care clinics coordinating advanced imaging. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "send_email",
      "send_sms",
      "transfer_to_human"
    ],
    "suggestedVoice": "echo",
    "tags": [
      "imaging",
      "orders",
      "status",
      "referral"
    ],
    "graphSpec": {
      "greeting": "I can help check the status of your imaging order and scheduling.",
      "steps": [
        {
          "type": "message",
          "label": "Study",
          "prompt": "Confirm which imaging study was ordered and preferred facility if any."
        },
        {
          "type": "question",
          "label": "Ready?",
          "prompt": "If authorization is complete, book now or get a status callback?",
          "options": [
            "Book now",
            "Status callback",
            "Email status"
          ]
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book imaging"
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Coordinator callback"
        }
      ],
      "closing": "We will notify you if authorization needs more information."
    }
  },
  {
    "id": "referral-prior-auth-for-referral",
    "typeId": "referral",
    "name": "Prior auth for referral",
    "summary": "Collects details needed to open prior auth on a specialty referral.",
    "description": "Use the “Prior auth for referral” referral template when a payer requires authorization before the specialist visit can proceed. In conversation, the agent gathers CPT/service description if known, clinical indication at a high level, preferred specialist, and urgency, then routes to auth staff. Enabled tools typically include update patient info, email checklist, SMS status, and transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for referral desks fighting auth delays on specialty access. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "update_patient_info",
      "send_email",
      "send_sms",
      "transfer_to_human"
    ],
    "suggestedVoice": "sage",
    "tags": [
      "prior-auth",
      "referral",
      "access"
    ],
    "graphSpec": {
      "greeting": "I can help gather what we need to request prior authorization for your referral.",
      "steps": [
        {
          "type": "message",
          "label": "Auth details",
          "prompt": "Collect service needed, indication, specialist, and urgency."
        },
        {
          "type": "tool",
          "toolId": "update_patient_info",
          "label": "Save auth intake"
        },
        {
          "type": "tool",
          "toolId": "send_email",
          "label": "Email auth checklist"
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Transfer auth team"
        }
      ],
      "closing": "Authorization timelines depend on your insurer's response."
    }
  },
  {
    "id": "referral-second-opinion",
    "typeId": "referral",
    "name": "Patient second-opinion care coordination",
    "summary": "Coordinates second-opinion visits including records and specialist matching.",
    "description": "Use the “Second opinion coordination” referral template patients request another specialist’s review of a diagnosis or treatment plan. In conversation, the agent clarifies the clinical question, preferred specialty, records needed, and urgency, then books or routes to a navigator. Enabled tools typically include book appointment, update patient info, email records checklist, and transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for academic-affiliated and multi-specialty groups offering second-opinion programs. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "update_patient_info",
      "send_email",
      "transfer_to_human"
    ],
    "suggestedVoice": "ballad",
    "tags": [
      "second-opinion",
      "specialty",
      "referral"
    ],
    "graphSpec": {
      "greeting": "I can help coordinate a second-opinion visit and the records that are usually needed.",
      "steps": [
        {
          "type": "message",
          "label": "Clinical question",
          "prompt": "Ask what question they want the second opinion to address and preferred specialty."
        },
        {
          "type": "tool",
          "toolId": "update_patient_info",
          "label": "Save second-opinion request"
        },
        {
          "type": "tool",
          "toolId": "send_email",
          "label": "Email records checklist"
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book if ready"
        }
      ],
      "closing": "A coordinator will confirm once records and scheduling are aligned."
    }
  },
  {
    "id": "referral-transition-of-care",
    "typeId": "referral",
    "name": "Transition of care referral",
    "summary": "Bridges hospital or SNF discharge into outpatient specialty or primary care.",
    "description": "Use the “Transition of care referral” referral template for transitions needing timely outpatient follow-up after facility discharge. In conversation, the agent captures discharge date, follow-up specialty, red-flag awareness, and preferred timing, then books a bridge visit and notifies coordinators. Enabled tools typically include book appointment, SMS red-flag reminders, email, and transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for health-system outpatient networks managing TOC metrics. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "send_sms",
      "send_email",
      "transfer_to_human"
    ],
    "suggestedVoice": "ash",
    "tags": [
      "transitions",
      "discharge",
      "referral"
    ],
    "graphSpec": {
      "greeting": "I can help arrange outpatient follow-up after your recent facility stay.",
      "steps": [
        {
          "type": "message",
          "label": "Discharge context",
          "prompt": "Collect discharge date, needed specialty, and preferred timing."
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book bridge visit"
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Send red-flag reminder"
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Escalate complex TOC"
        }
      ],
      "closing": "Please seek emergency care if concerning symptoms return before your visit."
    }
  },
  {
    "id": "referral-dme-order",
    "typeId": "referral",
    "name": "DME order coordination",
    "summary": "Intake for durable medical equipment orders, suppliers, and auth needs.",
    "description": "Use the “DME order coordination” referral template patients need CPAP supplies, walkers, wheelchairs, or similar DME coordination. In conversation, the agent documents equipment requested, prescribing clinician, supplier preference, and insurance notes, then routes to DME coordinators. Enabled tools typically include update patient info, email supplier checklist, SMS status, and transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for pulmonology, orthopedics, and primary care clinics managing DME paperwork. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "update_patient_info",
      "send_email",
      "send_sms",
      "transfer_to_human"
    ],
    "suggestedVoice": "verse",
    "tags": [
      "dme",
      "equipment",
      "referral"
    ],
    "graphSpec": {
      "greeting": "I can help start a durable medical equipment request for our coordinators.",
      "steps": [
        {
          "type": "message",
          "label": "Equipment",
          "prompt": "Collect equipment needed, prescribing clinician, and supplier preference."
        },
        {
          "type": "tool",
          "toolId": "update_patient_info",
          "label": "Save DME request"
        },
        {
          "type": "tool",
          "toolId": "send_email",
          "label": "Email DME checklist"
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Transfer DME coordinator"
        }
      ],
      "closing": "DME approvals often depend on insurer documentation requirements."
    }
  },
  {
    "id": "referral-home-health",
    "typeId": "referral",
    "name": "Home health referral",
    "summary": "Initiates home health referrals including skilled nursing or therapy needs.",
    "description": "Use the “Home health referral” referral template for patients needing home nursing, PT/OT/ST, or related home health services. In conversation, the agent captures skill needed, home safety notes at a high level, preferred agencies, and urgency, then routes to care coordinators. Enabled tools typically include update patient info, email agency packet checklist, SMS, and transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for geriatrics, post-acute, and primary care teams arranging home health. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "update_patient_info",
      "send_email",
      "send_sms",
      "transfer_to_human"
    ],
    "suggestedVoice": "ballad",
    "tags": [
      "home-health",
      "post-acute",
      "referral"
    ],
    "graphSpec": {
      "greeting": "I can help start a home health referral for nursing or therapy services.",
      "steps": [
        {
          "type": "message",
          "label": "Needs",
          "prompt": "Collect skilled service needed, urgency, and preferred agencies if any."
        },
        {
          "type": "tool",
          "toolId": "update_patient_info",
          "label": "Save home health referral"
        },
        {
          "type": "tool",
          "toolId": "send_email",
          "label": "Email next steps"
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Transfer care coordinator"
        }
      ],
      "closing": "A coordinator will confirm agency availability and authorization needs."
    }
  },
  {
    "id": "campaign-appointment-reminder-outbound",
    "typeId": "campaign",
    "name": "Outbound appointment reminder",
    "summary": "Confirms upcoming visits and offers reschedule or cancel paths.",
    "description": "Use the “Outbound appointment reminder” campaign template as a proactive outbound reminder campaign 24–72 hours before appointments. In conversation, the agent states visit time and location or video join info, confirms attendance, and routes reschedule or cancel quickly with opt-out respect. Enabled tools typically include appointment reminders, reschedule, cancel, SMS, voicemail, and email, with clear escalation when the request exceeds the agent’s scope. This template is designed for any outpatient clinic reducing no-shows with outbound voice or SMS campaigns. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_appointment_reminder",
      "reschedule_appointment",
      "cancel_appointment",
      "send_sms",
      "send_voicemail"
    ],
    "suggestedVoice": "coral",
    "tags": [
      "reminder",
      "outbound",
      "campaign"
    ],
    "graphSpec": {
      "greeting": "This is a reminder about your upcoming clinic appointment.",
      "steps": [
        {
          "type": "message",
          "label": "Visit details",
          "prompt": "State date, time, location or telehealth join info."
        },
        {
          "type": "question",
          "label": "Confirm?",
          "prompt": "Can you keep this appointment?",
          "options": [
            "Yes, confirm",
            "Reschedule",
            "Cancel"
          ]
        },
        {
          "type": "tool",
          "toolId": "send_appointment_reminder",
          "label": "Log confirmation"
        },
        {
          "type": "tool",
          "toolId": "reschedule_appointment",
          "label": "Reschedule path"
        }
      ],
      "closing": "Thank you. Reply stop on texts if you opt out of reminders."
    }
  },
  {
    "id": "campaign-recall-overdue",
    "typeId": "campaign",
    "name": "Overdue recall outreach",
    "summary": "Reaches patients overdue for follow-up or preventive visits.",
    "description": "Use the “Overdue recall outreach” campaign template for panels overdue on chronic follow-ups, labs, or preventive care. In conversation, the agent explains why the clinic is reaching out, offers booking, captures defer reasons, and respects opt-outs. Enabled tools typically include book appointment, SMS/email, voicemail drops, and reminders, with clear escalation when the request exceeds the agent’s scope. This template is designed for population health and quality teams closing care gaps. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "send_sms",
      "send_email",
      "send_voicemail",
      "send_appointment_reminder"
    ],
    "suggestedVoice": "marin",
    "tags": [
      "recall",
      "overdue",
      "campaign"
    ],
    "graphSpec": {
      "greeting": "We're reaching out because you may be due for a follow-up visit with our clinic.",
      "steps": [
        {
          "type": "message",
          "label": "Why calling",
          "prompt": "Explain the overdue visit type at a high level without alarming language."
        },
        {
          "type": "question",
          "label": "Book?",
          "prompt": "Would you like to schedule now?",
          "options": [
            "Yes",
            "Not now",
            "Already completed elsewhere"
          ]
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book recall visit"
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Send follow-up link"
        }
      ],
      "closing": "Thanks for your time. You can opt out of outreach anytime."
    }
  },
  {
    "id": "campaign-flu-shot",
    "typeId": "campaign",
    "name": "Flu shot campaign",
    "summary": "Seasonal influenza vaccination outreach with booking.",
    "description": "Use the “Flu shot campaign” campaign template during fall and winter flu vaccination campaigns. In conversation, the agent invites patients to book a flu shot, answers high-level FAQ, and transfers clinical contraindication questions. Enabled tools typically include book appointment, reminders, SMS/email education, and voicemail, with clear escalation when the request exceeds the agent’s scope. This template is designed for primary care and pediatric clinics running seasonal immunization drives. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "send_appointment_reminder",
      "send_sms",
      "send_email",
      "send_voicemail"
    ],
    "suggestedVoice": "shimmer",
    "tags": [
      "flu",
      "vaccine",
      "campaign"
    ],
    "graphSpec": {
      "greeting": "Flu season is here. I can help you schedule a flu shot with our clinic.",
      "steps": [
        {
          "type": "question",
          "label": "Interest",
          "prompt": "Would you like to book a flu shot?",
          "options": [
            "Yes",
            "Not this year",
            "Clinical question"
          ]
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book flu shot"
        },
        {
          "type": "tool",
          "toolId": "send_appointment_reminder",
          "label": "Remind"
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Send clinic vaccine hours"
        }
      ],
      "closing": "Thank you for helping protect your community this flu season."
    }
  },
  {
    "id": "campaign-wellness-visit",
    "typeId": "campaign",
    "name": "Wellness visit campaign",
    "summary": "Promotes annual wellness or physical visits for eligible patients.",
    "description": "Use the “Wellness visit campaign” campaign template for patients due for annual physicals or Medicare wellness visits. In conversation, the agent explains visit purpose at a high level, books preventive slots, and clarifies that problem visits may be handled differently. Enabled tools typically include book appointment, reminders, SMS/email, and voicemail, with clear escalation when the request exceeds the agent’s scope. This template is designed for primary care growth and quality programs focused on preventive visit completion. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "send_appointment_reminder",
      "send_sms",
      "send_email",
      "send_voicemail"
    ],
    "suggestedVoice": "cedar",
    "tags": [
      "wellness",
      "physical",
      "campaign"
    ],
    "graphSpec": {
      "greeting": "You're due for a wellness visit. I can help schedule your annual checkup.",
      "steps": [
        {
          "type": "message",
          "label": "Why it matters",
          "prompt": "Briefly explain preventive visit purpose without overselling."
        },
        {
          "type": "question",
          "label": "Book?",
          "prompt": "Schedule your wellness visit now?",
          "options": [
            "Yes",
            "Later",
            "Questions first"
          ]
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book wellness visit"
        },
        {
          "type": "tool",
          "toolId": "send_appointment_reminder",
          "label": "Confirm"
        }
      ],
      "closing": "Investing in prevention helps us catch issues early."
    }
  },
  {
    "id": "campaign-insurance-update",
    "typeId": "campaign",
    "name": "Insurance card update campaign",
    "summary": "Asks patients to confirm or update insurance before upcoming care.",
    "description": "Use the “Insurance card update campaign” campaign template before open enrollment ends or ahead of visits with stale eligibility. In conversation, the agent asks whether coverage changed, captures new payer details or confirms unchanged, and routes complex cases to billing. Enabled tools typically include update patient info, SMS/email prompts, voicemail, and transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for RCM teams reducing day-of eligibility failures. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "update_patient_info",
      "send_sms",
      "send_email",
      "send_voicemail",
      "transfer_to_human"
    ],
    "suggestedVoice": "alloy",
    "tags": [
      "insurance",
      "eligibility",
      "campaign"
    ],
    "graphSpec": {
      "greeting": "We're confirming your insurance information is up to date before your care.",
      "steps": [
        {
          "type": "question",
          "label": "Changed?",
          "prompt": "Has your insurance changed recently?",
          "options": [
            "Yes, update now",
            "No change",
            "Speak with billing"
          ]
        },
        {
          "type": "message",
          "label": "Capture",
          "prompt": "Collect new payer and member ID if changed."
        },
        {
          "type": "tool",
          "toolId": "update_patient_info",
          "label": "Save insurance update"
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Confirm update"
        }
      ],
      "closing": "Thanks for helping us bill correctly and avoid surprises."
    }
  },
  {
    "id": "campaign-survey-nps",
    "typeId": "campaign",
    "name": "Patient care experience survey",
    "summary": "Collects short post-visit satisfaction scores and open feedback.",
    "description": "Use the “NPS / experience survey” campaign template after visits to measure patient experience and catch service recoveries. In conversation, the agent asks a 0–10 likelihood-to-recommend style question, captures brief comments, thanks the patient, and escalates detractors to a manager path when configured. Enabled tools typically include SMS/email survey confirmations, voicemail for non-responders, and optional human transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for clinics tracking NPS or CG-CAHPS-adjacent experience programs. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_sms",
      "send_email",
      "send_voicemail",
      "transfer_to_human"
    ],
    "suggestedVoice": "ballad",
    "tags": [
      "nps",
      "survey",
      "experience",
      "campaign"
    ],
    "graphSpec": {
      "greeting": "We value your feedback about your recent visit. This takes under a minute.",
      "steps": [
        {
          "type": "question",
          "label": "Score",
          "prompt": "On a scale from 0 to 10, how likely are you to recommend our clinic?",
          "options": [
            "9-10",
            "7-8",
            "0-6"
          ]
        },
        {
          "type": "message",
          "label": "Comment",
          "prompt": "Invite a brief comment about what went well or could improve."
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Thank-you text"
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Service recovery transfer"
        }
      ],
      "closing": "Thank you for helping us improve care for every patient."
    }
  },
  {
    "id": "campaign-reengage-inactive",
    "typeId": "campaign",
    "name": "Re-engage inactive patients",
    "summary": "Reconnects patients without visits for an extended period.",
    "description": "Use the “Re-engage inactive patients” campaign template for panels inactive for 18–36 months depending on clinic rules. In conversation, the agent invites patients back, offers new-patient or return-visit booking, and captures move-away or PCP-change reasons. Enabled tools typically include book appointment, SMS/email, voicemail, and transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for growth and retention teams rebuilding active panels. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "send_sms",
      "send_email",
      "send_voicemail",
      "transfer_to_human"
    ],
    "suggestedVoice": "verse",
    "tags": [
      "reengage",
      "inactive",
      "retention",
      "campaign"
    ],
    "graphSpec": {
      "greeting": "It's been a while since your last visit. We would love to welcome you back.",
      "steps": [
        {
          "type": "question",
          "label": "Still with us?",
          "prompt": "Are you still looking for care with our clinic?",
          "options": [
            "Yes, book",
            "Moved / new PCP",
            "Not now"
          ]
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book return visit"
        },
        {
          "type": "tool",
          "toolId": "send_email",
          "label": "Send welcome-back info"
        }
      ],
      "closing": "Thanks for letting us know. We're here if you need us."
    }
  },
  {
    "id": "campaign-procedural-consent",
    "typeId": "campaign",
    "name": "Procedural consent campaign",
    "summary": "Outbound reminders to complete procedural consent and prep paperwork.",
    "description": "Use the “Procedural consent campaign” campaign template before elective procedures when consents remain unsigned in the portal. In conversation, the agent reminds patients to complete consent forms, answers high-level what-to-expect questions, and transfers clinical consent discussions to clinicians. Enabled tools typically include SMS/email portal links, voicemail, reminders, and human transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for surgical and procedural clinics reducing day-of paperwork delays. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_sms",
      "send_email",
      "send_voicemail",
      "send_appointment_reminder",
      "transfer_to_human"
    ],
    "suggestedVoice": "sage",
    "tags": [
      "consent",
      "procedure",
      "campaign"
    ],
    "graphSpec": {
      "greeting": "This is a reminder to complete consent forms before your upcoming procedure.",
      "steps": [
        {
          "type": "message",
          "label": "Why needed",
          "prompt": "Explain that consents must be completed before the procedure date."
        },
        {
          "type": "question",
          "label": "Status",
          "prompt": "Have you finished the forms, need a link, or need to speak with someone?",
          "options": [
            "Finished",
            "Send link",
            "Speak with staff"
          ]
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Send portal link"
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Clinical consent questions"
        }
      ],
      "closing": "Completing forms early helps your procedure day run smoothly."
    }
  },
  {
    "id": "campaign-birthday-wellness",
    "typeId": "campaign",
    "name": "Birthday wellness outreach",
    "summary": "Friendly birthday message paired with wellness visit or screening nudges.",
    "description": "Use the “Birthday wellness outreach” campaign template around patient birthdays as a light-touch wellness engagement campaign. In conversation, the agent offers warm birthday wishes, optionally mentions due wellness services, and books if interested while keeping the tone non-intrusive. Enabled tools typically include SMS/email, voicemail, book appointment, and reminders, with clear escalation when the request exceeds the agent’s scope. This template is designed for patient engagement teams blending relationship marketing with preventive care. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_sms",
      "send_email",
      "send_voicemail",
      "book_appointment",
      "send_appointment_reminder"
    ],
    "suggestedVoice": "shimmer",
    "tags": [
      "birthday",
      "wellness",
      "engagement",
      "campaign"
    ],
    "graphSpec": {
      "greeting": "Happy birthday from our clinic team! We hope you are having a wonderful day.",
      "steps": [
        {
          "type": "question",
          "label": "Wellness?",
          "prompt": "Would you like to schedule a wellness visit while we have you?",
          "options": [
            "Yes",
            "Maybe later",
            "No thanks"
          ]
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book wellness visit"
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Send birthday wellness tip"
        }
      ],
      "closing": "Wishing you a healthy year ahead."
    }
  },
  {
    "id": "afterhours-answering",
    "typeId": "afterhours",
    "name": "After-hours answering service",
    "summary": "Branded after-hours greeting with callback capture and urgency routing.",
    "description": "Use the “After-hours answering service” afterhours template as the default night and weekend answering experience for the clinic main line. In conversation, the agent greets after hours, captures caller intent and callback number, routes emergencies to 911 language, and can leave structured messages for next-business-day staff. Enabled tools typically include voicemail, SMS callback confirmations, email message tickets, and on-call transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for outpatient clinics replacing generic answering services with branded AI coverage. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_voicemail",
      "send_sms",
      "send_email",
      "transfer_to_human"
    ],
    "suggestedVoice": "echo",
    "tags": [
      "after-hours",
      "answering",
      "callback"
    ],
    "graphSpec": {
      "greeting": "Thank you for calling. Our office is currently closed. I can take a message or help with urgent guidance.",
      "steps": [
        {
          "type": "question",
          "label": "Intent",
          "prompt": "Do you need urgent clinical help, a refill message, or a general callback?",
          "options": [
            "Urgent clinical",
            "Refill message",
            "General callback"
          ]
        },
        {
          "type": "message",
          "label": "Capture",
          "prompt": "Collect name, callback number, and brief reason."
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Confirm message received"
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "On-call transfer if urgent"
        }
      ],
      "closing": "For emergencies, please dial 911. Otherwise we will follow up when appropriate."
    }
  },
  {
    "id": "afterhours-emergency-redirect",
    "typeId": "afterhours",
    "name": "Patient emergency care redirect",
    "summary": "Fast emergency recognition with 911 and ER guidance, minimal delay.",
    "description": "Use the “Emergency redirect path” afterhours template embedded in after-hours trees whenever emergency symptoms are possible. In conversation, the agent immediately directs life-threatening symptoms to 911, describes nearest ER guidance from knowledge if asked, and avoids delaying care with intake questions. Enabled tools typically include transfer to human only if protocol requires, plus SMS ER guidance when safe, with clear escalation when the request exceeds the agent’s scope. This template is designed for every clinic needing a fail-safe after-hours emergency branch. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "transfer_to_human",
      "send_sms"
    ],
    "suggestedVoice": "ash",
    "tags": [
      "emergency",
      "911",
      "after-hours"
    ],
    "graphSpec": {
      "greeting": "If this is a medical emergency, hang up and dial 911 now.",
      "steps": [
        {
          "type": "question",
          "label": "Emergency?",
          "prompt": "Are you experiencing a life-threatening emergency right now?",
          "options": [
            "Yes — call 911",
            "No",
            "Not sure"
          ]
        },
        {
          "type": "message",
          "label": "ER guidance",
          "prompt": "Provide clear 911/ER direction and do not delay with paperwork."
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Text ER guidance if appropriate"
        }
      ],
      "closing": "Please seek emergency care immediately if symptoms are severe."
    }
  },
  {
    "id": "afterhours-on-call-nurse",
    "typeId": "afterhours",
    "name": "On-call nurse connection",
    "summary": "Routes appropriate after-hours clinical concerns to the on-call nurse.",
    "description": "Use the “On-call nurse connection” afterhours template for urgent but non-911 clinical questions during nights and weekends. In conversation, the agent screens out true emergencies, captures a concise clinical reason, and warm-transfers to on-call nursing per clinic protocol. Enabled tools typically include transfer to human, SMS that on-call was requested, and voicemail fallback, with clear escalation when the request exceeds the agent’s scope. This template is designed for practices with formal on-call RN or clinician pools. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "transfer_to_human",
      "send_sms",
      "send_voicemail"
    ],
    "suggestedVoice": "sage",
    "tags": [
      "on-call",
      "nurse",
      "after-hours"
    ],
    "graphSpec": {
      "greeting": "I can connect you with our on-call nurse for urgent concerns. For emergencies, dial 911.",
      "steps": [
        {
          "type": "question",
          "label": "Emergency screen",
          "prompt": "Is this a life-threatening emergency?",
          "options": [
            "No",
            "Yes — call 911"
          ]
        },
        {
          "type": "message",
          "label": "Reason",
          "prompt": "Capture a concise reason for the on-call nurse."
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Transfer on-call nurse"
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Confirm on-call request"
        }
      ],
      "closing": "Stay available for the on-call clinician's call back if not connected live."
    }
  },
  {
    "id": "afterhours-weekend-urgent-care-info",
    "typeId": "afterhours",
    "name": "Weekend urgent care info",
    "summary": "Shares weekend urgent care options affiliated or recommended by the clinic.",
    "description": "Use the “Weekend urgent care info” afterhours template weekends when the clinic is closed but patients need timely non-emergent care options. In conversation, the agent lists affiliated urgent care hours and locations, clarifies what belongs in ER versus urgent care, and can text directions. Enabled tools typically include SMS/email directions and transfer if on-call still required, with clear escalation when the request exceeds the agent’s scope. This template is designed for primary care clinics partnering with urgent care networks. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_sms",
      "send_email",
      "transfer_to_human"
    ],
    "suggestedVoice": "coral",
    "tags": [
      "weekend",
      "urgent-care",
      "after-hours"
    ],
    "graphSpec": {
      "greeting": "Our clinic is closed for the weekend. I can share urgent care options for non-emergencies.",
      "steps": [
        {
          "type": "question",
          "label": "Emergency",
          "prompt": "Is this an emergency needing 911 or the ER?",
          "options": [
            "No",
            "Yes"
          ]
        },
        {
          "type": "message",
          "label": "Urgent care list",
          "prompt": "Share affiliated urgent care hours and addresses."
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Text urgent care directions"
        }
      ],
      "closing": "If symptoms worsen, seek emergency care without delay."
    }
  },
  {
    "id": "afterhours-holiday-voicemail-path",
    "typeId": "afterhours",
    "name": "Holiday voicemail path",
    "summary": "Holiday closure message with structured voicemail and urgent branching.",
    "description": "Use the “Holiday voicemail path” afterhours template on clinic holidays with modified or closed operations. In conversation, the agent announces holiday closure, offers urgent versus non-urgent paths, records messages, and can drop a confirming SMS. Enabled tools typically include voicemail, SMS, email ticket, and on-call transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for multi-site groups needing consistent holiday phone trees. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_voicemail",
      "send_sms",
      "send_email",
      "transfer_to_human"
    ],
    "suggestedVoice": "alloy",
    "tags": [
      "holiday",
      "voicemail",
      "after-hours"
    ],
    "graphSpec": {
      "greeting": "Our clinic is closed for the holiday. I can take a message or help with urgent needs.",
      "steps": [
        {
          "type": "question",
          "label": "Path",
          "prompt": "Urgent clinical need or non-urgent message?",
          "options": [
            "Urgent",
            "Non-urgent message"
          ]
        },
        {
          "type": "tool",
          "toolId": "send_voicemail",
          "label": "Capture voicemail path"
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Confirm received"
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "On-call if urgent"
        }
      ],
      "closing": "We will reopen per our holiday schedule. Dial 911 for emergencies."
    }
  },
  {
    "id": "afterhours-med-refill",
    "typeId": "afterhours",
    "name": "Medication refill after hours",
    "summary": "Captures after-hours refill requests with clear expectations on turnaround.",
    "description": "Use the “Medication refill after hours” afterhours template nights and weekends when patients request refills and clinicians are not in clinic. In conversation, the agent collects medication details, sets expectations that review happens next business day unless on-call criteria met, and escalates true clinical urgencies. Enabled tools typically include SMS confirmation, email to refill queue, voicemail, and on-call transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for clinics with high after-hours refill call volume. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_sms",
      "send_email",
      "send_voicemail",
      "transfer_to_human"
    ],
    "suggestedVoice": "marin",
    "tags": [
      "refill",
      "after-hours",
      "pharmacy"
    ],
    "graphSpec": {
      "greeting": "I can take an after-hours refill request. Most refills are reviewed on the next business day.",
      "steps": [
        {
          "type": "message",
          "label": "Details",
          "prompt": "Collect medication, dose, pharmacy, and whether the patient is completely out."
        },
        {
          "type": "question",
          "label": "Urgent?",
          "prompt": "Is this clinically urgent enough for on-call review tonight?",
          "options": [
            "No — next business day",
            "Yes — on-call"
          ]
        },
        {
          "type": "tool",
          "toolId": "send_email",
          "label": "Send to refill queue"
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "On-call if urgent"
        }
      ],
      "closing": "You will receive an update after clinical review."
    }
  },
  {
    "id": "afterhours-portal-password-reset",
    "typeId": "afterhours",
    "name": "Patient portal access help",
    "summary": "Guides patients through portal reset steps or tickets a support request.",
    "description": "Use the “Portal password reset help” afterhours template after hours when patients are locked out of the patient portal. In conversation, the agent walks through standard self-service reset steps, captures contact email/phone, and tickets staff follow-up when self-service fails. Enabled tools typically include SMS reset tips, email support ticket, update patient contact, and transfer if live support exists, with clear escalation when the request exceeds the agent’s scope. This template is designed for clinics with patient portals and frequent lockout calls outside business hours. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_sms",
      "send_email",
      "update_patient_info",
      "transfer_to_human"
    ],
    "suggestedVoice": "shimmer",
    "tags": [
      "portal",
      "password",
      "after-hours"
    ],
    "graphSpec": {
      "greeting": "I can help with patient portal password reset steps while the office is closed.",
      "steps": [
        {
          "type": "message",
          "label": "Self-service steps",
          "prompt": "Guide the standard portal forgot-password flow."
        },
        {
          "type": "question",
          "label": "Worked?",
          "prompt": "Were you able to reset your password?",
          "options": [
            "Yes",
            "No — need ticket",
            "Speak with support"
          ]
        },
        {
          "type": "tool",
          "toolId": "send_email",
          "label": "Ticket support"
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Send reset tips"
        }
      ],
      "closing": "Support will follow up on the next business day if a ticket was created."
    }
  },
  {
    "id": "afterhours-rx-pharmacy-hours",
    "typeId": "afterhours",
    "name": "Pharmacy hours & Rx pickup guidance",
    "summary": "Shares pharmacy hours and how to check if a prescription is ready.",
    "description": "Use the “Pharmacy hours & Rx pickup guidance” afterhours template after hours when patients ask whether they can pick up a prescription tonight. In conversation, the agent explains that readiness depends on pharmacy processing, shares known pharmacy hours from knowledge, and routes clinical refill urgencies appropriately. Enabled tools typically include SMS pharmacy details, email, and on-call transfer for clinical urgency, with clear escalation when the request exceeds the agent’s scope. This template is designed for clinics fielding after-hours pharmacy logistics questions. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_sms",
      "send_email",
      "transfer_to_human"
    ],
    "suggestedVoice": "cedar",
    "tags": [
      "pharmacy",
      "hours",
      "after-hours"
    ],
    "graphSpec": {
      "greeting": "I can share pharmacy hour guidance and help if your refill is urgent.",
      "steps": [
        {
          "type": "message",
          "label": "Pharmacy hours",
          "prompt": "Share known pharmacy hours and that readiness depends on pharmacy processing."
        },
        {
          "type": "question",
          "label": "Need?",
          "prompt": "Need pharmacy hours texted, or is this a clinically urgent medication issue?",
          "options": [
            "Text hours",
            "Clinically urgent",
            "All set"
          ]
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Text pharmacy hours"
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "On-call if urgent"
        }
      ],
      "closing": "Contact your pharmacy directly to confirm whether the prescription is ready."
    }
  },
  {
    "id": "afterhours-er-vs-clinic",
    "typeId": "afterhours",
    "name": "ER versus clinic guidance",
    "summary": "Helps callers choose ER, urgent care, or next-day clinic with safety-first language.",
    "description": "Use the “ER versus clinic guidance” afterhours template after hours when patients are unsure where to seek care. In conversation, the agent uses plain-language acuity guidance aligned to clinic policy, never delays emergencies, and offers next-business-day booking when appropriate. Enabled tools typically include SMS guidance, book appointment for next day, and on-call transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for primary care clinics educating panels about appropriate care venues. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "send_sms",
      "book_appointment",
      "transfer_to_human"
    ],
    "suggestedVoice": "verse",
    "tags": [
      "er",
      "urgent-care",
      "acuity",
      "after-hours"
    ],
    "graphSpec": {
      "greeting": "I can help you decide whether this needs the ER, urgent care, or a clinic follow-up. Emergencies should call 911.",
      "steps": [
        {
          "type": "question",
          "label": "Emergency signs",
          "prompt": "Severe chest pain, trouble breathing, stroke signs, or uncontrolled bleeding?",
          "options": [
            "No",
            "Yes — emergency"
          ]
        },
        {
          "type": "branch",
          "label": "Venue",
          "branches": [
            "Urgent care tonight",
            "Next-day clinic",
            "On-call nurse"
          ]
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book next-day clinic"
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Send venue guidance"
        }
      ],
      "closing": "When in doubt about severe symptoms, seek emergency care."
    }
  },
  {
    "id": "concierge-full-service-front-desk",
    "typeId": "concierge",
    "name": "Full-service front desk + schedule",
    "summary": "Combines FAQ, light intake, and booking in one premium conversation.",
    "description": "Use the “Full-service front desk + schedule” concierge template as a flagship agent for clinics that want one number to handle most non-clinical needs. In conversation, the agent answers hours and directions, captures demographics updates, books or reschedules visits, and transfers clinical or billing complexity with context. Enabled tools typically include book/reschedule/cancel, update patient info, collect payment, SMS/email, and human transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for multi-service outpatient clinics seeking a single premium patient entry point. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "reschedule_appointment",
      "cancel_appointment",
      "update_patient_info",
      "collect_payment",
      "send_sms",
      "send_email",
      "transfer_to_human"
    ],
    "suggestedVoice": "marin",
    "tags": [
      "concierge",
      "front-desk",
      "scheduling",
      "full-service"
    ],
    "graphSpec": {
      "greeting": "Welcome. I can help with appointments, clinic information, and account updates.",
      "steps": [
        {
          "type": "question",
          "label": "Need",
          "prompt": "What can I help with today?",
          "options": [
            "Book or change visit",
            "Clinic info",
            "Update my info",
            "Billing"
          ]
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book path"
        },
        {
          "type": "tool",
          "toolId": "update_patient_info",
          "label": "Update demographics"
        },
        {
          "type": "tool",
          "toolId": "collect_payment",
          "label": "Billing payment"
        }
      ],
      "closing": "Thank you for choosing our clinic. I'm here anytime you need help."
    }
  },
  {
    "id": "concierge-vip-patient-line",
    "typeId": "concierge",
    "name": "VIP patient line",
    "summary": "High-touch routing for executive or membership patients with priority handling.",
    "description": "Use the “VIP patient line” concierge template for concierge medicine or membership panels expecting white-glove phone experiences. In conversation, the agent recognizes VIP tone expectations, prioritizes scheduling flexibility, offers direct human escalation quickly, and keeps meticulous confirmation messaging. Enabled tools typically include book/reschedule, SMS/email confirmations, payments, and priority human transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for concierge primary care and executive health practices. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "reschedule_appointment",
      "send_sms",
      "send_email",
      "collect_payment",
      "transfer_to_human"
    ],
    "suggestedVoice": "ballad",
    "tags": [
      "vip",
      "membership",
      "concierge"
    ],
    "graphSpec": {
      "greeting": "Thank you for calling our priority line. How may I assist you today?",
      "steps": [
        {
          "type": "question",
          "label": "Priority need",
          "prompt": "Scheduling, clinical staff, travel visit planning, or billing?",
          "options": [
            "Scheduling",
            "Clinical staff",
            "Travel planning",
            "Billing"
          ]
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Priority booking"
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Priority human transfer"
        },
        {
          "type": "tool",
          "toolId": "send_email",
          "label": "Send confirmation packet"
        }
      ],
      "closing": "It is always our pleasure to assist you."
    }
  },
  {
    "id": "concierge-multi-location-routing",
    "typeId": "concierge",
    "name": "Multi-clinic patient care routing",
    "summary": "Routes callers to the correct site for hours, booking, and services.",
    "description": "Use the “Multi-location routing” concierge template for health systems or groups with multiple outpatient addresses on one main number. In conversation, the agent identifies the intended location, shares site-specific hours and directions, books at the right calendar, and transfers site staff when needed. Enabled tools typically include book appointment, SMS site directions, email, and transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for multi-site outpatient organizations consolidating telephony. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "send_sms",
      "send_email",
      "transfer_to_human",
      "reschedule_appointment"
    ],
    "suggestedVoice": "cedar",
    "tags": [
      "multi-location",
      "routing",
      "concierge"
    ],
    "graphSpec": {
      "greeting": "Welcome to our clinic group. I can connect you with the right location.",
      "steps": [
        {
          "type": "question",
          "label": "Location",
          "prompt": "Which location do you need?",
          "options": [
            "Main campus",
            "West clinic",
            "North clinic",
            "Not sure"
          ]
        },
        {
          "type": "message",
          "label": "Site info",
          "prompt": "Confirm site hours and services for the chosen location."
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book at selected site"
        },
        {
          "type": "tool",
          "toolId": "send_sms",
          "label": "Text site directions"
        }
      ],
      "closing": "Glad we found the right location for you."
    }
  },
  {
    "id": "concierge-bilingual-family-practice",
    "typeId": "concierge",
    "name": "Bilingual family practice concierge",
    "summary": "Family practice orchestration with language preference capture and warm support.",
    "description": "Use the “Bilingual family practice concierge” concierge template for family medicine clinics serving bilingual communities needing inclusive access. In conversation, the agent captures preferred language, helps with family scheduling including multiple dependents, shares hours and prep, and escalates interpreter needs to staff when required. Enabled tools typically include book/reschedule, update patient info, SMS/email in preferred channel, and transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for community family medicine clinics with Spanish/English or other bilingual panels. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "reschedule_appointment",
      "update_patient_info",
      "send_sms",
      "send_email",
      "transfer_to_human"
    ],
    "suggestedVoice": "coral",
    "tags": [
      "bilingual",
      "family-practice",
      "concierge"
    ],
    "graphSpec": {
      "greeting": "Welcome. Puedo ayudarle en inglés. How can I help your family today?",
      "steps": [
        {
          "type": "question",
          "label": "Language",
          "prompt": "Preferred language for this call?",
          "options": [
            "English",
            "Spanish",
            "Other — transfer"
          ]
        },
        {
          "type": "message",
          "label": "Family need",
          "prompt": "Ask whether booking is for an adult, child, or multiple family members."
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book family visit"
        },
        {
          "type": "tool",
          "toolId": "update_patient_info",
          "label": "Save language preference"
        }
      ],
      "closing": "Thank you. Gracias. We are here for your whole family."
    }
  },
  {
    "id": "concierge-specialty-orchestrator",
    "typeId": "concierge",
    "name": "Specialty clinic orchestrator",
    "summary": "Coordinates specialty FAQ, referrals, scheduling, and prep in one flow.",
    "description": "Use the “Specialty clinic orchestrator” concierge template for specialty departments that want a sophisticated single agent across patient journeys. In conversation, the agent answers specialty-specific FAQs, checks referral readiness, books consults, sends prep, and routes clinical triage concerns out safely. Enabled tools typically include book/reschedule, update patient info, SMS/email prep, payments, and transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for cardiology, ortho, GI, and other high-volume specialty outpatient clinics. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "reschedule_appointment",
      "update_patient_info",
      "send_sms",
      "send_email",
      "collect_payment",
      "transfer_to_human"
    ],
    "suggestedVoice": "cedar",
    "tags": [
      "specialty",
      "orchestrator",
      "concierge"
    ],
    "graphSpec": {
      "greeting": "Welcome to our specialty clinic. I can help with referrals, scheduling, and visit prep.",
      "steps": [
        {
          "type": "question",
          "label": "Journey stage",
          "prompt": "New referral, upcoming visit prep, reschedule, or clinical concern?",
          "options": [
            "New referral",
            "Visit prep",
            "Reschedule",
            "Clinical concern"
          ]
        },
        {
          "type": "tool",
          "toolId": "update_patient_info",
          "label": "Capture referral details"
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book consult"
        },
        {
          "type": "tool",
          "toolId": "send_email",
          "label": "Send specialty prep"
        }
      ],
      "closing": "We will make your specialty visit as smooth as possible."
    }
  },
  {
    "id": "concierge-executive-health",
    "typeId": "concierge",
    "name": "Executive health coordinator",
    "summary": "Coordinates comprehensive executive physicals, travel timing, and results follow-up.",
    "description": "Use the “Executive health coordinator” concierge template for executive health programs packing labs, imaging, and clinician visits into one day. In conversation, the agent schedules multi-step executive physical agendas, confirms fasting and arrival logistics, collects deposits if required, and arranges results follow-up. Enabled tools typically include book appointment, reminders, collect payment, SMS/email itineraries, and transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for executive health and corporate wellness clinic programs. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "send_appointment_reminder",
      "collect_payment",
      "send_sms",
      "send_email",
      "transfer_to_human"
    ],
    "suggestedVoice": "ash",
    "tags": [
      "executive-health",
      "physical",
      "concierge"
    ],
    "graphSpec": {
      "greeting": "Welcome to executive health. I can coordinate your comprehensive visit itinerary.",
      "steps": [
        {
          "type": "message",
          "label": "Itinerary",
          "prompt": "Explain typical executive physical components and timing."
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book executive physical"
        },
        {
          "type": "tool",
          "toolId": "send_email",
          "label": "Email itinerary and fasting instructions"
        },
        {
          "type": "tool",
          "toolId": "collect_payment",
          "label": "Collect program deposit if required"
        }
      ],
      "closing": "Your itinerary will arrive by email with arrival and fasting details."
    }
  },
  {
    "id": "concierge-surgical-coordinator",
    "typeId": "concierge",
    "name": "Surgical coordinator",
    "summary": "Guides surgical patients through scheduling, clearance, prep, and follow-up visits.",
    "description": "Use the “Surgical coordinator” concierge template for surgical specialty clinics coordinating elective procedure journeys. In conversation, the agent helps schedule consults and OR-related clinic visits, reminds about clearance and prep, captures barriers, and escalates clinical post-op concerns. Enabled tools typically include book/reschedule, reminders, SMS/email prep, update patient info, and transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for surgery centers and surgical specialty outpatient practices. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "reschedule_appointment",
      "send_appointment_reminder",
      "send_sms",
      "send_email",
      "update_patient_info",
      "transfer_to_human"
    ],
    "suggestedVoice": "sage",
    "tags": [
      "surgery",
      "coordinator",
      "concierge"
    ],
    "graphSpec": {
      "greeting": "I can help coordinate your surgical consult, clearance, and follow-up visits.",
      "steps": [
        {
          "type": "question",
          "label": "Stage",
          "prompt": "Where are you in the surgical journey?",
          "options": [
            "New consult",
            "Clearance/prep",
            "Post-op concern",
            "Reschedule"
          ]
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book surgical clinic visit"
        },
        {
          "type": "tool",
          "toolId": "send_email",
          "label": "Send prep/clearance checklist"
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Escalate post-op concerns"
        }
      ],
      "closing": "Our surgical team is with you at every step."
    }
  },
  {
    "id": "concierge-oncology-support-navigator",
    "typeId": "concierge",
    "name": "Oncology support navigator",
    "summary": "Compassionate navigation for oncology scheduling, symptoms routing, and support resources.",
    "description": "Use the “Oncology support navigator” concierge template for oncology outpatient programs needing empathetic, highly reliable coordination. In conversation, the agent helps with infusion or clinic scheduling, routes concerning symptoms urgently, shares support resource pointers, and never minimizes red flags. Enabled tools typically include book/reschedule, SMS/email, transfer to clinical team, and update patient contacts, with clear escalation when the request exceeds the agent’s scope. This template is designed for medical oncology and cancer center outpatient clinics. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "reschedule_appointment",
      "send_sms",
      "send_email",
      "update_patient_info",
      "transfer_to_human"
    ],
    "suggestedVoice": "ballad",
    "tags": [
      "oncology",
      "navigator",
      "concierge"
    ],
    "graphSpec": {
      "greeting": "Welcome. I'm here to help with oncology appointments and connect you to support quickly.",
      "steps": [
        {
          "type": "question",
          "label": "Need",
          "prompt": "Scheduling, symptom concern, or support resources?",
          "options": [
            "Scheduling",
            "Symptom concern",
            "Support resources"
          ]
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book oncology visit"
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Urgent clinical transfer"
        },
        {
          "type": "tool",
          "toolId": "send_email",
          "label": "Send support resources"
        }
      ],
      "closing": "You are not alone—please reach out anytime concerns arise."
    }
  },
  {
    "id": "concierge-chronic-care-hub",
    "typeId": "concierge",
    "name": "Chronic care hub",
    "summary": "Unified hub for chronic care scheduling, adherence check-ins, and care-team routing.",
    "description": "Use the “Chronic care hub” concierge template for PCMH or CCM-style programs wanting one orchestrated patient experience. In conversation, the agent books chronic care visits, runs light adherence check-ins, updates contacts, coordinates outreach reminders, and escalates clinical changes. Enabled tools typically include book appointment, reminders, SMS/email, update patient info, payments if needed, and transfer, with clear escalation when the request exceeds the agent’s scope. This template is designed for primary care organizations operating formal chronic care management panels. Keep clinic knowledge current so hours, policies, and contact paths stay accurate. Review transcripts periodically to tighten prompts and reduce unnecessary transfers while preserving patient safety and a professional outpatient tone.",
    "defaultTools": [
      "book_appointment",
      "send_appointment_reminder",
      "send_sms",
      "send_email",
      "update_patient_info",
      "collect_payment",
      "transfer_to_human"
    ],
    "suggestedVoice": "verse",
    "tags": [
      "chronic-care",
      "ccm",
      "hub",
      "concierge"
    ],
    "graphSpec": {
      "greeting": "Welcome to your chronic care hub. I can help with visits, check-ins, and care-team connection.",
      "steps": [
        {
          "type": "question",
          "label": "Hub need",
          "prompt": "Book a visit, adherence check-in, update info, or speak with the care team?",
          "options": [
            "Book visit",
            "Adherence check-in",
            "Update info",
            "Care team"
          ]
        },
        {
          "type": "tool",
          "toolId": "book_appointment",
          "label": "Book chronic care visit"
        },
        {
          "type": "tool",
          "toolId": "update_patient_info",
          "label": "Update contacts"
        },
        {
          "type": "tool",
          "toolId": "transfer_to_human",
          "label": "Care team transfer"
        }
      ],
      "closing": "Your care team is stronger when we stay connected. Thank you."
    }
  }
];

const AGENT_TEMPLATES_ALL = [...AGENT_TEMPLATES, ...EXTRA_AGENT_TEMPLATES];

/** Ensure every catalog entry reads as patient/medicine scoped. */
function medicalizeTemplate(t) {
  if (!t || typeof t !== "object") return t;
  const description = String(t.description || "");
  const needsPatientCue =
    !/patient|clinic|medical|caregiver|clinician|nurse|physician|prescription|lab|visit/i.test(
      `${t.name} ${t.summary} ${description}`
    );
  return {
    ...t,
    summary: needsPatientCue
      ? `Patient care: ${t.summary || t.name}`
      : t.summary,
    description: needsPatientCue
      ? `Patient/medicine focus — ${description}`
      : description
  };
}

function listAgentTemplates(filter = {}) {
  const typeId = filter && filter.typeId != null ? String(filter.typeId).trim().toLowerCase() : "";
  const list = typeId
    ? AGENT_TEMPLATES_ALL.filter((t) => t.typeId === typeId)
    : AGENT_TEMPLATES_ALL;
  return list.map((t) => {
    const m = medicalizeTemplate(t);
    return {
      ...m,
      defaultTools: [...(m.defaultTools || [])],
      tags: [...(m.tags || [])],
      graphSpec: m.graphSpec
        ? {
            greeting: m.graphSpec.greeting,
            closing: m.graphSpec.closing,
            steps: Array.isArray(m.graphSpec.steps)
              ? m.graphSpec.steps.map((s) => ({
                  ...s,
                  options: s.options ? [...s.options] : undefined,
                  branches: s.branches ? [...s.branches] : undefined
                }))
              : []
          }
        : m.graphSpec
    };
  });
}

function getAgentTemplate(id) {
  const key = String(id || "").trim();
  const found = AGENT_TEMPLATES_ALL.find((t) => t.id === key);
  if (!found) return null;
  const m = medicalizeTemplate(found);
  return {
    ...m,
    defaultTools: [...(m.defaultTools || [])],
    tags: [...(m.tags || [])],
    graphSpec: m.graphSpec
      ? {
          greeting: m.graphSpec.greeting,
          closing: m.graphSpec.closing,
          steps: Array.isArray(m.graphSpec.steps)
            ? m.graphSpec.steps.map((s) => ({
                ...s,
                options: s.options ? [...s.options] : undefined,
                branches: s.branches ? [...s.branches] : undefined
              }))
            : []
        }
      : m.graphSpec
  };
}

/**
 * Build a normalized conversation-flow graph from a template.
 * Uses a detailed medical brain (≥15–20 nodes) expanded from the compact graphSpec.
 * @param {object} template
 */
function resolveTemplateGraph(template) {
  if (!template || typeof template !== "object") {
    return normalizeGraph(null);
  }
  return resolveDetailedTemplateGraph(template);
}

module.exports = {
  AGENT_TEMPLATES: AGENT_TEMPLATES_ALL,
  listAgentTemplates,
  getAgentTemplate,
  resolveTemplateGraph
};
