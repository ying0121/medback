const { getFlowSubagentTool } = require("../constants/flowSubagentTools");

/**
 * Execute a conversation-flow subagent tool.
 * These are real backend side-effects (appointments, SMS, email, etc.).
 * Implementations are stubs ready to wire to Twilio / calendar / EHR.
 *
 * @param {object} params
 * @param {string} params.toolId
 * @param {object} [params.config]
 * @param {object} [params.context] - clinicId, patient, campaignContact, callId, …
 * @returns {Promise<{ ok: boolean, toolId: string, result?: object, error?: string }>}
 */
async function executeFlowSubagent({ toolId, config = {}, context = {} }) {
  const tool = getFlowSubagentTool(toolId);
  if (!tool) {
    return { ok: false, toolId: String(toolId || ""), error: "Unknown subagent tool." };
  }

  const handler = HANDLERS[tool.id];
  if (!handler) {
    return { ok: false, toolId: tool.id, error: `No handler registered for ${tool.id}.` };
  }

  try {
    const result = await handler({ config, context, tool });
    return { ok: true, toolId: tool.id, result };
  } catch (err) {
    return {
      ok: false,
      toolId: tool.id,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

async function bookAppointment({ config, context }) {
  // TODO: wire to appointmentService / Google Calendar / ECW
  return {
    action: "book_appointment",
    status: "queued",
    clinicId: context.clinicId || null,
    patientPhone: context.patientPhone || null,
    preferredSlot: config.preferredSlot || null,
    note: "Stub: appointment booking will be executed by the campaign/call runtime."
  };
}

async function cancelAppointment({ config, context }) {
  return {
    action: "cancel_appointment",
    status: "queued",
    appointmentId: config.appointmentId || context.appointmentId || null,
    note: "Stub: cancel appointment via appointments API."
  };
}

async function rescheduleAppointment({ config, context }) {
  return {
    action: "reschedule_appointment",
    status: "queued",
    appointmentId: config.appointmentId || context.appointmentId || null,
    newSlot: config.newSlot || null,
    note: "Stub: reschedule appointment via calendar/EHR."
  };
}

async function sendAppointmentReminder({ config, context }) {
  return {
    action: "send_appointment_reminder",
    status: "queued",
    channel: config.channel || "sms",
    patientPhone: context.patientPhone || null,
    note: "Stub: send reminder via Twilio SMS / voice."
  };
}

async function sendVoicemail({ config, context }) {
  // TODO: Twilio voice drop / AMD voicemail
  return {
    action: "send_voicemail",
    status: "queued",
    patientPhone: context.patientPhone || null,
    script: config.script || null,
    note: "Stub: Twilio outbound voicemail drop."
  };
}

async function sendSms({ config, context }) {
  // TODO: twilioService.sendSms
  return {
    action: "send_sms",
    status: "queued",
    patientPhone: context.patientPhone || null,
    body: config.body || null,
    note: "Stub: Twilio SMS send."
  };
}

async function sendEmail({ config, context }) {
  // TODO: nodemailer / clinic mailer
  return {
    action: "send_email",
    status: "queued",
    patientEmail: context.patientEmail || null,
    subject: config.subject || null,
    body: config.body || null,
    note: "Stub: outbound email send."
  };
}

async function transferToHuman({ config, context }) {
  // TODO: Twilio Dial / enqueue
  return {
    action: "transfer_to_human",
    status: "queued",
    toPhone: config.toPhone || context.clinicPhone || null,
    note: "Stub: transfer active call to human agent."
  };
}

async function collectPayment({ config, context }) {
  return {
    action: "collect_payment",
    status: "queued",
    amount: config.amount || null,
    patientPhone: context.patientPhone || null,
    note: "Stub: payment collection / billing reminder flow."
  };
}

async function updatePatientInfo({ config, context }) {
  return {
    action: "update_patient_info",
    status: "queued",
    fields: config.fields || {},
    patientPhone: context.patientPhone || null,
    note: "Stub: persist patient demographic updates."
  };
}

const HANDLERS = {
  book_appointment: bookAppointment,
  cancel_appointment: cancelAppointment,
  reschedule_appointment: rescheduleAppointment,
  send_appointment_reminder: sendAppointmentReminder,
  send_voicemail: sendVoicemail,
  send_sms: sendSms,
  send_email: sendEmail,
  transfer_to_human: transferToHuman,
  collect_payment: collectPayment,
  update_patient_info: updatePatientInfo
};

module.exports = {
  executeFlowSubagent,
  HANDLERS
};
