/**
 * 126 distinct medical template TOPICS (14 types × 9).
 *
 * Design rules:
 * - Each topic is a real clinic specialty desk — not a single micro-action.
 * - Appointment-related topics always include book + reschedule + cancel +
 *   same-day + confirm/remind + telehealth options inside one brain.
 * - Intake topics always include the full intake spectrum (identity, contact,
 *   meds, allergies, insurance, consents) with a topic emphasis.
 * - Topic focus only colors the specialist persona — it must not strip features.
 */

const { getAgentType } = require("./agentTypes");

function toolsFor(typeId, extra = []) {
  const type = getAgentType(typeId);
  const base = Array.isArray(type?.defaultTools) ? type.defaultTools.map(String) : [];
  return [...new Set([...base, ...extra.map(String)])];
}

function T(partial) {
  const typeId = partial.typeId;
  return {
    suggestedVoice: partial.suggestedVoice || "marin",
    defaultTools: toolsFor(typeId, partial.extraTools || []),
    tags: partial.tags || [],
    topicFocus: partial.topicFocus || partial.id,
    ...partial
  };
}

/** 90 core catalog topics (10 types × 9) — receptionist through afterhours + concierge */
const CORE_TOPICS = [
  // —— Receptionist (9): full front-desk capabilities, distinct topics ——
  T({
    id: "receptionist-clinic-access-hub",
    typeId: "receptionist",
    name: "Clinic access & visitor desk",
    summary: "Full front-desk access: hours, holidays, parking, directions, lobby, and routing.",
    description:
      "Complete patient access desk for {{clinic_name}}. Handles hours, holiday closures, parking, building directions, suite finding, lobby wait notices, and warm routing to scheduling, clinical, billing, or pharmacy desks when the request is not pure access info.",
    tags: ["access", "hours", "directions", "parking", "front-desk"],
    topicFocus: "clinic_access"
  }),
  T({
    id: "receptionist-provider-services-desk",
    typeId: "receptionist",
    name: "Provider & services information desk",
    summary: "Full provider directory, specialties, and service routing for patients.",
    description:
      "Helps patients learn which clinicians and services {{clinic_name}} offers, matches concerns to specialties at a high level, and routes booking or clinical questions without inventing availability.",
    tags: ["providers", "services", "directory", "front-desk"],
    topicFocus: "providers_services"
  }),
  T({
    id: "receptionist-new-patient-first-call",
    typeId: "receptionist",
    name: "New patient first-call concierge",
    summary: "Full first-call onboarding: welcome, what to bring, insurance basics, and next steps.",
    description:
      "First phone experience for new patients: welcome, what to bring, insurance card tips, portal signup pointers, and handoff into scheduling or intake when they are ready to book.",
    tags: ["new-patient", "onboarding", "welcome", "front-desk"],
    topicFocus: "new_patient_welcome"
  }),
  T({
    id: "receptionist-insurance-billing-router",
    typeId: "receptionist",
    name: "Insurance & billing front-desk router",
    summary: "Answers acceptance FAQs and routes balances, denials, and estimates to billing.",
    description:
      "Front-desk insurance acceptance FAQ plus accurate routing into billing for balances, denials, prior auth, estimates, and payment plans — without inventing coverage.",
    tags: ["insurance", "billing-route", "front-desk"],
    topicFocus: "insurance_billing_route"
  }),
  T({
    id: "receptionist-clinical-request-router",
    typeId: "receptionist",
    name: "Clinical & refill request router",
    summary: "Routes symptoms, refills, and nurse-line needs to the right clinical path.",
    description:
      "Front desk that recognizes clinical intents (symptoms, refill, nurse questions) and routes safely to triage, pharmacy, or staff without diagnosing.",
    tags: ["clinical-route", "refill-route", "front-desk"],
    topicFocus: "clinical_router"
  }),
  T({
    id: "receptionist-forms-records-desk",
    typeId: "receptionist",
    name: "Forms, records & admin desk",
    summary: "Full admin desk for forms, records requests, faxes, and drop-offs.",
    description:
      "Handles school/work forms logistics, records requests, drop-off instructions, and admin paperwork routing for patients and caregivers.",
    tags: ["forms", "records", "admin", "front-desk"],
    topicFocus: "forms_records"
  }),
  T({
    id: "receptionist-day-of-visit-desk",
    typeId: "receptionist",
    name: "Day-of visit & lobby support desk",
    summary: "Full day-of support: check-in tips, delays, what to do on arrival.",
    description:
      "Supports patients the day of their visit: arrival instructions, lobby delays, late arrival policy, and routing to scheduling if they need to reschedule or cancel.",
    tags: ["day-of", "lobby", "wait-times", "front-desk"],
    topicFocus: "day_of_visit"
  }),
  T({
    id: "receptionist-multi-location-desk",
    typeId: "receptionist",
    name: "Multi-location campus navigation desk",
    summary: "Full navigation across clinic locations, campuses, and departments.",
    description:
      "Helps patients choose the right location, get campus directions, and route to the correct department or scheduling path for multi-site practices.",
    tags: ["multi-location", "campus", "navigation", "front-desk"],
    topicFocus: "multi_location"
  }),
  T({
    id: "receptionist-general-patient-desk",
    typeId: "receptionist",
    name: "General patient information desk",
    summary: "Full catch-all front desk that detects intent and routes across the clinic.",
    description:
      "Primary patient information desk that accurately detects intent across access, providers, clinical routing, billing, forms, and day-of needs, then either answers from knowledge or routes to the right specialty path.",
    tags: ["general", "concierge-lite", "front-desk"],
    topicFocus: "general_desk"
  }),

  // —— Scheduler (9): EACH is full appointment orchestration for a care domain ——
  T({
    id: "scheduler-outpatient-visit-desk",
    typeId: "scheduler",
    name: "Outpatient visit scheduling desk",
    summary: "Complete outpatient scheduling: book, reschedule, cancel, same-day, telehealth, reminders.",
    description:
      "Full appointment desk for outpatient medical visits. One brain handles booking, rescheduling, cancellation, same-day access, telehealth options, confirmations, reminders, and what-to-bring — not separate micro-templates.",
    tags: ["outpatient", "appointment", "full-scheduling"],
    topicFocus: "outpatient_scheduling"
  }),
  T({
    id: "scheduler-specialist-visit-desk",
    typeId: "scheduler",
    name: "Specialist visit scheduling desk",
    summary: "Full specialist scheduling with referral context plus all appointment actions.",
    description:
      "Specialist appointment orchestration including referral/order context, provider preference, and every appointment action: book, reschedule, cancel, same-day, telehealth, and reminders.",
    tags: ["specialist", "appointment", "full-scheduling"],
    topicFocus: "specialist_scheduling"
  }),
  T({
    id: "scheduler-procedure-diagnostics-desk",
    typeId: "scheduler",
    name: "Procedure & diagnostics scheduling desk",
    summary: "Full procedure/diagnostics scheduling including prep holds and all appointment actions.",
    description:
      "Schedules procedures and diagnostic visits with prep/hold awareness while still supporting book, reschedule, cancel, same-day changes, confirmations, and reminders in one flow.",
    tags: ["procedure", "diagnostics", "appointment", "full-scheduling"],
    topicFocus: "procedure_scheduling"
  }),
  T({
    id: "scheduler-telehealth-desk",
    typeId: "scheduler",
    name: "Telehealth visit scheduling desk",
    summary: "Full telehealth desk: book/reschedule/cancel plus tech check and join instructions.",
    description:
      "End-to-end telehealth scheduling: modality choice, tech check, join links, and the full set of appointment actions including reschedule, cancel, and reminders.",
    tags: ["telehealth", "appointment", "full-scheduling"],
    topicFocus: "telehealth_scheduling"
  }),
  T({
    id: "scheduler-same-day-urgent-access",
    typeId: "scheduler",
    name: "Same-day & urgent access scheduling desk",
    summary: "Full urgent-access scheduling with safety screen and all appointment actions.",
    description:
      "Same-day and urgent clinic access with emergency screening, slot finding, and complete appointment controls (book, move, cancel, confirm) for patients who need care quickly.",
    tags: ["same-day", "urgent-access", "appointment", "full-scheduling"],
    topicFocus: "same_day_scheduling"
  }),
  T({
    id: "scheduler-pediatric-visit-desk",
    typeId: "scheduler",
    name: "Pediatric visit scheduling desk",
    summary: "Full pediatric scheduling for caregivers: well, sick, vaccines, plus all appointment actions.",
    description:
      "Caregiver-facing pediatric scheduling covering well-child, sick visits, and vaccines while always offering book, reschedule, cancel, same-day, and reminder flows.",
    tags: ["pediatrics", "caregiver", "appointment", "full-scheduling"],
    topicFocus: "pediatric_scheduling"
  }),
  T({
    id: "scheduler-preventive-wellness-desk",
    typeId: "scheduler",
    name: "Preventive & wellness visit scheduling desk",
    summary: "Full preventive/wellness scheduling with complete appointment lifecycle actions.",
    description:
      "Annual physicals, wellness, and preventive visits with full appointment lifecycle support: book, reschedule, cancel, reminders, and related telehealth options.",
    tags: ["wellness", "preventive", "appointment", "full-scheduling"],
    topicFocus: "wellness_scheduling"
  }),
  T({
    id: "scheduler-followup-series-desk",
    typeId: "scheduler",
    name: "Follow-up & care-series scheduling desk",
    summary: "Full follow-up and multi-visit series scheduling with all appointment actions.",
    description:
      "Coordinates return visits and care series (post-op, chronic follow-ups, therapy-like series) including book, reschedule, cancel, confirm, and reminder management.",
    tags: ["follow-up", "series", "appointment", "full-scheduling"],
    topicFocus: "followup_series_scheduling"
  }),
  T({
    id: "scheduler-multi-site-provider-desk",
    typeId: "scheduler",
    name: "Multi-site & multi-provider scheduling desk",
    summary: "Full multi-location/provider scheduling with complete appointment actions.",
    description:
      "Helps patients choose location and provider, then executes the full appointment toolkit: book, reschedule, cancel, same-day, telehealth, and reminders across sites.",
    tags: ["multi-site", "multi-provider", "appointment", "full-scheduling"],
    topicFocus: "multisite_scheduling"
  }),

  // —— Intake (9): each full intake spectrum + topic emphasis ——
  T({
    id: "intake-new-patient-complete",
    typeId: "intake",
    name: "Complete new patient intake desk",
    summary: "Full new-patient intake: identity, contact, meds, allergies, insurance, consents.",
    description:
      "End-to-end new patient intake covering demographics, emergency contacts, medications, allergies, insurance, consents, and portal/forms follow-through.",
    tags: ["new-patient", "full-intake"],
    topicFocus: "new_patient_intake"
  }),
  T({
    id: "intake-returning-patient-update",
    typeId: "intake",
    name: "Returning patient chart update desk",
    summary: "Full chart-update intake for returning patients across all intake sections.",
    description:
      "Returning patient updates with access to every intake section (contact, meds, allergies, insurance, consents) and save/confirm flows.",
    tags: ["returning", "chart-update", "full-intake"],
    topicFocus: "returning_intake"
  }),
  T({
    id: "intake-preprocedure-complete",
    typeId: "intake",
    name: "Pre-procedure intake desk",
    summary: "Full pre-procedure intake including clinical history sections and consents.",
    description:
      "Pre-op / pre-procedure intake with full demographics and clinical history capture, medication holds awareness, consents, and escalation for red flags.",
    tags: ["pre-procedure", "pre-op", "full-intake"],
    topicFocus: "preprocedure_intake"
  }),
  T({
    id: "intake-telehealth-complete",
    typeId: "intake",
    name: "Telehealth visit intake desk",
    summary: "Full telehealth intake: identity, clinical sections, tech check, consents.",
    description:
      "Telehealth-ready intake combining standard medical intake sections with device/connectivity checks and telehealth consents.",
    tags: ["telehealth", "full-intake"],
    topicFocus: "telehealth_intake"
  }),
  T({
    id: "intake-pediatric-caregiver",
    typeId: "intake",
    name: "Pediatric caregiver intake desk",
    summary: "Full pediatric intake with caregiver identity, child details, and all sections.",
    description:
      "Caregiver-led pediatric intake covering guardian info, child demographics, meds, allergies, insurance, school/forms needs, and consents.",
    tags: ["pediatrics", "caregiver", "full-intake"],
    topicFocus: "pediatric_intake"
  }),
  T({
    id: "intake-insurance-eligibility",
    typeId: "intake",
    name: "Insurance & eligibility intake desk",
    summary: "Full intake with deep insurance/eligibility capture plus other sections on demand.",
    description:
      "Insurance-forward intake that still can capture demographics, meds, allergies, and consents while emphasizing payer, member ID, subscriber, and card logistics.",
    tags: ["insurance", "eligibility", "full-intake"],
    topicFocus: "insurance_intake"
  }),
  T({
    id: "intake-referral-packet",
    typeId: "intake",
    name: "Referral packet intake desk",
    summary: "Full referral intake packet with clinical and administrative sections.",
    description:
      "Captures referral paperwork context plus complete patient intake sections needed before a specialty visit.",
    tags: ["referral", "packet", "full-intake"],
    topicFocus: "referral_intake"
  }),
  T({
    id: "intake-same-day-abbreviated",
    typeId: "intake",
    name: "Same-day abbreviated intake desk",
    summary: "Fast same-day intake that still covers safety-critical sections and can expand.",
    description:
      "Accelerated same-day intake prioritizing identity, red-flag allergies/meds, and insurance essentials, with ability to open full sections when needed.",
    tags: ["same-day", "abbreviated", "full-intake"],
    topicFocus: "sameday_intake"
  }),
  T({
    id: "intake-specialty-clinic",
    typeId: "intake",
    name: "Specialty clinic intake desk",
    summary: "Full specialty intake with domain history plus standard medical sections.",
    description:
      "Specialty outpatient intake combining standard sections with specialty history questionnaires and clinician-ready summaries.",
    tags: ["specialty", "full-intake"],
    topicFocus: "specialty_intake"
  }),

  // —— Triage (9): each full triage toolkit + clinical topic ——
  T({
    id: "triage-general-nurse-line",
    typeId: "triage",
    name: "General nurse-line triage desk",
    summary: "Full nurse-line triage: emergency screen, symptom paths, disposition, booking/transfer.",
    description:
      "Complete outpatient nurse-line desk with emergency red flags, multi-symptom screening, caregiver mode, disposition (self-care / visit / transfer), and callback capture.",
    tags: ["nurse-line", "full-triage"],
    topicFocus: "general_triage"
  }),
  T({
    id: "triage-respiratory-infectious",
    typeId: "triage",
    name: "Respiratory & infectious symptom triage desk",
    summary: "Full triage toolkit focused on cough, flu, COVID-like, and breathing concerns.",
    description:
      "Respiratory/infectious symptom triage with full safety screens, isolation guidance boundaries, disposition, and clinic visit routing.",
    tags: ["respiratory", "flu", "covid", "full-triage"],
    topicFocus: "respiratory_triage"
  }),
  T({
    id: "triage-cardiac-chest",
    typeId: "triage",
    name: "Chest pain & cardiac red-flag triage desk",
    summary: "Full triage with cardiac red-flag emphasis and complete disposition toolkit.",
    description:
      "Chest pain and cardiac-concern triage that prioritizes emergency redirect while retaining full nurse-line dispositions for non-emergent presentations.",
    tags: ["chest-pain", "cardiac", "full-triage"],
    topicFocus: "cardiac_triage"
  }),
  T({
    id: "triage-pediatric-symptoms",
    typeId: "triage",
    name: "Pediatric symptom triage desk",
    summary: "Full pediatric triage for caregivers including fever age gates and dispositions.",
    description:
      "Caregiver pediatric triage with infant fever rules, hydration/breathing screens, and full disposition options including sick-visit booking and nurse transfer.",
    tags: ["pediatrics", "fever", "full-triage"],
    topicFocus: "pediatric_triage"
  }),
  T({
    id: "triage-medication-reaction",
    typeId: "triage",
    name: "Medication reaction triage desk",
    summary: "Full med-reaction triage with anaphylaxis screen and clinical escalation paths.",
    description:
      "Medication side-effect and reaction triage including emergency allergy screens, documentation, and clinician escalation — never dose changes.",
    tags: ["side-effect", "allergy", "full-triage"],
    topicFocus: "med_reaction_triage"
  }),
  T({
    id: "triage-mental-health-crisis",
    typeId: "triage",
    name: "Mental health & crisis routing desk",
    summary: "Full crisis-aware triage with warm transfer and safety-first routing.",
    description:
      "Mental health concern routing with suicidal ideation emergency handling, warm transfer, and supportive non-diagnostic conversation within clinic protocol.",
    tags: ["mental-health", "crisis", "full-triage"],
    topicFocus: "mental_health_triage"
  }),
  T({
    id: "triage-wound-injury",
    typeId: "triage",
    name: "Wound & injury triage desk",
    summary: "Full wound/injury triage with bleeding/emergency screens and dispositions.",
    description:
      "Wound and injury triage covering severity, bleeding, infection signs, tetanus questions at a protocol level, and clinic vs ER disposition.",
    tags: ["wound", "injury", "full-triage"],
    topicFocus: "wound_triage"
  }),
  T({
    id: "triage-postoperative",
    typeId: "triage",
    name: "Post-operative concern triage desk",
    summary: "Full post-op triage: red flags, wound/pain/fever paths, and clinician routing.",
    description:
      "Post-operative symptom triage with surgery-date context, red-flag escalation, and complete disposition toolkit back to the surgical team or ER.",
    tags: ["post-op", "surgery", "full-triage"],
    topicFocus: "postop_triage"
  }),
  T({
    id: "triage-urgent-vs-routine-access",
    typeId: "triage",
    name: "Urgent vs routine access triage desk",
    summary: "Full access triage deciding emergency, same-day, routine visit, or self-care.",
    description:
      "Access-oriented clinical triage that classifies urgency and then executes the right next step: 911, same-day schedule, routine book, advice, or staff transfer.",
    tags: ["urgent-vs-routine", "access", "full-triage"],
    topicFocus: "access_triage"
  }),

  // —— Billing (9): each full billing desk + topic emphasis ——
  T({
    id: "billing-patient-financial-desk",
    typeId: "billing",
    name: "Patient financial counseling desk",
    summary: "Full billing desk: balance, pay, plans, estimates, denials, PA, refunds, HSA.",
    description:
      "Complete patient financial counseling covering balances, statements, payments, payment plans, estimates, insurance denials, prior auth status, refunds, and HSA/FSA guidance.",
    tags: ["financial", "full-billing"],
    topicFocus: "full_billing"
  }),
  T({
    id: "billing-insurance-claims-desk",
    typeId: "billing",
    name: "Insurance claims & denials desk",
    summary: "Full billing toolkit with deep claims/denial workflows.",
    description:
      "Insurance claim and denial counseling with access to the full billing toolkit when patients also need payment plans, estimates, or transfers.",
    tags: ["claims", "denials", "full-billing"],
    topicFocus: "claims_billing"
  }),
  T({
    id: "billing-prior-auth-financial",
    typeId: "billing",
    name: "Prior authorization financial desk",
    summary: "Full billing desk specializing in prior-auth status and next steps.",
    description:
      "Prior authorization status, appeals routing, and related financial counseling without inventing outcomes, plus payment/estimate paths when needed.",
    tags: ["prior-auth", "full-billing"],
    topicFocus: "pa_billing"
  }),
  T({
    id: "billing-estimates-selfpay",
    typeId: "billing",
    name: "Cost estimate & self-pay desk",
    summary: "Full estimates/self-pay counseling with complete billing actions available.",
    description:
      "Visit and procedure estimates, self-pay quotes, and disclaimer-safe counseling while retaining payments, plans, and insurance paths.",
    tags: ["estimate", "self-pay", "full-billing"],
    topicFocus: "estimate_billing"
  }),
  T({
    id: "billing-payment-assistance",
    typeId: "billing",
    name: "Payment plans & assistance desk",
    summary: "Full payment-plan and hardship desk with broader billing capabilities.",
    description:
      "Payment plans, financial assistance intake, and payment collection with access to statement and insurance explanations when related.",
    tags: ["payment-plan", "assistance", "full-billing"],
    topicFocus: "assistance_billing"
  }),
  T({
    id: "billing-refunds-credits",
    typeId: "billing",
    name: "Refunds & credits desk",
    summary: "Full refund/credit intake plus related billing support actions.",
    description:
      "Refund and credit request intake with identity verification and routing, plus ability to discuss balances and statements in the same conversation.",
    tags: ["refund", "credit", "full-billing"],
    topicFocus: "refund_billing"
  }),
  T({
    id: "billing-statements-eob",
    typeId: "billing",
    name: "Statements & EOB explanation desk",
    summary: "Full statement/EOB explanation with payment and dispute paths.",
    description:
      "Explains statements and EOBs in plain language, then can continue into payment, plan, denial, or staff escalation paths.",
    tags: ["statement", "eob", "full-billing"],
    topicFocus: "statement_billing"
  }),
  T({
    id: "billing-hsa-fsa-methods",
    typeId: "billing",
    name: "HSA/FSA & payment methods desk",
    summary: "Full payment-methods counseling including HSA/FSA and standard billing actions.",
    description:
      "Guides patients on HSA/FSA and accepted payment methods while still supporting balances, estimates, and payment collection.",
    tags: ["hsa", "fsa", "payment-methods", "full-billing"],
    topicFocus: "methods_billing"
  }),
  T({
    id: "billing-procedure-financial",
    typeId: "billing",
    name: "Procedure financial counseling desk",
    summary: "Full procedure financial counseling: estimate, auth, deposits, and payments.",
    description:
      "Procedure-focused financial counseling covering estimates, deposits, prior auth, insurance questions, and payment arrangements end-to-end.",
    tags: ["procedure", "financial-counseling", "full-billing"],
    topicFocus: "procedure_billing"
  }),

  // —— Follow-up (9) ——
  T({
    id: "followup-post-visit-recovery",
    typeId: "followup",
    name: "Post-visit recovery follow-up desk",
    summary: "Full post-visit follow-up: status, red flags, rebook, adherence, staff route.",
    description:
      "Complete post-visit recovery check-in with symptom trend, red-flag escalation, advice boundaries, rebooking, and care-team messaging.",
    tags: ["post-visit", "recovery", "full-followup"],
    topicFocus: "post_visit_followup"
  }),
  T({
    id: "followup-results-review",
    typeId: "followup",
    name: "Results review follow-up desk",
    summary: "Full results follow-up logistics without interpretation, plus booking/transfer.",
    description:
      "Results-ready and pending follow-up with portal help, clinician callback routing, and review-visit booking — never interprets results.",
    tags: ["results", "labs", "full-followup"],
    topicFocus: "results_followup"
  }),
  T({
    id: "followup-medication-adherence",
    typeId: "followup",
    name: "Medication adherence follow-up desk",
    summary: "Full adherence follow-up including refill routing and clinical escalation.",
    description:
      "Medication adherence outreach covering barriers, side effects, refill needs, and clinician escalation while offering booking when a visit is needed.",
    tags: ["adherence", "medication", "full-followup"],
    topicFocus: "med_adherence_followup"
  }),
  T({
    id: "followup-care-plan",
    typeId: "followup",
    name: "Care-plan adherence follow-up desk",
    summary: "Full care-plan follow-up with lifestyle, goals, and visit scheduling options.",
    description:
      "Reinforces care-plan goals, checks barriers, escalates worsening symptoms, and can schedule follow-up visits.",
    tags: ["care-plan", "full-followup"],
    topicFocus: "careplan_followup"
  }),
  T({
    id: "followup-procedure-journey",
    typeId: "followup",
    name: "Procedure prep & recovery follow-up desk",
    summary: "Full procedure journey follow-up: prep, day-of, recovery, and rebooking.",
    description:
      "Covers procedure prep reminders, day-of logistics, recovery check-ins, and scheduling changes across the procedure journey.",
    tags: ["procedure", "prep", "recovery", "full-followup"],
    topicFocus: "procedure_followup"
  }),
  T({
    id: "followup-noshow-recovery",
    typeId: "followup",
    name: "No-show recovery & rebooking desk",
    summary: "Full no-show recovery with reschedule/cancel and barrier support.",
    description:
      "Re-engages patients after missed visits, addresses barriers, and executes reschedule or cancel with reminder setup.",
    tags: ["no-show", "rebook", "full-followup"],
    topicFocus: "noshow_followup"
  }),
  T({
    id: "followup-discharge",
    typeId: "followup",
    name: "Hospital discharge follow-up desk",
    summary: "Full post-discharge follow-up: safety screen, meds, PCP visit, escalation.",
    description:
      "Hospital discharge follow-up covering red flags, medication reconciliation needs, PCP/specialty follow-up booking, and urgent escalation.",
    tags: ["discharge", "transition", "full-followup"],
    topicFocus: "discharge_followup"
  }),
  T({
    id: "followup-vaccine-preventive",
    typeId: "followup",
    name: "Vaccine & preventive follow-up desk",
    summary: "Full vaccine/preventive follow-up with scheduling and outreach actions.",
    description:
      "Vaccine and preventive care follow-up including due reminders, scheduling, and caregiver questions within clinic protocol.",
    tags: ["vaccine", "preventive", "full-followup"],
    topicFocus: "vaccine_followup"
  }),
  T({
    id: "followup-chronic-monthly",
    typeId: "followup",
    name: "Chronic care monthly follow-up desk",
    summary: "Full chronic monthly touchpoint with readings, adherence, and visit options.",
    description:
      "Monthly chronic care touchpoint combining symptom/reading checks, adherence, care-gap prompts, and follow-up booking.",
    tags: ["chronic", "monthly", "full-followup"],
    topicFocus: "chronic_monthly_followup"
  }),

  // —— Referral (9) ——
  T({
    id: "referral-care-coordination-desk",
    typeId: "referral",
    name: "Care referral coordination desk",
    summary: "Full referral desk: outbound, inbound, records, imaging, PA, status, booking.",
    description:
      "Complete referral coordination covering outbound and inbound referrals, records, imaging logistics, prior auth, status checks, and specialty visit booking.",
    tags: ["referral", "full-referral"],
    topicFocus: "full_referral"
  }),
  T({
    id: "referral-inbound-hub",
    typeId: "referral",
    name: "Inbound referral scheduling hub",
    summary: "Full inbound referral hub with scheduling and packet completeness checks.",
    description:
      "Inbound referral scheduling with packet completeness, insurance/PA checks, and full referral toolkit when status or records are needed.",
    tags: ["inbound", "full-referral"],
    topicFocus: "inbound_referral"
  }),
  T({
    id: "referral-outbound-hub",
    typeId: "referral",
    name: "Outbound specialist referral hub",
    summary: "Full outbound specialist referral creation and tracking desk.",
    description:
      "Creates and tracks outbound specialist referrals with urgency, specialty capture, PA awareness, and patient status updates.",
    tags: ["outbound", "full-referral"],
    topicFocus: "outbound_referral"
  }),
  T({
    id: "referral-imaging-diagnostics",
    typeId: "referral",
    name: "Imaging & diagnostics referral desk",
    summary: "Full imaging/diagnostics referral logistics with auth and scheduling paths.",
    description:
      "Imaging and diagnostics order coordination including prep pointers, auth, location options, and related referral actions.",
    tags: ["imaging", "diagnostics", "full-referral"],
    topicFocus: "imaging_referral"
  }),
  T({
    id: "referral-prior-auth-hub",
    typeId: "referral",
    name: "Referral prior authorization desk",
    summary: "Full PA-for-referral desk with status ladder and related referral actions.",
    description:
      "Prior authorization for referrals and procedures with status tracking, denial next steps, and adjacent referral/scheduling support.",
    tags: ["prior-auth", "full-referral"],
    topicFocus: "pa_referral"
  }),
  T({
    id: "referral-records-second-opinion",
    typeId: "referral",
    name: "Records & second-opinion desk",
    summary: "Full records request and second-opinion coordination desk.",
    description:
      "Medical records requests and second-opinion coordination with privacy-aware capture and referral scheduling when needed.",
    tags: ["records", "second-opinion", "full-referral"],
    topicFocus: "records_referral"
  }),
  T({
    id: "referral-transition-of-care",
    typeId: "referral",
    name: "Transition of care referral desk",
    summary: "Full transition-of-care coordination across facilities and follow-up visits.",
    description:
      "Transitions of care between hospital, SNF, home, and clinic with referral, records, and follow-up booking support.",
    tags: ["transition", "full-referral"],
    topicFocus: "transition_referral"
  }),
  T({
    id: "referral-dme-coordination",
    typeId: "referral",
    name: "DME order coordination desk",
    summary: "Full DME coordination including auth, vendor logistics, and status.",
    description:
      "Durable medical equipment coordination: order capture, insurance/auth, vendor logistics, and patient status updates.",
    tags: ["dme", "full-referral"],
    topicFocus: "dme_referral"
  }),
  T({
    id: "referral-home-health",
    typeId: "referral",
    name: "Home health & community referral desk",
    summary: "Full home health / community services referral desk.",
    description:
      "Home health and community service referrals with eligibility questions, agency coordination, and follow-up scheduling.",
    tags: ["home-health", "community", "full-referral"],
    topicFocus: "home_health_referral"
  }),

  // —— Campaign (9) ——
  T({
    id: "campaign-appointment-lifecycle",
    typeId: "campaign",
    name: "Appointment reminder & lifecycle outreach",
    summary: "Full reminder outreach: confirm, reschedule, cancel, opt-out, call-later.",
    description:
      "Outbound appointment lifecycle outreach that can confirm, reschedule, cancel, send details, call later, or opt out — not reminder-only.",
    tags: ["reminder", "appointment", "full-campaign"],
    topicFocus: "appt_campaign"
  }),
  T({
    id: "campaign-care-gap-recall",
    typeId: "campaign",
    name: "Care-gap recall outreach desk",
    summary: "Full care-gap recall with book, update info, remind-later, and opt-out.",
    description:
      "Population-health recall for overdue care with booking, information updates, deferral, and opt-out handling.",
    tags: ["care-gap", "recall", "full-campaign"],
    topicFocus: "recall_campaign"
  }),
  T({
    id: "campaign-vaccine-drive",
    typeId: "campaign",
    name: "Vaccine campaign outreach desk",
    summary: "Full vaccine campaign: educate lightly, book, defer, opt-out.",
    description:
      "Vaccine drive outreach with scheduling, caregiver questions within protocol, deferral, and opt-out.",
    tags: ["vaccine", "full-campaign"],
    topicFocus: "vaccine_campaign"
  }),
  T({
    id: "campaign-wellness-outreach",
    typeId: "campaign",
    name: "Wellness visit campaign desk",
    summary: "Full wellness outreach with booking and preference capture.",
    description:
      "Wellness visit campaign supporting booking, preferred timing, reminders, and opt-out.",
    tags: ["wellness", "full-campaign"],
    topicFocus: "wellness_campaign"
  }),
  T({
    id: "campaign-insurance-update",
    typeId: "campaign",
    name: "Insurance update campaign desk",
    summary: "Full insurance-update outreach with capture, verify-later, and booking if needed.",
    description:
      "Asks patients to update insurance cards, captures details or sends secure links, and can book visits when care is also overdue.",
    tags: ["insurance", "full-campaign"],
    topicFocus: "insurance_campaign"
  }),
  T({
    id: "campaign-experience-survey",
    typeId: "campaign",
    name: "Care experience survey desk",
    summary: "Full survey outreach with feedback capture, escalation, and opt-out.",
    description:
      "Patient experience survey that captures scores/comments, escalates complaints, and honors opt-out.",
    tags: ["survey", "nps", "full-campaign"],
    topicFocus: "survey_campaign"
  }),
  T({
    id: "campaign-reengage-inactive",
    typeId: "campaign",
    name: "Inactive patient re-engagement desk",
    summary: "Full re-engagement: book, update info, call-later, opt-out.",
    description:
      "Re-engages inactive patients with respectful outreach, booking, chart updates, and easy decline paths.",
    tags: ["reengage", "full-campaign"],
    topicFocus: "reengage_campaign"
  }),
  T({
    id: "campaign-procedural-consent",
    typeId: "campaign",
    name: "Procedural consent outreach desk",
    summary: "Full consent outreach: answer logistics, schedule, escalate clinical questions.",
    description:
      "Procedural consent campaign that handles logistics questions, schedules consents/visits, and transfers clinical consent questions to staff.",
    tags: ["consent", "procedure", "full-campaign"],
    topicFocus: "consent_campaign"
  }),
  T({
    id: "campaign-seasonal-wellness",
    typeId: "campaign",
    name: "Seasonal & birthday wellness outreach desk",
    summary: "Full seasonal/birthday wellness outreach with booking and preferences.",
    description:
      "Seasonal or birthday wellness outreach with preventive scheduling, preference capture, and opt-out.",
    tags: ["seasonal", "birthday", "full-campaign"],
    topicFocus: "seasonal_campaign"
  }),

  // —— After-hours (9) ——
  T({
    id: "afterhours-full-answering",
    typeId: "afterhours",
    name: "Full after-hours answering desk",
    summary: "Complete after-hours desk: emergency, urgent, message, wait-until-open, meds.",
    description:
      "Night/weekend answering service covering emergencies, urgent same-night guidance, morning messages, can-wait cases, and medication questions within policy.",
    tags: ["afterhours", "full-afterhours"],
    topicFocus: "full_afterhours"
  }),
  T({
    id: "afterhours-emergency-vs-clinic",
    typeId: "afterhours",
    name: "ER vs clinic after-hours guidance desk",
    summary: "Full after-hours safety desk specializing in ER vs clinic decisions.",
    description:
      "Helps callers choose ER vs clinic vs morning callback with full after-hours messaging and on-call routing options.",
    tags: ["er-vs-clinic", "full-afterhours"],
    topicFocus: "er_vs_clinic"
  }),
  T({
    id: "afterhours-oncall-connection",
    typeId: "afterhours",
    name: "On-call clinician connection desk",
    summary: "Full on-call connection path with emergency screens and message fallback.",
    description:
      "Connects appropriate urgent clinical concerns to on-call pathways per clinic policy, with 911 first and message fallback.",
    tags: ["on-call", "full-afterhours"],
    topicFocus: "oncall_afterhours"
  }),
  T({
    id: "afterhours-medication-questions",
    typeId: "afterhours",
    name: "After-hours medication questions desk",
    summary: "Full after-hours med desk: safety, message, no unauthorized refills.",
    description:
      "After-hours medication questions with emergency screens, clinician message capture, and strict no-approve refill policy.",
    tags: ["medication", "full-afterhours"],
    topicFocus: "meds_afterhours"
  }),
  T({
    id: "afterhours-refill-message",
    typeId: "afterhours",
    name: "After-hours refill message desk",
    summary: "Full after-hours refill messaging with urgency triage and morning queue.",
    description:
      "Captures after-hours refill requests, screens urgency, and queues for daytime clinical review without approving controlled substances.",
    tags: ["refill", "full-afterhours"],
    topicFocus: "refill_afterhours"
  }),
  T({
    id: "afterhours-weekend-urgent-care",
    typeId: "afterhours",
    name: "Weekend urgent-care navigation desk",
    summary: "Full weekend UC navigation plus after-hours message/emergency toolkit.",
    description:
      "Guides weekend urgent-care options from clinic knowledge while retaining emergency redirect and morning message capture.",
    tags: ["weekend", "urgent-care", "full-afterhours"],
    topicFocus: "weekend_uc"
  }),
  T({
    id: "afterhours-holiday-coverage",
    typeId: "afterhours",
    name: "Holiday coverage answering desk",
    summary: "Full holiday coverage path with closures, UC, emergency, and messages.",
    description:
      "Holiday answering covering closure calendars, urgent options, emergencies, and next-open callbacks.",
    tags: ["holiday", "full-afterhours"],
    topicFocus: "holiday_afterhours"
  }),
  T({
    id: "afterhours-portal-access",
    typeId: "afterhours",
    name: "After-hours portal & access help desk",
    summary: "Full portal/access help after hours with clinical safety net.",
    description:
      "Helps with portal login basics after hours and still routes clinical urgency correctly when the caller actually needs care.",
    tags: ["portal", "access", "full-afterhours"],
    topicFocus: "portal_afterhours"
  }),
  T({
    id: "afterhours-pharmacy-hours",
    typeId: "afterhours",
    name: "After-hours pharmacy hours & Rx guidance desk",
    summary: "Full pharmacy-hours guidance after hours with refill message fallback.",
    description:
      "Shares pharmacy hour guidance from knowledge and can take refill messages for morning review when appropriate.",
    tags: ["pharmacy-hours", "full-afterhours"],
    topicFocus: "rx_hours_afterhours"
  }),

  // —— Concierge (9) ——
  T({
    id: "concierge-full-service",
    typeId: "concierge",
    name: "Full-service patient concierge desk",
    summary: "Full concierge: schedule, intake lite, billing route, clinical route, locations.",
    description:
      "High-touch patient concierge that detects intent across scheduling, intake, billing, clinical routing, and multi-location navigation, then executes the right full toolkit.",
    tags: ["concierge", "full-service"],
    topicFocus: "full_concierge"
  }),
  T({
    id: "concierge-vip-executive",
    typeId: "concierge",
    name: "VIP & executive health concierge",
    summary: "Full VIP concierge with scheduling, intake, and care-team coordination.",
    description:
      "Executive/VIP patient concierge covering preferential scheduling, intake coordination, and care-team connectivity with full clinic tool access.",
    tags: ["vip", "executive", "concierge"],
    topicFocus: "vip_concierge"
  }),
  T({
    id: "concierge-multi-location",
    typeId: "concierge",
    name: "Multi-clinic care navigation concierge",
    summary: "Full multi-site navigation with scheduling and care-team routing.",
    description:
      "Navigates multi-clinic systems: location choice, provider match, scheduling, and transfers.",
    tags: ["multi-location", "concierge"],
    topicFocus: "multisite_concierge"
  }),
  T({
    id: "concierge-bilingual-family",
    typeId: "concierge",
    name: "Bilingual family practice concierge",
    summary: "Full bilingual family-practice navigation across visit and intake needs.",
    description:
      "Family practice concierge emphasizing clear bilingual-capable workflows for scheduling, intake, and caregiver questions.",
    tags: ["bilingual", "family", "concierge"],
    topicFocus: "bilingual_concierge"
  }),
  T({
    id: "concierge-specialty-orchestrator",
    typeId: "concierge",
    name: "Specialty clinic orchestrator",
    summary: "Full specialty orchestration: referrals, scheduling, intake, financial route.",
    description:
      "Orchestrates specialty clinic journeys including referral context, scheduling, intake, and financial counseling handoffs.",
    tags: ["specialty", "orchestrator", "concierge"],
    topicFocus: "specialty_concierge"
  }),
  T({
    id: "concierge-surgical-coordinator",
    typeId: "concierge",
    name: "Surgical journey coordinator",
    summary: "Full surgical coordination: schedule, prep, clearance, billing route, follow-up.",
    description:
      "Surgical coordinator covering pre-op scheduling, clearance/intake, prep logistics, financial routing, and post-op follow-up booking.",
    tags: ["surgery", "coordinator", "concierge"],
    topicFocus: "surgical_concierge"
  }),
  T({
    id: "concierge-oncology-navigator",
    typeId: "concierge",
    name: "Oncology support navigator",
    summary: "Full oncology navigation with scheduling, supportive routing, and escalation.",
    description:
      "Oncology support navigation for visits, supportive resources routing, symptom escalation to clinical staff, and caregiver coordination — non-diagnostic.",
    tags: ["oncology", "navigator", "concierge"],
    topicFocus: "oncology_concierge"
  }),
  T({
    id: "concierge-chronic-hub",
    typeId: "concierge",
    name: "Chronic care hub concierge",
    summary: "Full chronic-care hub: check-in, schedule, refill route, care team.",
    description:
      "Chronic care hub combining check-ins, scheduling, refill routing, and care-team connectivity for multi-visit patients.",
    tags: ["chronic", "hub", "concierge"],
    topicFocus: "chronic_concierge"
  }),
  T({
    id: "concierge-new-patient-whiteglove",
    typeId: "concierge",
    name: "New patient white-glove onboarding",
    summary: "Full new-patient onboarding: welcome, intake, schedule, insurance, portal.",
    description:
      "White-glove new patient onboarding spanning welcome, complete intake, first visit scheduling, insurance capture, and portal setup help.",
    tags: ["new-patient", "onboarding", "concierge"],
    topicFocus: "onboarding_concierge"
  })
];

/** 36 extra topics (pharmacy, lab, chronic_care, pediatrics × 9) */
const EXTRA_TOPICS = [
  // Pharmacy (9)
  T({
    id: "pharmacy-full-rx-coordination",
    typeId: "pharmacy",
    name: "Full prescription coordination desk",
    summary: "Complete Rx desk: refill, PA, pickup/transfer, side effects, controlled, mail-order.",
    description:
      "End-to-end clinic pharmacy coordination for patients: refill routing, prior auth, pickup/transfer logistics, side-effect escalation, controlled-substance policy, mail-order/specialty, and med-list prep — never approves or changes doses.",
    tags: ["pharmacy", "full-pharmacy"],
    topicFocus: "full_pharmacy"
  }),
  T({
    id: "pharmacy-controlled-substance-desk",
    typeId: "pharmacy",
    name: "Controlled substance policy desk",
    summary: "Full pharmacy toolkit with controlled-substance policy emphasis.",
    description:
      "Explains controlled-substance refill policy and still supports the full pharmacy action set with strict clinician approval gates.",
    tags: ["controlled", "full-pharmacy"],
    topicFocus: "controlled_pharmacy"
  }),
  T({
    id: "pharmacy-specialty-mailorder",
    typeId: "pharmacy",
    name: "Specialty & mail-order pharmacy desk",
    summary: "Full specialty/mail-order coordination plus standard Rx actions.",
    description:
      "Specialty and mail-order pharmacy logistics with access to refill, PA, and safety escalation paths.",
    tags: ["mail-order", "specialty", "full-pharmacy"],
    topicFocus: "mailorder_pharmacy"
  }),
  T({
    id: "pharmacy-prior-auth-desk",
    typeId: "pharmacy",
    name: "Medication prior authorization desk",
    summary: "Full Rx PA desk with refill and safety paths available.",
    description:
      "Medication prior authorization status and starts, with adjacent refill and side-effect routing when needed.",
    tags: ["prior-auth", "full-pharmacy"],
    topicFocus: "pa_pharmacy"
  }),
  T({
    id: "pharmacy-safety-escalation",
    typeId: "pharmacy",
    name: "Medication safety & side-effect desk",
    summary: "Full safety-first pharmacy desk for reactions and urgent med issues.",
    description:
      "Side-effect and medication safety escalation with anaphylaxis screens and clinician transfer, plus standard Rx logistics when appropriate.",
    tags: ["side-effect", "safety", "full-pharmacy"],
    topicFocus: "safety_pharmacy"
  }),
  T({
    id: "pharmacy-new-rx-counseling",
    typeId: "pharmacy",
    name: "New prescription counseling boundary desk",
    summary: "Full new-Rx patient questions with counseling boundaries and escalation.",
    description:
      "Answers logistics for new prescriptions, sets counseling boundaries, and escalates clinical questions while supporting refill/PA/pickup paths.",
    tags: ["new-rx", "full-pharmacy"],
    topicFocus: "newrx_pharmacy"
  }),
  T({
    id: "pharmacy-med-reconciliation",
    typeId: "pharmacy",
    name: "Medication reconciliation prep desk",
    summary: "Full med-list prep for visits with capture and related Rx actions.",
    description:
      "Prepares medication lists for upcoming visits and can route refill or safety concerns discovered during reconciliation.",
    tags: ["reconciliation", "full-pharmacy"],
    topicFocus: "reconciliation_pharmacy"
  }),
  T({
    id: "pharmacy-logistics-transfer",
    typeId: "pharmacy",
    name: "Pharmacy logistics & transfer desk",
    summary: "Full pickup/transfer logistics with refill and PA support.",
    description:
      "Pharmacy pickup timing, transfers, and location logistics with full adjacent Rx coordination features.",
    tags: ["pickup", "transfer", "full-pharmacy"],
    topicFocus: "logistics_pharmacy"
  }),
  T({
    id: "pharmacy-otc-nurse-route",
    typeId: "pharmacy",
    name: "OTC boundary & nurse route desk",
    summary: "Full OTC-boundary desk that routes clinical questions and supports Rx logistics.",
    description:
      "Handles OTC questions within non-prescribing boundaries, routes clinical advice to nurses, and can still help with prescription logistics.",
    tags: ["otc", "full-pharmacy"],
    topicFocus: "otc_pharmacy"
  }),

  // Lab (9)
  T({
    id: "lab-full-diagnostics-desk",
    typeId: "lab",
    name: "Full lab & diagnostics patient desk",
    summary: "Complete labs desk: prep, order status, results logistics, imaging, booking.",
    description:
      "Full diagnostics patient desk covering prep, order status, results-ready logistics (no interpretation), imaging prep, pediatric draws, home kits, and review-visit booking.",
    tags: ["lab", "full-lab"],
    topicFocus: "full_lab"
  }),
  T({
    id: "lab-prep-coaching",
    typeId: "lab",
    name: "Lab & imaging prep coaching desk",
    summary: "Full prep coaching with access to status/results logistics when needed.",
    description:
      "Fasting and imaging prep coaching that can also handle related order status and booking questions in the same conversation.",
    tags: ["prep", "full-lab"],
    topicFocus: "prep_lab"
  }),
  T({
    id: "lab-results-logistics",
    typeId: "lab",
    name: "Results logistics desk (no interpretation)",
    summary: "Full results logistics: ready/pending, portal, callback, review booking.",
    description:
      "Results logistics without interpretation — portal links, pending guidance, abnormal callback routing, and clinician review visits.",
    tags: ["results", "full-lab"],
    topicFocus: "results_lab"
  }),
  T({
    id: "lab-imaging-coordination",
    typeId: "lab",
    name: "Imaging coordination desk",
    summary: "Full imaging coordination: prep, status, auth pointers, scheduling.",
    description:
      "Imaging study coordination including prep, timing, related auth pointers, and scheduling of associated visits.",
    tags: ["imaging", "full-lab"],
    topicFocus: "imaging_lab"
  }),
  T({
    id: "lab-pediatric-draw",
    typeId: "lab",
    name: "Pediatric lab visit support desk",
    summary: "Full pediatric lab support for caregivers with prep and logistics.",
    description:
      "Caregiver support for pediatric lab visits including prep, anxiety tips from protocol, and scheduling logistics.",
    tags: ["pediatrics", "full-lab"],
    topicFocus: "pediatric_lab"
  }),
  T({
    id: "lab-home-collection",
    typeId: "lab",
    name: "Home lab collection kit desk",
    summary: "Full home-kit instruction desk with order/results logistics fallback.",
    description:
      "Home collection kit instructions and troubleshooting with escalation and related diagnostics support.",
    tags: ["home-kit", "full-lab"],
    topicFocus: "homekit_lab"
  }),
  T({
    id: "lab-abnormal-callback",
    typeId: "lab",
    name: "Abnormal results callback routing desk",
    summary: "Full abnormal-callback routing with safety and review booking.",
    description:
      "Routes abnormal result callbacks to clinicians, avoids interpretation, and can book review visits.",
    tags: ["abnormal", "callback", "full-lab"],
    topicFocus: "abnormal_lab"
  }),
  T({
    id: "lab-insurance-locations",
    typeId: "lab",
    name: "Lab insurance & preferred locations desk",
    summary: "Full lab location/insurance options with prep and status support.",
    description:
      "Helps patients with preferred lab locations and insurance-related logistics while supporting prep and status questions.",
    tags: ["insurance", "locations", "full-lab"],
    topicFocus: "locations_lab"
  }),
  T({
    id: "lab-draw-anxiety-support",
    typeId: "lab",
    name: "Blood-draw anxiety support desk",
    summary: "Full anxiety support plus scheduling/prep for lab visits.",
    description:
      "Supports patients anxious about blood draws with protocol tips, prep, and visit logistics.",
    tags: ["anxiety", "full-lab"],
    topicFocus: "anxiety_lab"
  }),

  // Chronic care (9)
  T({
    id: "chronic-diabetes-management",
    typeId: "chronic_care",
    name: "Diabetes care management desk",
    summary: "Full diabetes care desk: check-in, readings, adherence, refill route, booking.",
    description:
      "Diabetes care management covering readings, symptoms, adherence, refill routing, care gaps, and follow-up booking — no dose changes.",
    tags: ["diabetes", "full-chronic"],
    topicFocus: "diabetes_chronic"
  }),
  T({
    id: "chronic-hypertension-management",
    typeId: "chronic_care",
    name: "Hypertension care management desk",
    summary: "Full hypertension desk with home BP, adherence, escalation, and booking.",
    description:
      "Hypertension management check-ins with home BP review, adherence, red flags, and visit scheduling.",
    tags: ["hypertension", "full-chronic"],
    topicFocus: "htn_chronic"
  }),
  T({
    id: "chronic-asthma-copd-management",
    typeId: "chronic_care",
    name: "Asthma / COPD care management desk",
    summary: "Full breathing care desk with flare screens and complete chronic toolkit.",
    description:
      "Asthma/COPD care management with flare/emergency screens, inhaler adherence, and follow-up scheduling.",
    tags: ["asthma", "copd", "full-chronic"],
    topicFocus: "resp_chronic"
  }),
  T({
    id: "chronic-heart-failure-management",
    typeId: "chronic_care",
    name: "Heart failure care management desk",
    summary: "Full HF desk: weight watch, red flags, adherence, booking.",
    description:
      "Heart failure daily weight and symptom watch with urgent escalation paths and care-team scheduling.",
    tags: ["heart-failure", "full-chronic"],
    topicFocus: "hf_chronic"
  }),
  T({
    id: "chronic-multimorbid-navigation",
    typeId: "chronic_care",
    name: "Multi-condition care navigation desk",
    summary: "Full multi-morbid navigation across conditions, visits, and meds.",
    description:
      "Helps patients managing multiple chronic conditions coordinate check-ins, visits, and medication questions safely.",
    tags: ["multi-morbid", "full-chronic"],
    topicFocus: "multi_chronic"
  }),
  T({
    id: "chronic-med-adherence-coach",
    typeId: "chronic_care",
    name: "Chronic medication adherence coach",
    summary: "Full adherence coaching with refill routing and visit options.",
    description:
      "Chronic medication adherence coaching with barrier problem-solving, refill routing, and clinician escalation.",
    tags: ["adherence", "full-chronic"],
    topicFocus: "adherence_chronic"
  }),
  T({
    id: "chronic-care-gap-closing",
    typeId: "chronic_care",
    name: "Chronic care-gap closing desk",
    summary: "Full care-gap closing: due services, booking, outreach preferences.",
    description:
      "Closes chronic care gaps (labs, visits, vaccines due) with scheduling and preference capture.",
    tags: ["care-gap", "full-chronic"],
    topicFocus: "gap_chronic"
  }),
  T({
    id: "chronic-rpm-device-support",
    typeId: "chronic_care",
    name: "Remote monitoring device support desk",
    summary: "Full RPM device support plus clinical check-in and booking paths.",
    description:
      "Supports home monitoring devices, reading submission logistics, and escalates clinical concerns.",
    tags: ["rpm", "device", "full-chronic"],
    topicFocus: "rpm_chronic"
  }),
  T({
    id: "chronic-lifestyle-careplan",
    typeId: "chronic_care",
    name: "Lifestyle care-plan reinforcement desk",
    summary: "Full lifestyle reinforcement with clinical safety net and visit booking.",
    description:
      "Reinforces clinician care-plan lifestyle guidance, checks barriers, and books follow-ups when needed.",
    tags: ["lifestyle", "care-plan", "full-chronic"],
    topicFocus: "lifestyle_chronic"
  }),

  // Pediatrics (9)
  T({
    id: "pediatrics-full-care-desk",
    typeId: "pediatrics",
    name: "Full pediatric care desk",
    summary: "Complete pediatric desk: well, sick, vaccines, forms, newborn, teen privacy.",
    description:
      "Full pediatric outpatient desk for caregivers covering well-child, sick visits, vaccines, forms, newborn follow-up, behavioral routing, and teen confidentiality FAQ — with scheduling and triage-safe escalation.",
    tags: ["pediatrics", "full-peds"],
    topicFocus: "full_pediatrics"
  }),
  T({
    id: "pediatrics-sick-fever-desk",
    typeId: "pediatrics",
    name: "Pediatric sick & fever desk",
    summary: "Full sick/fever pediatric desk with age gates, booking, and nurse route.",
    description:
      "Pediatric sick and fever caregiver desk with infant rules, disposition, sick-visit booking, and nurse escalation.",
    tags: ["sick", "fever", "full-peds"],
    topicFocus: "sick_pediatrics"
  }),
  T({
    id: "pediatrics-well-vaccine-desk",
    typeId: "pediatrics",
    name: "Well-child & vaccine desk",
    summary: "Full well-child and vaccine scheduling with caregiver education boundaries.",
    description:
      "Well-child and vaccine scheduling plus protocol FAQs and reminder setup for caregivers.",
    tags: ["well-child", "vaccine", "full-peds"],
    topicFocus: "well_pediatrics"
  }),
  T({
    id: "pediatrics-forms-clearance",
    typeId: "pediatrics",
    name: "School & sports forms desk",
    summary: "Full forms/clearance desk with exam scheduling when required.",
    description:
      "School, sports, and camp forms logistics with scheduling of required exams and caregiver instructions.",
    tags: ["forms", "sports", "full-peds"],
    topicFocus: "forms_pediatrics"
  }),
  T({
    id: "pediatrics-newborn-desk",
    typeId: "pediatrics",
    name: "Newborn follow-up desk",
    summary: "Full newborn follow-up scheduling and caregiver urgent routing.",
    description:
      "Newborn follow-up scheduling with urgent caregiver concern routing and feeding/weight visit logistics within protocol.",
    tags: ["newborn", "full-peds"],
    topicFocus: "newborn_pediatrics"
  }),
  T({
    id: "pediatrics-behavioral-routing",
    typeId: "pediatrics",
    name: "Pediatric behavioral concern routing desk",
    summary: "Full behavioral concern routing with safety screens and visit options.",
    description:
      "Routes pediatric behavioral and developmental concerns to the right clinical path with safety screens.",
    tags: ["behavioral", "full-peds"],
    topicFocus: "behavioral_pediatrics"
  }),
  T({
    id: "pediatrics-adolescent-privacy",
    typeId: "pediatrics",
    name: "Adolescent confidentiality & visit desk",
    summary: "Full teen visit desk with privacy FAQ, scheduling, and sensitive routing.",
    description:
      "Adolescent visit support covering confidentiality FAQ, scheduling, and warm transfer for sensitive topics.",
    tags: ["teen", "confidential", "full-peds"],
    topicFocus: "teen_pediatrics"
  }),
  T({
    id: "pediatrics-caregiver-portal",
    typeId: "pediatrics",
    name: "Caregiver portal & proxy desk",
    summary: "Full caregiver portal/proxy help with scheduling and clinical routing.",
    description:
      "Helps caregivers with portal proxy access and continues into scheduling or clinical routing when needed.",
    tags: ["portal", "proxy", "full-peds"],
    topicFocus: "portal_pediatrics"
  }),
  T({
    id: "pediatrics-caregiver-navigation",
    typeId: "pediatrics",
    name: "Pediatric caregiver navigation desk",
    summary: "Full caregiver navigation across visits, forms, vaccines, and sick concerns.",
    description:
      "Caregiver navigation hub that detects pediatric intent across well/sick/vaccines/forms and runs the full pediatric toolkit.",
    tags: ["caregiver", "navigation", "full-peds"],
    topicFocus: "nav_pediatrics"
  })
];

const ALL_TOPIC_DEFS = [...CORE_TOPICS, ...EXTRA_TOPICS];

function buildGraphSpec(topic) {
  const greeting =
    `Thank you for calling {{clinic_name}}. This is {{agent_name}} — ${topic.summary} How can I help you today?`;
  const closing =
    `Thank you for calling {{clinic_name}}. Take care, and call us back anytime you need help.`;
  return {
    greeting,
    closing,
    steps: [
      {
        type: "question",
        label: "Intent",
        prompt: "What do you need help with today?",
        options: ["Primary need", "Something else", "Speak to staff"]
      }
    ]
  };
}

function toTemplateRecord(topic) {
  return {
    id: topic.id,
    typeId: topic.typeId,
    name: topic.name,
    summary: topic.summary,
    description: topic.description,
    defaultTools: [...(topic.defaultTools || [])],
    suggestedVoice: topic.suggestedVoice || "marin",
    tags: [...(topic.tags || [])],
    topicFocus: topic.topicFocus,
    graphSpec: buildGraphSpec(topic)
  };
}

const AGENT_TEMPLATE_RECORDS = ALL_TOPIC_DEFS.map(toTemplateRecord);

if (AGENT_TEMPLATE_RECORDS.length !== 126) {
  // eslint-disable-next-line no-console
  console.warn(
    `[agentTemplateCatalog] expected 126 topics, got ${AGENT_TEMPLATE_RECORDS.length}`
  );
}

module.exports = {
  ALL_TOPIC_DEFS,
  AGENT_TEMPLATE_RECORDS,
  CORE_TOPICS,
  EXTRA_TOPICS,
  toTemplateRecord
};
