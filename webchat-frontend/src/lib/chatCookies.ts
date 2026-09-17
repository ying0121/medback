import { getCookie, setCookie } from "./cookies";
import { normalizeColorMode, type ColorMode } from "./chatThemes";
import type { UserInfo } from "../components/chatbot/types";

const USER_INFO_KEY = "medibot_user_info";
const CONVERSATION_ID_KEY = "medibot_conversation_id";
const CLINIC_ID_KEY = "medibot_clinic_id";
const COLOR_MODE_KEY = "medibot_color_mode";

export const getUserInfoFromCookie = (): UserInfo | null => {
  const raw = getCookie(USER_INFO_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserInfo;
  } catch {
    return null;
  }
};

export const setUserInfoCookie = (info: UserInfo): void => {
  setCookie(USER_INFO_KEY, JSON.stringify(info));
};

export const clearUserInfoCookie = (): void => {
  setCookie(USER_INFO_KEY, "", 0);
};

export const getConversationIdFromCookie = (): string | null => {
  return getCookie(CONVERSATION_ID_KEY);
};

export const setConversationIdCookie = (id: string | number): void => {
  setCookie(CONVERSATION_ID_KEY, String(id));
};

export const clearConversationIdCookie = (): void => {
  setCookie(CONVERSATION_ID_KEY, "", 0);
};

export const getClinicIdFromCookie = (): string | null => {
  return getCookie(CLINIC_ID_KEY);
};

export const setClinicIdCookie = (clinicId: string): void => {
  setCookie(CLINIC_ID_KEY, clinicId);
};

export const clearClinicIdCookie = (): void => {
  setCookie(CLINIC_ID_KEY, "", 0);
};

export const getColorModeFromCookie = (): ColorMode => {
  return normalizeColorMode(getCookie(COLOR_MODE_KEY));
};

export const setColorModeCookie = (mode: ColorMode): void => {
  setCookie(COLOR_MODE_KEY, mode);
};

export const getClinicScopedChatSessionFromCookies = (
  clinicId: string,
): { userInfo: UserInfo | null; conversationId: string | null } => {
  const normalizedClinicId = clinicId.trim();
  const storedClinicId = getClinicIdFromCookie();

  if (storedClinicId && storedClinicId !== normalizedClinicId) {
    clearUserInfoCookie();
    clearConversationIdCookie();
    setClinicIdCookie(normalizedClinicId);
    return { userInfo: null, conversationId: null };
  }

  if (storedClinicId !== normalizedClinicId) {
    setClinicIdCookie(normalizedClinicId);
  }

  return {
    userInfo: getUserInfoFromCookie(),
    conversationId: getConversationIdFromCookie(),
  };
};
