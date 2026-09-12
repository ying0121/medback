// Central API layer. Swap implementations to call your REST backend.
// All functions return promises so the swap is drop-in.
export type Role = "Admin" | "Clinic Staff";

import {
  CLINIC_THEME_COLORS,
  DEFAULT_CLINIC_THEME_COLOR,
  THEME_COLOR_OPTIONS,
  type ClinicThemeColor
} from "./themeColors";

export type { ClinicThemeColor };
export { CLINIC_THEME_COLORS, DEFAULT_CLINIC_THEME_COLOR, THEME_COLOR_OPTIONS };

export type ClinicMeetingProvider = "google" | "ecw" | "azul";

export interface Clinic {
  id: string;
  clinicId: string;
  logo?: string;
  /** Data URL image, max 250×250 (also exposed to chat on connect). */
  avatar?: string | null;
  name: string;
  acronym: string;
  address1: string;
  address2?: string;
  state: string;
  city: string;
  zip: string;
  tel: string;
  fax?: string;
  web?: string;
  portal?: string;
  /** Linked agent (bot profile) for this clinic. */
  agentId?: string | null;
  agentTitle?: string | null;
  agentStatus?: "active" | "inactive" | null;
  twilioConfigured?: boolean;
  /** Google Calendar / ECW / Azul configured for this clinic. */
  googleConfigured?: boolean;
  meetingProvider?: ClinicMeetingProvider;
  /** OpenAI Realtime / TTS voice configured for this clinic. */
  botVoiceConfigured?: boolean;
  /** Saved OpenAI voice id (e.g. marin, alloy). */
  openaiVoice?: string | null;
  /** Per-clinic inbound phone greeting (may use placeholders). */
  greetingConfigured?: boolean;
  /** Per-clinic web chat greeting (WebSocket connect). */
  chatGreetingConfigured?: boolean;
  /** Chat frontend theme token (WebSocket connect). */
  themeColor?: ClinicThemeColor;
}

export interface GreetingPlaceholder {
  token: string;
  label: string;
  description: string;
}

export interface ClinicGreetingPanel {
  greeting: string;
  defaultGreeting: string;
  resolvedPreview: string;
  usesCustomGreeting: boolean;
}

export interface ClinicGreetingsConfig {
  placeholders: GreetingPlaceholder[];
  inbound: ClinicGreetingPanel;
  chat: ClinicGreetingPanel;
  defaultInboundGreeting: string;
  defaultChatGreeting: string;
}

/** @deprecated Use ClinicGreetingsConfig */
export type ClinicGreetingConfig = ClinicGreetingsConfig;

export interface BotVoice {
  id: string;
  name: string;
  description: string;
}

export interface User {
  id: string;
  photo?: string;
  firstName: string;
  lastName: string;
  dob: string;
  status: "active" | "inactive";
  address: string;
  state: string;
  city: string;
  zip: string;
  phone: string;
  email: string;
  role: Role;
  clinicIds: string[];
}

export type DoctorGender = "Male" | "Female" | "Other";

export interface Doctor {
  id: string;
  firstName: string;
  lastName: string;
  gender: DoctorGender;
  phone: string;
  email: string;
  language: string;
  address1: string;
  address2: string;
  photo?: string;
  status: "active" | "inactive";
  createdAt?: string | null;
  updatedAt?: string | null;
}

export type DoctorInput = Omit<Doctor, "id" | "createdAt" | "updatedAt">;

export type MessageType = "text" | "voice";

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  type: MessageType;
  status?: "success" | "error";
  content: string;
  audioUrl?: string;
  audioMimeType?: string;
  durationSec?: number;
  language?: string;
  translatedText?: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  clinicId: string;
  title: string;
  userName?: string;
  userEmail?: string;
  messageCount: number;
  lastMessageAt: string;
  lastMessagePreview?: string;
  lastMessageType?: MessageType;
  lastMessageRole?: "user" | "assistant";
}

export interface IncomingCall {
  id: string;
  callSid: string;
  phone: string;
  seconds: number;
  status?: string | null;
  createdAt?: string | null;
}

export interface IncomingCallMessage {
  id: string;
  callId: string;
  audio?: string | null;
  audioMimeType?: string | null;
  transcription: string;
  userType: "bot" | "user";
  status?: string | null;
  createdAt?: string | null;
}

let clinics: Clinic[] = [];
let users: User[] = [];
const conversations: Conversation[] = [];
const messages: Message[] = [];

const delay = <T,>(v: T, ms = 200) => new Promise<T>((r) => setTimeout(() => r(v), ms));
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const SESSION_KEY = "medbot.session";

/** Actor headers for HIPAA audit attribution (from browser session). */
export function getAdminActorHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return {};
    const s = JSON.parse(raw) as {
      user?: { id?: string; email?: string; name?: string; role?: string };
      expiresAt?: number;
    };
    if (!s?.user || (s.expiresAt != null && s.expiresAt <= Date.now())) return {};
    const headers: Record<string, string> = {};
    if (s.user.id) headers["X-Admin-User-Id"] = String(s.user.id);
    if (s.user.email) headers["X-Admin-User-Email"] = String(s.user.email);
    if (s.user.name) headers["X-Admin-User-Name"] = String(s.user.name);
    if (s.user.role) headers["X-Admin-User-Role"] = String(s.user.role);
    return headers;
  } catch {
    return {};
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...getAdminActorHeaders(),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || "Request failed");
  return data as T;
}

// ---------- Auth ----------
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  photo?: string;
  role: Role;
  clinicIds: string[];
}

export async function login(email: string, password: string): Promise<AuthUser> {
  if (!email || !password) throw new Error("Email and password are required");
  const data = await request<{ user: AuthUser }>("/api/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  return data.user;
}

// ---------- Clinics ----------
export async function listClinics() {
  try {
    const data = await request<{ clinics: Clinic[] }>("/api/admin/dashboard/clinics");
    return data.clinics;
  } catch {
    return delay(clinics);
  }
}
export async function syncClinicsFromExternalApi() {
  const data = await request<{
    success: boolean;
    sourceCount: number;
    created: number;
    updated: number;
    skipped: number;
  }>("/api/admin/dashboard/clinics/sync-external", {
    method: "POST",
    body: JSON.stringify({})
  });
  return data;
}

export async function getClinicBotVoice(clinicId: string): Promise<{ voice: string }> {
  return request<{ voice: string }>(`/api/admin/dashboard/clinics/${clinicId}/bot-voice`);
}

export async function updateClinicBotVoice(clinicId: string, voice: string) {
  await request<{ success: boolean; voice: string }>(`/api/admin/dashboard/clinics/${clinicId}/bot-voice`, {
    method: "PATCH",
    body: JSON.stringify({ voice })
  });
}

export interface ClinicTwilioConfigInput {
  twilioPhoneNumber: string;
  twilioCallerId: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioApiKeySid: string;
  twilioApiKeySecret: string;
  twilioTwimlAppSid: string;
}

export async function updateClinicTwilioConfig(clinicId: string, payload: ClinicTwilioConfigInput) {
  await request<{ success: boolean }>(`/api/admin/dashboard/clinics/${clinicId}/twilio`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function getClinicTwilioConfig(clinicId: string): Promise<ClinicTwilioConfigInput> {
  return request<ClinicTwilioConfigInput>(`/api/admin/dashboard/clinics/${clinicId}/twilio`);
}

export interface ClinicGoogleConfigInput {
  meetingProvider: ClinicMeetingProvider;
  googleClientId: string;
  googleClientSecret: string;
  googleRefreshToken: string;
  googleCreateMeet: boolean;
  ecwApiEndpoint: string;
  azulApiEndpoint: string;
}

export async function updateClinicGoogleConfig(clinicId: string, payload: ClinicGoogleConfigInput) {
  await request<{ success: boolean }>(`/api/admin/dashboard/clinics/${clinicId}/google`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function getClinicGoogleConfig(clinicId: string): Promise<ClinicGoogleConfigInput> {
  return request<ClinicGoogleConfigInput>(`/api/admin/dashboard/clinics/${clinicId}/google`);
}

export interface AppointmentClinic {
  id: string;
  name: string;
  acronym: string;
  themeColor?: ClinicThemeColor;
}

export interface Appointment {
  id: string;
  clinicId: string;
  conversationId?: string | null;
  callId?: string | null;
  source: "chat" | "voice" | "phone" | string;
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  patientDob: string;
  patientType: "new" | "existing" | string;
  startsAt: string;
  endsAt: string;
  meetLink?: string | null;
  googleEventId?: string | null;
  status: string;
  createdAt?: string | null;
  clinic?: AppointmentClinic | null;
}

export async function listAppointments(params: {
  clinicId?: string;
  from?: string;
  to?: string;
} = {}): Promise<Appointment[]> {
  const query = new URLSearchParams();
  if (params.clinicId && params.clinicId !== "all") query.set("clinicId", params.clinicId);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const data = await request<{ appointments: Appointment[] }>(
    `/api/admin/dashboard/appointments${suffix}`
  );
  return data.appointments;
}

export async function cancelAppointment(appointmentId: string): Promise<{
  success: boolean;
  calendarCancelled: boolean;
}> {
  const data = await request<{ success: boolean; calendarCancelled?: boolean }>(
    `/api/admin/dashboard/appointments/${appointmentId}/cancel`,
    { method: "POST" }
  );
  return {
    success: Boolean(data.success),
    calendarCancelled: Boolean(data.calendarCancelled)
  };
}

export async function getClinicGreetings(clinicId: string): Promise<ClinicGreetingsConfig> {
  return request<ClinicGreetingsConfig>(`/api/admin/dashboard/clinics/${clinicId}/greeting`);
}

export async function updateClinicGreetings(
  clinicId: string,
  payload: { inboundGreeting: string; chatGreeting: string }
) {
  return request<{
    success: boolean;
    inbound: ClinicGreetingPanel;
    chat: ClinicGreetingPanel;
  }>(`/api/admin/dashboard/clinics/${clinicId}/greeting`, {
    method: "PATCH",
    body: JSON.stringify({
      inboundGreeting: payload.inboundGreeting,
      chatGreeting: payload.chatGreeting
    })
  });
}

export async function previewClinicGreeting(
  clinicId: string,
  type: "inbound" | "chat",
  greeting: string
) {
  const data = await request<{ resolvedPreview: string }>(
    `/api/admin/dashboard/clinics/${clinicId}/greeting/preview`,
    {
      method: "POST",
      body: JSON.stringify({ type, greeting })
    }
  );
  return data.resolvedPreview;
}

export async function listClinicBotVoices(clinicId: string): Promise<{ voices: BotVoice[] }> {
  return request<{ voices: BotVoice[] }>(`/api/admin/dashboard/clinics/${clinicId}/bot-voice/voices`);
}

/** Server-generated preview audio via OpenAI TTS. Caller should revoke object URLs after playback. */
export async function fetchClinicBotVoicePreviewBlob(clinicId: string, voice: string): Promise<Blob> {
  const res = await fetch(
    `${API_BASE_URL}/api/admin/dashboard/clinics/${clinicId}/bot-voice/preview?voice=${encodeURIComponent(voice)}`,
    { credentials: "include", headers: { ...getAdminActorHeaders() } }
  );
  const ct = res.headers.get("content-type") || "";
  if (!res.ok) {
    const data = ct.includes("application/json") ? await res.json().catch(() => ({})) : {};
    throw new Error((data as { error?: string }).error || "Preview failed");
  }
  return res.blob();
}
function clinicBodyFromForm(c: Omit<Clinic, "id"> | Partial<Clinic>) {
  return {
    clinicId: c.clinicId ?? "",
    name: c.name ?? "",
    acronym: c.acronym ?? "",
    address1: c.address1 ?? "",
    address2: c.address2 ?? "",
    city: c.city ?? "",
    state: c.state ?? "",
    zip: c.zip ?? "",
    tel: c.tel ?? "",
    web: c.web ?? "",
    portal: c.portal ?? "",
    themeColor: c.themeColor ?? DEFAULT_CLINIC_THEME_COLOR,
    avatar: c.avatar ?? null,
    agentId: c.agentId ?? null
  };
}

export async function createClinic(c: Omit<Clinic, "id">) {
  try {
    const data = await request<{ clinic: Clinic }>("/api/admin/dashboard/clinics", {
      method: "POST",
      body: JSON.stringify(clinicBodyFromForm(c))
    });
    return data.clinic;
  } catch {
    const id = `clinic-${Date.now()}`;
    const created: Clinic = {
      ...c,
      id,
      clinicId: c.clinicId || `CL-${1000 + clinics.length}`,
      themeColor: c.themeColor || DEFAULT_CLINIC_THEME_COLOR,
      avatar: c.avatar ?? null
    };
    clinics = [created, ...clinics];
    return delay(created);
  }
}

export async function updateClinic(id: string, patch: Partial<Clinic>) {
  try {
    const data = await request<{ clinic: Clinic }>(`/api/admin/dashboard/clinics/${id}`, {
      method: "PATCH",
      body: JSON.stringify(clinicBodyFromForm(patch))
    });
    return data.clinic;
  } catch {
    clinics = clinics.map((c) =>
      c.id === id
        ? { ...c, ...patch, id: c.id, themeColor: patch.themeColor ?? c.themeColor ?? DEFAULT_CLINIC_THEME_COLOR }
        : c
    );
    return delay(clinics.find((c) => c.id === id)!);
  }
}
export const deleteClinic = (id: string) => {
  clinics = clinics.filter((c) => c.id !== id);
  return delay(true);
};

// ---------- Users ----------
export type UserInput = Omit<User, "id"> & { password?: string };

function mapUserForApi(u: UserInput) {
  return {
    fname: u.firstName,
    lname: u.lastName,
    email: u.email,
    phone: u.phone,
    role: u.role,
    status: u.status || "active",
    dob: u.dob,
    address: u.address,
    city: u.city,
    state: u.state,
    zip: u.zip,
    photo: u.photo || null,
    clinics: u.clinicIds || [],
    clinicIds: u.clinicIds || [],
    password: u.password
  };
}

export async function listUsers() {
  try {
    const data = await request<{ users: User[] }>("/api/admin/users");
    return data.users;
  } catch {
    return delay(users);
  }
}

export async function createUser(u: UserInput) {
  const payload = mapUserForApi(u);
  if (!payload.password) throw new Error("Password is required.");
  const data = await request<{ user: User }>("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.user;
}

export async function updateUser(id: string, patch: Partial<UserInput>) {
  const cleaned: Record<string, unknown> = {};
  if (patch.firstName !== undefined) cleaned.fname = patch.firstName;
  if (patch.lastName !== undefined) cleaned.lname = patch.lastName;
  if (patch.email !== undefined) cleaned.email = patch.email;
  if (patch.phone !== undefined) cleaned.phone = patch.phone;
  if (patch.role !== undefined) cleaned.role = patch.role;
  if (patch.status !== undefined) cleaned.status = patch.status;
  if (patch.dob !== undefined) cleaned.dob = patch.dob;
  if (patch.address !== undefined) cleaned.address = patch.address;
  if (patch.city !== undefined) cleaned.city = patch.city;
  if (patch.state !== undefined) cleaned.state = patch.state;
  if (patch.zip !== undefined) cleaned.zip = patch.zip;
  if (patch.photo !== undefined) cleaned.photo = patch.photo;
  if (patch.clinicIds !== undefined) {
    cleaned.clinicIds = patch.clinicIds;
    cleaned.clinics = patch.clinicIds;
  }
  const data = await request<{ user: User }>(`/api/admin/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(cleaned),
  });
  return data.user;
}

export async function deleteUser(id: string) {
  await request<{ success: boolean }>(`/api/admin/users/${id}`, { method: "DELETE" });
  return true;
}

export async function changeUserPassword(id: string, password: string) {
  await request<{ success: boolean }>(`/api/admin/users/${id}/password`, {
    method: "PATCH",
    body: JSON.stringify({ password }),
  });
  return true;
}

// ---------- Doctors ----------
export async function listDoctors() {
  const data = await request<{ doctors: Doctor[] }>("/api/admin/doctors");
  return data.doctors;
}

export async function createDoctor(input: DoctorInput) {
  const data = await request<{ doctor: Doctor }>("/api/admin/doctors", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.doctor;
}

export async function updateDoctor(id: string, patch: Partial<DoctorInput>) {
  const data = await request<{ doctor: Doctor }>(`/api/admin/doctors/${id}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
  return data.doctor;
}

export async function deleteDoctor(id: string) {
  await request<{ success: boolean }>(`/api/admin/doctors/${id}`, { method: "DELETE" });
  return true;
}

// ---------- Agents ----------
export type AgentMeetingProvider = "google" | "ecw" | "azul";

export interface Agent {
  id: string;
  title: string;
  description: string;
  status: "active" | "inactive";
  openaiApiKey: string;
  openaiApiKeySet: boolean;
  openaiModel: string;
  openaiRealtimeModel: string;
  openaiTranscriptionModel: string;
  openaiTtsModel: string;
  openaiInboundModel: string;
  openaiVoice: string;
  twilioPhoneNumber: string;
  twilioCallerId: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioAuthTokenSet: boolean;
  twilioApiKeySid: string;
  twilioApiKeySecret: string;
  twilioApiKeySecretSet: boolean;
  twilioTwimlAppSid: string;
  twilioConfigured: boolean;
  meetingProvider: AgentMeetingProvider;
  googleClientId: string;
  googleClientSecret: string;
  googleClientSecretSet: boolean;
  googleRefreshToken: string;
  googleRefreshTokenSet: boolean;
  googleCreateMeet: boolean;
  ecwApiEndpoint: string;
  azulApiEndpoint: string;
  meetingConfigured: boolean;
  flowId: string | null;
  knowledgeIds: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export type AgentInput = {
  title: string;
  description?: string;
  status?: "active" | "inactive";
  openaiApiKey?: string;
  clearOpenaiApiKey?: boolean;
  openaiModel?: string;
  openaiRealtimeModel?: string;
  openaiTranscriptionModel?: string;
  openaiTtsModel?: string;
  openaiInboundModel?: string;
  openaiVoice?: string;
  twilioPhoneNumber?: string;
  twilioCallerId?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioApiKeySid?: string;
  twilioApiKeySecret?: string;
  twilioTwimlAppSid?: string;
  meetingProvider?: AgentMeetingProvider;
  googleClientId?: string;
  googleClientSecret?: string;
  googleRefreshToken?: string;
  googleCreateMeet?: boolean;
  ecwApiEndpoint?: string;
  azulApiEndpoint?: string;
  flowId?: string | null;
  knowledgeIds?: string[];
};

export interface AgentModelCatalog {
  chat: string[];
  realtime: string[];
  transcription: string[];
  tts: string[];
  other: string[];
  source: "api" | "fallback";
  error?: string;
}

export interface AgentModelDefaults {
  openaiModel: string;
  openaiRealtimeModel: string;
  openaiTranscriptionModel: string;
  openaiTtsModel: string;
  openaiInboundModel: string;
  openaiVoice: string;
}

export async function listAgents() {
  const data = await request<{ agents: Agent[] }>("/api/admin/agents");
  return data.agents;
}

export async function getAgent(id: string, reveal = false) {
  const data = await request<{ agent: Agent }>(
    `/api/admin/agents/${id}${reveal ? "?reveal=1" : ""}`
  );
  return data.agent;
}

export async function createAgent(input: AgentInput) {
  const data = await request<{ agent: Agent }>("/api/admin/agents", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.agent;
}

export async function updateAgent(id: string, patch: Partial<AgentInput>) {
  const data = await request<{ agent: Agent }>(`/api/admin/agents/${id}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
  return data.agent;
}

export async function deleteAgent(id: string) {
  await request<{ success: boolean }>(`/api/admin/agents/${id}`, { method: "DELETE" });
  return true;
}

export async function listAgentModels(opts?: { apiKey?: string; agentId?: string }) {
  const data = await request<{
    models: AgentModelCatalog;
    defaults: AgentModelDefaults;
  }>("/api/admin/agents/options/models", {
    method: "POST",
    body: JSON.stringify({
      apiKey: opts?.apiKey || undefined,
      agentId: opts?.agentId ? Number(opts.agentId) : undefined,
    }),
  });
  return data;
}

export async function listAgentVoices() {
  const data = await request<{ voices: BotVoice[] }>("/api/admin/agents/options/voices");
  return data.voices;
}

export async function listAgentLinkOptions() {
  const data = await request<{
    flows: { id: string; name: string; description: string; status: string }[];
    knowledge: { id: string; knowledge: string; promptKey: string; status: string }[];
  }>("/api/admin/agents/options/links");
  return data;
}

/** Preview TTS audio for an agent voice. Caller should revoke object URLs. */
export async function fetchAgentVoicePreviewBlob(opts: {
  voice: string;
  agentId?: string;
  apiKey?: string;
  ttsModel?: string;
  text?: string;
}): Promise<Blob> {
  const res = await fetch(`${API_BASE_URL}/api/admin/agents/options/voice-preview`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...getAdminActorHeaders() },
    body: JSON.stringify({
      voice: opts.voice,
      agentId: opts.agentId ? Number(opts.agentId) : undefined,
      apiKey: opts.apiKey || undefined,
      ttsModel: opts.ttsModel || undefined,
      text: opts.text || undefined,
    }),
  });
  if (!res.ok) {
    let msg = "Voice preview failed.";
    try {
      const data = await res.json();
      if (data?.error) msg = String(data.error);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.blob();
}

export type AgentTestMessage = { role: "user" | "assistant"; content: string };

export type AgentTestChannel = "webchat" | "inbound" | "campaign";

export interface AgentTestMeta {
  channel?: AgentTestChannel | string;
  flowId: string | null;
  flowName: string | null;
  knowledgeCount: number;
  model: string;
  voice: string;
  realtimeModel: string | null;
  clinicId?: string | null;
  clinicName?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  patientName?: string | null;
}

export interface AgentTestResult {
  action?: "start" | "message" | string;
  reply: string | null;
  userTranscript?: string | null;
  messages?: AgentTestMessage[] | null;
  meta: AgentTestMeta;
  audioBase64: string | null;
  audioMimeType: string | null;
}

export async function listAgentTestOptions(agentId?: string) {
  const path = agentId
    ? `/api/admin/agents/${agentId}/test/options`
    : "/api/admin/agents/options/test";
  return request<{
    clinics: { id: string; name: string; acronym?: string | null; city?: string | null }[];
    campaigns: { id: string; name: string; status?: string | null; clinicId?: string | null }[];
  }>(path);
}

export async function testAgentChat(opts: {
  agentId?: string;
  draft?: Partial<AgentInput> & { title?: string };
  messages?: AgentTestMessage[];
  language?: string;
  speak?: boolean | null;
  channel?: AgentTestChannel;
  action?: "start" | "message";
  clinicId?: string | null;
  campaignId?: string | null;
  contactId?: string | null;
  patient?: {
    patientFirstName?: string;
    patientLastName?: string;
    patientPhone?: string;
    patientLanguage?: string;
  } | null;
  audioBase64?: string | null;
  audioMimeType?: string | null;
}) {
  const path = opts.agentId
    ? `/api/admin/agents/${opts.agentId}/test`
    : "/api/admin/agents/test";
  return request<AgentTestResult>(path, {
    method: "POST",
    body: JSON.stringify({
      agentId: opts.agentId ? Number(opts.agentId) : undefined,
      draft: opts.draft,
      messages: opts.messages || [],
      language: opts.language || "English",
      speak: opts.speak,
      channel: opts.channel || "webchat",
      action: opts.action || "message",
      clinicId: opts.clinicId || undefined,
      campaignId: opts.campaignId || undefined,
      contactId: opts.contactId || undefined,
      patient: opts.patient || undefined,
      audioBase64: opts.audioBase64 || undefined,
      audioMimeType: opts.audioMimeType || undefined,
    }),
  });
}

// ---------- Conversations / Messages ----------
export async function listConversationsByClinic(clinicId: string) {
  try {
    const data = await request<{ conversations: Conversation[] }>(
      `/api/admin/dashboard/clinics/${clinicId}/conversations`
    );
    return data.conversations;
  } catch {
    return delay(conversations.filter((c) => c.clinicId === clinicId));
  }
}
export async function listMessages(conversationId: string) {
  try {
    const data = await request<{ messages: Message[] }>(
      `/api/admin/dashboard/conversations/${conversationId}/messages`
    );
    return data.messages;
  } catch {
    return delay(messages.filter((m) => m.conversationId === conversationId));
  }
}

export async function listIncomingCalls(limit = 50) {
  const data = await request<{ calls: IncomingCall[] }>(
    `/api/admin/dashboard/calls?limit=${encodeURIComponent(String(limit))}`
  );
  return data.calls;
}

export async function listIncomingCallMessages(callId: string) {
  const data = await request<{
    call: IncomingCall;
    messages: IncomingCallMessage[];
  }>(`/api/admin/dashboard/calls/${callId}/messages`);
  return data;
}

export async function deleteIncomingCall(callId: string) {
  return request<{ success: boolean; deletedCallId: string }>(
    `/api/admin/dashboard/calls/${encodeURIComponent(callId)}`,
    { method: "DELETE" }
  );
}

export async function deleteAllIncomingCalls() {
  return request<{ success: boolean; deletedCount: number }>(
    "/api/admin/dashboard/calls",
    { method: "DELETE" }
  );
}

export interface DashboardDayStat {
  date: string;
  day: string;
  conversations: number;
  phoneCalls: number;
  webChats: number;
  appointments: number;
  /** @deprecated Use conversations / phoneCalls / webChats */
  count?: number;
}

export interface DashboardClinicStat {
  clinicId: string;
  conversations: number;
  phoneCalls: number;
  appointments: number;
}

export interface DashboardPeriodStat {
  conversations: number;
  phoneCalls: number;
  webChats: number;
  appointments: number;
}

export interface DashboardStats {
  totalClinics: number;
  totalConversations: number;
  totalMessages: number;
  totalWebChats: number;
  totalVoiceMessages: number;
  totalUsers: number;
  totalPhoneCalls: number;
  totalCallSeconds: number;
  totalAppointments: number;
  week: DashboardPeriodStat;
  previousWeek: DashboardPeriodStat;
  perDay: DashboardDayStat[];
  byClinic: DashboardClinicStat[];
}

function emptyPeriod(): DashboardPeriodStat {
  return { conversations: 0, phoneCalls: 0, webChats: 0, appointments: 0 };
}

function normalizeDashboardStats(data: Partial<DashboardStats> & { perDay?: Array<DashboardDayStat & { count?: number }> }): DashboardStats {
  const perDay = (data.perDay || []).map((row) => ({
    date: row.date || "",
    day: row.day,
    conversations: Number(row.conversations ?? row.count ?? 0),
    phoneCalls: Number(row.phoneCalls ?? 0),
    webChats: Number(row.webChats ?? 0),
    appointments: Number(row.appointments ?? 0),
  }));
  return {
    totalClinics: Number(data.totalClinics ?? 0),
    totalConversations: Number(data.totalConversations ?? 0),
    totalMessages: Number(data.totalMessages ?? 0),
    totalWebChats: Number(data.totalWebChats ?? 0),
    totalVoiceMessages: Number(data.totalVoiceMessages ?? 0),
    totalUsers: Number(data.totalUsers ?? 0),
    totalPhoneCalls: Number(data.totalPhoneCalls ?? 0),
    totalCallSeconds: Number(data.totalCallSeconds ?? 0),
    totalAppointments: Number(data.totalAppointments ?? 0),
    week: data.week || emptyPeriod(),
    previousWeek: data.previousWeek || emptyPeriod(),
    perDay,
    byClinic: data.byClinic || [],
  };
}

// ---------- Stats ----------
export const getStats = async (allowedClinicIds?: string[]) => {
  try {
    const data = await request<Partial<DashboardStats>>("/api/admin/dashboard/stats");
    const stats = normalizeDashboardStats(data);
    if (!allowedClinicIds) return stats;
    return {
      ...stats,
      byClinic: stats.byClinic.filter((row) => allowedClinicIds.includes(row.clinicId)),
    };
  } catch {
    const cs = allowedClinicIds ? clinics.filter((c) => allowedClinicIds.includes(c.id)) : clinics;
    const allowedIds = new Set(cs.map((c) => c.id));
    const cvs = conversations.filter((c) => allowedIds.has(c.clinicId));
    const msgs = messages.filter((m) => cvs.some((c) => c.id === m.conversationId));
    const perDay: DashboardDayStat[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      perDay.push({
        date: d.toISOString().slice(0, 10),
        day: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        conversations: 0,
        phoneCalls: 0,
        webChats: msgs.filter((m) => m.createdAt.slice(0, 10) === d.toISOString().slice(0, 10)).length,
        appointments: 0,
      });
    }
    return delay(normalizeDashboardStats({
      totalClinics: cs.length,
      totalConversations: cvs.length,
      totalMessages: msgs.length,
      totalWebChats: msgs.length,
      totalUsers: users.length,
      perDay,
    }));
  }
};

// ---------- Training ----------
export type TrainingStatus = "queued" | "training" | "completed" | "failed";
export interface TrainingJob {
  id: string;
  name: string;
  clinicIds: string[];
  description?: string;
  baseModel: string;
  epochs: number;
  learningRate: number;
  datasetSource: "conversations" | "topics" | "uploaded" | "all";
  status: TrainingStatus;
  progress: number; // 0-100
  createdAt: string;
  completedAt?: string;
  accuracy?: number;
}

let trainingJobs: TrainingJob[] = [
  {
    id: "job-1",
    name: "Sunrise + Pacific — v1",
    clinicIds: ["clinic-1", "clinic-2"],
    description: "Initial fine-tune on appointment & insurance topics",
    baseModel: "medbot-base-v2",
    epochs: 4,
    learningRate: 0.0002,
    datasetSource: "conversations",
    status: "completed",
    progress: 100,
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    completedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    accuracy: 0.92,
  },
  {
    id: "job-2",
    name: "Lakeside Pediatrics — refresh",
    clinicIds: ["clinic-4"],
    baseModel: "medbot-base-v2",
    epochs: 3,
    learningRate: 0.0003,
    datasetSource: "topics",
    status: "training",
    progress: 47,
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
];

export const listTrainingJobs = () => delay(trainingJobs);
export const createTrainingJob = (
  j: Omit<TrainingJob, "id" | "status" | "progress" | "createdAt">
) => {
  const created: TrainingJob = {
    ...j,
    id: `job-${Date.now()}`,
    status: "queued",
    progress: 0,
    createdAt: new Date().toISOString(),
  };
  trainingJobs = [created, ...trainingJobs];
  // Simulate progress
  setTimeout(() => {
    trainingJobs = trainingJobs.map((t) => t.id === created.id ? { ...t, status: "training", progress: 15 } : t);
  }, 800);
  return delay(created);
};
export const deleteTrainingJob = (id: string) => {
  trainingJobs = trainingJobs.filter((t) => t.id !== id);
  return delay(true);
};

// ---------- Topics ----------
export type AnswerType = "option" | "select" | "date" | "voice";
export interface TopicQuestion {
  id: string;
  prompt: string;
  answerType: AnswerType;
  required: boolean;
  options?: string[]; // for option/select
}
export interface Topic {
  id: string;
  name: string;
  description?: string;
  clinicIds: string[];
  questions: TopicQuestion[];
  active: boolean;
  createdAt: string;
}

let topics: Topic[] = [
  {
    id: "topic-1",
    name: "New Patient Intake",
    description: "Collect basic info before first visit",
    clinicIds: ["clinic-1", "clinic-3"],
    active: true,
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    questions: [
      { id: "q1", prompt: "What is the reason for your visit?", answerType: "option", required: true,
        options: ["Routine check-up", "New symptom", "Follow-up", "Prescription refill"] },
      { id: "q2", prompt: "Select your preferred clinic", answerType: "select", required: true,
        options: ["Sunrise Medical Center", "Northgate Family Clinic"] },
      { id: "q3", prompt: "Preferred appointment date", answerType: "date", required: true },
      { id: "q4", prompt: "Please describe your symptoms (voice)", answerType: "voice", required: false },
    ],
  },
  {
    id: "topic-2",
    name: "Prescription Refill",
    clinicIds: ["clinic-2"],
    active: true,
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    questions: [
      { id: "q1", prompt: "Which medication?", answerType: "select", required: true,
        options: ["Metformin", "Lisinopril", "Atorvastatin", "Other"] },
      { id: "q2", prompt: "When did you last take it?", answerType: "date", required: true },
    ],
  },
];

export const listTopics = () => delay(topics);
export const createTopic = (t: Omit<Topic, "id" | "createdAt">) => {
  const created: Topic = { ...t, id: `topic-${Date.now()}`, createdAt: new Date().toISOString() };
  topics = [created, ...topics];
  return delay(created);
};
export const updateTopic = (id: string, patch: Partial<Topic>) => {
  topics = topics.map((t) => t.id === id ? { ...t, ...patch, id: t.id } : t);
  return delay(topics.find((t) => t.id === id)!);
};
export const deleteTopic = (id: string) => {
  topics = topics.filter((t) => t.id !== id);
  return delay(true);
};

// ---------- Knowledge ----------
export interface KnowledgeItem {
  id: string;
  clinicId: string;
  clinicIds?: string[];
  knowledge: string;
  status: "active" | "inactive";
  promptKey?: string | null;
  promptLabel?: string | null;
  documentName?: string | null;
  documentPath?: string | null;
  documentMime?: string | null;
  documentSize?: number | null;
}

let knowledgeItems: KnowledgeItem[] = [];

export async function listKnowledge(params?: { clinicId?: string; status?: "active" | "inactive"; q?: string }) {
  try {
    const search = new URLSearchParams();
    if (params?.clinicId) search.set("clinicId", params.clinicId);
    if (params?.status) search.set("status", params.status);
    if (params?.q) search.set("q", params.q);
    const path = search.size ? `/api/admin/knowledge?${search.toString()}` : "/api/admin/knowledge";
    const data = await request<{ items: KnowledgeItem[] }>(path);
    return data.items;
  } catch {
    let rows = [...knowledgeItems];
    if (params?.clinicId) rows = rows.filter((x) => x.clinicId === params.clinicId);
    if (params?.status) rows = rows.filter((x) => x.status === params.status);
    if (params?.q) rows = rows.filter((x) => x.knowledge.toLowerCase().includes((params.q || "").toLowerCase()));
    return delay(rows);
  }
}

export type KnowledgeDocumentMeta = {
  documentName?: string | null;
  documentPath?: string | null;
  documentMime?: string | null;
  documentSize?: number | null;
};

export async function createKnowledge(input: {
  clinicId?: string;
  clinicIds?: string[];
  knowledge: string;
  status: "active" | "inactive";
} & KnowledgeDocumentMeta) {
  try {
    const clinicIds = (input.clinicIds?.length
      ? input.clinicIds
      : input.clinicId
        ? [input.clinicId]
        : []
    ).map(Number);
    const data = await request<{ item: KnowledgeItem }>("/api/admin/knowledge", {
      method: "POST",
      body: JSON.stringify({
        clinicIds,
        knowledge: input.knowledge,
        status: input.status,
        documentName: input.documentName || null,
        documentPath: input.documentPath || null,
        documentMime: input.documentMime || null,
        documentSize: input.documentSize ?? null
      })
    });
    return data.item;
  } catch {
    const item: KnowledgeItem = {
      id: String(Date.now()),
      clinicId: input.clinicIds?.[0] || input.clinicId || "",
      clinicIds: input.clinicIds || (input.clinicId ? [input.clinicId] : []),
      knowledge: input.knowledge,
      status: input.status,
      documentName: input.documentName || null,
      documentPath: input.documentPath || null,
      documentMime: input.documentMime || null,
      documentSize: input.documentSize ?? null
    };
    knowledgeItems = [item, ...knowledgeItems];
    return delay(item);
  }
}

export async function updateKnowledge(
  id: string,
  patch: {
    clinicId?: string;
    clinicIds?: string[];
    knowledge?: string;
    status?: "active" | "inactive";
  } & KnowledgeDocumentMeta
) {
  try {
    const body: Record<string, unknown> = {};
    if (patch.clinicIds !== undefined) body.clinicIds = patch.clinicIds.map(Number);
    else if (patch.clinicId !== undefined) body.clinicIds = [Number(patch.clinicId)];
    if (patch.knowledge !== undefined) body.knowledge = patch.knowledge;
    if (patch.status !== undefined) body.status = patch.status;
    if (patch.documentPath !== undefined) body.documentPath = patch.documentPath;
    if (patch.documentName !== undefined) body.documentName = patch.documentName;
    if (patch.documentMime !== undefined) body.documentMime = patch.documentMime;
    if (patch.documentSize !== undefined) body.documentSize = patch.documentSize;
    const data = await request<{ item: KnowledgeItem }>(`/api/admin/knowledge/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    });
    return data.item;
  } catch {
    knowledgeItems = knowledgeItems.map((x) => (x.id === id ? { ...x, ...patch, id } : x));
    return delay(knowledgeItems.find((x) => x.id === id)!);
  }
}

export async function toggleKnowledgeStatus(id: string, status: "active" | "inactive") {
  try {
    const data = await request<{ item: KnowledgeItem }>(`/api/admin/knowledge/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    return data.item;
  } catch {
    knowledgeItems = knowledgeItems.map((x) => (x.id === id ? { ...x, status } : x));
    return delay(knowledgeItems.find((x) => x.id === id)!);
  }
}

export async function deleteKnowledge(id: string) {
  try {
    await request<{ success: boolean }>(`/api/admin/knowledge/${id}`, { method: "DELETE" });
    return true;
  } catch {
    knowledgeItems = knowledgeItems.filter((x) => x.id !== id);
    return delay(true);
  }
}

export async function analyzeKnowledgeDocument(file: File, options?: { clinicId?: string; clinicName?: string }) {
  const form = new FormData();
  form.append("file", file);
  if (options?.clinicId) form.append("clinicId", options.clinicId);
  if (options?.clinicName) form.append("clinicName", options.clinicName);

  const res = await fetch(`${API_BASE_URL}/api/admin/knowledge/analyze`, {
    method: "POST",
    body: form,
    credentials: "include",
    headers: { ...getAdminActorHeaders() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || "Failed to analyze document");
  return data as {
    knowledge: string;
    filename: string;
    truncated?: boolean;
    characterCount?: number;
    documentName?: string;
    documentPath?: string;
    documentMime?: string | null;
    documentSize?: number | null;
  };
}

export function knowledgeDocumentUrl(id: string) {
  return `${API_BASE_URL}/api/admin/knowledge/${id}/document`;
}

// ---------- Conversation Flows ----------
export type FlowNodeType = "start" | "end" | "message" | "question" | "subagent" | "branch";

export interface FlowNodeOption {
  id: string;
  label: string;
  target: string;
}

export interface FlowSubagentTool {
  id: string;
  name: string;
  description: string;
  category: string;
}

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  position: { x: number; y: number };
  data: {
    label?: string;
    prompt?: string;
    description?: string;
    /** Knowledge base item ids attached to this node */
    knowledgeIds?: string[];
    /** Operator / bot guide text for this node */
    guideText?: string;
    /** Question answer branches */
    options?: FlowNodeOption[];
    /** Branch node: multiple next paths */
    branches?: FlowNodeOption[];
    /** Function tool id (backend action) */
    toolId?: string;
    toolName?: string;
    toolConfig?: Record<string, unknown>;
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  sourceHandle?: string;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface ConversationFlowItem {
  id: string;
  clinicId: string;
  clinicIds: string[];
  name: string;
  description: string;
  graph: FlowGraph;
  status: "active" | "inactive";
  createdAt?: string | null;
  updatedAt?: string | null;
}

export const FLOW_SUBAGENT_TOOLS: FlowSubagentTool[] = [
  {
    id: "book_appointment",
    name: "Book appointment",
    description: "Schedule a patient visit using clinic calendar / EHR.",
    category: "appointments",
  },
  {
    id: "cancel_appointment",
    name: "Cancel appointment",
    description: "Cancel an existing appointment for the patient.",
    category: "appointments",
  },
  {
    id: "reschedule_appointment",
    name: "Reschedule appointment",
    description: "Move an appointment to a new date/time.",
    category: "appointments",
  },
  {
    id: "send_appointment_reminder",
    name: "Send appointment reminder",
    description: "Notify the patient about an upcoming appointment.",
    category: "appointments",
  },
  {
    id: "send_voicemail",
    name: "Send voicemail",
    description: "Drop a voicemail message to the patient phone number.",
    category: "messaging",
  },
  {
    id: "send_sms",
    name: "Send text message",
    description: "Send an SMS / text message to the patient.",
    category: "messaging",
  },
  {
    id: "send_email",
    name: "Send email",
    description: "Send an email to the patient.",
    category: "messaging",
  },
  {
    id: "transfer_to_human",
    name: "Transfer to human",
    description: "Hand the call off to a clinic staff member / queue.",
    category: "call",
  },
  {
    id: "collect_payment",
    name: "Collect payment",
    description: "Start a billing / payment collection step.",
    category: "billing",
  },
  {
    id: "update_patient_info",
    name: "Update patient info",
    description: "Save updated patient contact or demographic details.",
    category: "patient",
  },
];

export async function listFlowSubagentTools() {
  try {
    const data = await request<{ tools: FlowSubagentTool[] }>("/api/admin/flows/tools");
    return data.tools?.length ? data.tools : FLOW_SUBAGENT_TOOLS;
  } catch {
    return FLOW_SUBAGENT_TOOLS;
  }
}

export function createDefaultFlowGraph(): FlowGraph {
  return {
    nodes: [
      {
        id: "start",
        type: "start",
        position: { x: 280, y: 40 },
        data: { label: "Start", knowledgeIds: [], guideText: "" },
      },
      {
        id: "end",
        type: "end",
        position: { x: 280, y: 360 },
        data: {
          label: "End",
          description: "Call finishes automatically",
          knowledgeIds: [],
          guideText: "",
        },
      },
    ],
    edges: [{ id: "e-start-end", source: "start", target: "end", label: "" }],
  };
}

export async function listConversationFlows(params?: {
  clinicId?: string;
  status?: "active" | "inactive";
  q?: string;
}) {
  const search = new URLSearchParams();
  if (params?.clinicId) search.set("clinicId", params.clinicId);
  if (params?.status) search.set("status", params.status);
  if (params?.q) search.set("q", params.q);
  const path = search.size ? `/api/admin/flows?${search.toString()}` : "/api/admin/flows";
  const data = await request<{ items: ConversationFlowItem[] }>(path);
  return data.items.map((item) => ({
    ...item,
    clinicIds: item.clinicIds?.length ? item.clinicIds : item.clinicId ? [item.clinicId] : [],
  }));
}

export async function getConversationFlow(id: string) {
  const data = await request<{ item: ConversationFlowItem }>(`/api/admin/flows/${id}`);
  const item = data.item;
  return {
    ...item,
    clinicIds: item.clinicIds?.length ? item.clinicIds : item.clinicId ? [item.clinicId] : [],
  };
}

export async function createConversationFlow(input: {
  clinicId?: string;
  clinicIds?: string[];
  name: string;
  description?: string;
  graph?: FlowGraph;
  status?: "active" | "inactive";
}) {
  const clinicIds = input.clinicIds?.length
    ? input.clinicIds
    : input.clinicId
      ? [input.clinicId]
      : [];
  const data = await request<{ item: ConversationFlowItem }>("/api/admin/flows", {
    method: "POST",
    body: JSON.stringify({ ...input, clinicIds }),
  });
  return data.item;
}

export async function updateConversationFlow(
  id: string,
  patch: Partial<{
    clinicId: string;
    clinicIds: string[];
    name: string;
    description: string;
    graph: FlowGraph;
    status: "active" | "inactive";
  }>
) {
  const body: Record<string, unknown> = { ...patch };
  if (patch.clinicIds !== undefined) body.clinicIds = patch.clinicIds;
  else if (patch.clinicId !== undefined) body.clinicIds = [patch.clinicId];
  const data = await request<{ item: ConversationFlowItem }>(`/api/admin/flows/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return data.item;
}

export async function deleteConversationFlow(id: string) {
  await request<{ success: boolean }>(`/api/admin/flows/${id}`, { method: "DELETE" });
}

// ---------- Campaigns ----------
export type CampaignStatus = "draft" | "ready" | "running" | "paused" | "completed";
export type CampaignContactStatus =
  | "pending"
  | "calling"
  | "success"
  | "reject"
  | "interesting"
  | "not_interesting";

export interface CampaignContactCounts {
  total: number;
  pending?: number;
  calling?: number;
  success?: number;
  reject?: number;
  interesting?: number;
  not_interesting?: number;
  completed?: number;
  failed?: number;
  queued?: number;
  skipped?: number;
}

export interface CampaignItem {
  id: string;
  clinicId: string;
  /** Assigned agent — owns conversation flow + knowledge for outbound calls */
  agentId?: string | null;
  agentTitle?: string | null;
  /** Resolved from agent (or legacy campaign.flowId) */
  flowId?: string | null;
  flowName?: string | null;
  name: string;
  description: string;
  status: CampaignStatus;
  scheduledAt?: string | null;
  retryCount?: number;
  externalSource?: string | null;
  contactCounts?: CampaignContactCounts;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CampaignContactItem {
  id: string;
  campaignId: string;
  patientFirstName?: string;
  patientLastName?: string;
  patientName: string;
  patientPhone: string;
  patientEmail?: string | null;
  patientDob?: string | null;
  patientLanguage?: string | null;
  patientMemberNumber?: string | null;
  extra?: Record<string, string>;
  status: CampaignContactStatus;
  attemptCount?: number;
  lastCallAt?: string | null;
  lastAnalysisSummary?: string | null;
  lastError?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export type CampaignCallResultType =
  | "pending"
  | "calling"
  | "success"
  | "reject"
  | "interesting"
  | "not_interesting";

export interface CampaignCallHistoryItem {
  id: string;
  campaignId: string;
  campaignContactId: string;
  callId?: string | null;
  callSid?: string | null;
  flowId?: string | null;
  attemptNumber: number;
  language?: string | null;
  resultType: CampaignCallResultType;
  summary: string;
  analysisNotes?: string;
  rawAnalysis?: {
    resultType?: string;
    summary?: string;
    notes?: string;
    keyPoints?: string[];
  } | null;
  transcript?: Array<{ role: string; text: string }>;
  durationSeconds?: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
  errorMessage?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export type PatientFieldKey = "firstName" | "lastName" | "dob" | "phone" | "language" | "memberNumber";

export interface PatientImportField {
  key: PatientFieldKey;
  label: string;
  required: boolean;
}

export interface PatientImportAnalysis {
  valid: number;
  invalid: number;
  duplicatesInFile: number;
  duplicatesExisting: number;
  willImport: number;
  errors: Array<{ row: number; reason: string }>;
  uniqueSample?: Array<Record<string, unknown>>;
  duplicateInFileSample?: Array<Record<string, unknown>>;
  duplicateExistingSample?: Array<Record<string, unknown>>;
}

export interface PatientImportAnalyzeResult {
  columns: string[];
  fields: PatientImportField[];
  suggestedMapping: Record<PatientFieldKey, string>;
  previewRows: Array<Record<string, string>>;
  rows: Array<Record<string, string>>;
  totalRows: number;
  existingContactCount: number;
  analysis: PatientImportAnalysis;
}

export async function analyzeCampaignImport(id: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE_URL}/api/admin/campaigns/${id}/import/analyze`, {
    method: "POST",
    body: form,
    credentials: "include",
    headers: { ...getAdminActorHeaders() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || "Failed to analyze Excel");
  return data as PatientImportAnalyzeResult;
}

export async function previewCampaignImport(
  id: string,
  input: { mapping: Record<string, string>; rows: Array<Record<string, string>> }
) {
  return request<{ analysis: PatientImportAnalysis }>(`/api/admin/campaigns/${id}/import/preview`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function confirmCampaignImport(
  id: string,
  input: {
    mapping: Record<string, string>;
    rows: Array<Record<string, string>>;
    replace?: boolean;
    skipFileDuplicates?: boolean;
    skipExistingDuplicates?: boolean;
  }
) {
  return request<{
    item: CampaignItem;
    imported: number;
    skippedInvalid: number;
    skippedFileDuplicates: number;
    skippedExistingDuplicates: number;
    analysis: PatientImportAnalysis;
    contacts: CampaignContactItem[];
  }>(`/api/admin/campaigns/${id}/import/confirm`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function importCampaignContacts(id: string, file: File, replace = false) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(
    `${API_BASE_URL}/api/admin/campaigns/${id}/import?replace=${replace ? "1" : "0"}`,
    {
      method: "POST",
      body: form,
      credentials: "include",
      headers: { ...getAdminActorHeaders() },
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || "Import failed");
  return data as {
    item: CampaignItem;
    imported: number;
    skipped: number;
    errors: string[];
    contacts: CampaignContactItem[];
  };
}

export async function listCampaigns(params?: {
  clinicId?: string;
  status?: CampaignStatus;
  q?: string;
}) {
  const search = new URLSearchParams();
  if (params?.clinicId) search.set("clinicId", params.clinicId);
  if (params?.status) search.set("status", params.status);
  if (params?.q) search.set("q", params.q);
  const path = search.size ? `/api/admin/campaigns?${search.toString()}` : "/api/admin/campaigns";
  const data = await request<{ items: CampaignItem[] }>(path);
  return data.items;
}

export async function getCampaign(id: string) {
  return request<{ item: CampaignItem; contacts: CampaignContactItem[] }>(`/api/admin/campaigns/${id}`);
}

export async function createCampaign(input: {
  clinicId: string;
  agentId: string;
  name: string;
  description?: string;
  scheduledAt: string;
  retryCount?: number;
  externalSource?: string;
}) {
  const data = await request<{ item: CampaignItem }>("/api/admin/campaigns", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.item;
}

export async function updateCampaign(
  id: string,
  patch: Partial<{
    clinicId: string;
    agentId: string;
    name: string;
    description: string;
    scheduledAt: string;
    retryCount: number;
    externalSource: string | null;
  }>
) {
  const data = await request<{ item: CampaignItem }>(`/api/admin/campaigns/${id}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
  return data.item;
}

export async function pauseCampaign(id: string) {
  const data = await request<{ item: CampaignItem }>(`/api/admin/campaigns/${id}/pause`, {
    method: "POST",
  });
  return data.item;
}

export async function resumeCampaign(id: string) {
  const data = await request<{ item: CampaignItem }>(`/api/admin/campaigns/${id}/resume`, {
    method: "POST",
  });
  return data.item;
}

export async function deleteCampaign(id: string) {
  await request<{ success: boolean }>(`/api/admin/campaigns/${id}`, { method: "DELETE" });
}

export async function syncCampaignContactsFromExternal(
  id: string,
  input: {
    url?: string;
    method?: PatientApiHttpMethod;
    token?: string;
    body?: unknown;
    listPath?: string;
    mapping?: PatientApiFieldMapping;
    replace?: boolean;
  } = {}
) {
  const data = await request<{
    item: CampaignItem;
    imported: number;
    skipped: number;
    errors: string[];
    contacts: CampaignContactItem[];
  }>(`/api/admin/campaigns/${id}/sync-external`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data;
}

export type PatientApiHttpMethod = "GET" | "POST";

export interface PatientApiFieldMapping {
  firstName: string;
  lastName: string;
  dob: string;
  phone: string;
  language: string;
  memberNumber: string;
}

export async function deleteCampaignContact(campaignId: string, contactId: string) {
  await request<{ success: boolean }>(
    `/api/admin/campaigns/${campaignId}/contacts/${contactId}`,
    { method: "DELETE" }
  );
}

export async function getCampaignContactHistory(campaignId: string, contactId: string) {
  return request<{
    contact: CampaignContactItem;
    history: CampaignCallHistoryItem[];
    botContext?: {
      language: string;
      flowId: string;
      flowName: string;
      instructionsPreview: string;
    } | null;
  }>(`/api/admin/campaigns/${campaignId}/contacts/${contactId}/history`);
}

export async function reanalyzeCampaignCallHistory(
  campaignId: string,
  contactId: string,
  historyId: string
) {
  return request<{
    item: CampaignCallHistoryItem;
    contact: CampaignContactItem | null;
  }>(`/api/admin/campaigns/${campaignId}/contacts/${contactId}/history/${historyId}/reanalyze`, {
    method: "POST",
  });
}

// ---------- HIPAA Audit logs ----------
export type AuditAction =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "CREATE"
  | "READ"
  | "UPDATE"
  | "DELETE"
  | "EXPORT"
  | "ACCESS"
  | string;

export interface AuditLogItem {
  id: string;
  occurredAt: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId: string | null;
  clinicId: string | null;
  outcome: "success" | "failure" | string;
  ipAddress: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  userAgent: string | null;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AuditLogListResult {
  items: AuditLogItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function listAuditLogs(params?: {
  q?: string;
  action?: string;
  resourceType?: string;
  actorEmail?: string;
  outcome?: string;
  clinicId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}) {
  const search = new URLSearchParams();
  if (params?.q) search.set("q", params.q);
  if (params?.action) search.set("action", params.action);
  if (params?.resourceType) search.set("resourceType", params.resourceType);
  if (params?.actorEmail) search.set("actorEmail", params.actorEmail);
  if (params?.outcome) search.set("outcome", params.outcome);
  if (params?.clinicId) search.set("clinicId", params.clinicId);
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  if (params?.page) search.set("page", String(params.page));
  if (params?.limit) search.set("limit", String(params.limit));
  const qs = search.toString();
  return request<AuditLogListResult>(
    qs ? `/api/admin/audit-logs?${qs}` : "/api/admin/audit-logs"
  );
}

export async function clearAllAuditLogs() {
  return request<{ success: boolean; deleted: number }>("/api/admin/audit-logs", {
    method: "DELETE",
  });
}


