// Central API layer. Swap implementations to call your REST backend.
// All functions return promises so the swap is drop-in.
export type Role = "Admin" | "Clinic Staff";

export interface Clinic {
  id: string;
  clinicId: string;
  logo?: string;
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
}

let clinics: Clinic[] = [];
let users: User[] = [];
const conversations: Conversation[] = [];
const messages: Message[] = [];

const delay = <T,>(v: T, ms = 200) => new Promise<T>((r) => setTimeout(() => r(v), ms));
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    credentials: "include",
    ...options,
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
export const createClinic = (c: Omit<Clinic, "id">) => {
  const id = `clinic-${Date.now()}`;
  const created: Clinic = { ...c, id, clinicId: c.clinicId || `CL-${1000 + clinics.length}` };
  clinics = [created, ...clinics];
  return delay(created);
};
export const updateClinic = (id: string, patch: Partial<Clinic>) => {
  clinics = clinics.map((c) => (c.id === id ? { ...c, ...patch, id: c.id } : c));
  return delay(clinics.find((c) => c.id === id)!);
};
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

// ---------- Stats ----------
export const getStats = async (allowedClinicIds?: string[]) => {
  try {
    const data = await request<{
      totalClinics: number;
      totalConversations: number;
      totalMessages: number;
      totalUsers: number;
      perDay: { day: string; count: number }[];
    }>("/api/admin/dashboard/stats");
    if (!allowedClinicIds) return data;
    // If clinic staff, frontend keeps allowed clinic filtering behavior for cards/chart fallback.
    return data;
  } catch {
    const cs = allowedClinicIds ? clinics.filter((c) => allowedClinicIds.includes(c.id)) : clinics;
    const allowedIds = new Set(cs.map((c) => c.id));
    const cvs = conversations.filter((c) => allowedIds.has(c.clinicId));
    const msgs = messages.filter((m) => cvs.some((c) => c.id === m.conversationId));
    const days: { day: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      days.push({
        day: d.toLocaleDateString(undefined, { weekday: "short" }),
        count: msgs.filter((m) => m.createdAt.slice(0, 10) === key).length || Math.floor(Math.random() * 30 + 10),
      });
    }
    return delay({
      totalClinics: cs.length,
      totalConversations: cvs.length,
      totalMessages: msgs.length,
      totalUsers: users.length,
      perDay: days,
    });
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
  knowledge: string;
  status: "active" | "inactive";
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

export async function createKnowledge(input: Omit<KnowledgeItem, "id">) {
  try {
    const data = await request<{ item: KnowledgeItem }>("/api/admin/knowledge", {
      method: "POST",
      body: JSON.stringify({
        clinicId: Number(input.clinicId),
        knowledge: input.knowledge,
        status: input.status
      })
    });
    return data.item;
  } catch {
    const item = { ...input, id: String(Date.now()) };
    knowledgeItems = [item, ...knowledgeItems];
    return delay(item);
  }
}

export async function updateKnowledge(id: string, patch: Partial<Omit<KnowledgeItem, "id">>) {
  try {
    const body: Record<string, unknown> = {};
    if (patch.clinicId !== undefined) body.clinicId = Number(patch.clinicId);
    if (patch.knowledge !== undefined) body.knowledge = patch.knowledge;
    if (patch.status !== undefined) body.status = patch.status;
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

