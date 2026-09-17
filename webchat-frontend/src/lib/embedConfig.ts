import { WIDGET_MOUNT_ID } from "@/lib/chatThemes";

export type EmbedConfig = {
  clinicId: string;
  backendUrl: string;
  websocketUrl: string;
  websocketPath: string;
  /** Origin+path prefix where CDN assets are hosted (e.g. https://api.example.com/cdn) */
  cdnBaseUrl: string;
};

const DEFAULT_WS_PATH = "/ws/chat";

let cached: EmbedConfig | null = null;
/** Captured early — `document.currentScript` is null after the script finishes. */
let capturedScriptEl: HTMLScriptElement | null = null;

const trimSlash = (value: string): string => value.replace(/\/+$/, "");

const attr = (el: Element | null | undefined, name: string): string => {
  if (!el) return "";
  return (el.getAttribute(name) || "").trim();
};

const queryParam = (scriptEl: HTMLScriptElement | null, names: string[]): string => {
  if (!scriptEl?.src) return "";
  try {
    const url = new URL(scriptEl.src, window.location.href);
    for (const name of names) {
      const value = (url.searchParams.get(name) || "").trim();
      if (value) return value;
    }
  } catch {
    /* ignore */
  }
  return "";
};

/** Finds the script tag that loaded this widget (CDN URL). */
export const findWidgetScriptElement = (): HTMLScriptElement | null => {
  if (capturedScriptEl) return capturedScriptEl;
  if (typeof document === "undefined") return null;

  const current = document.currentScript;
  if (current instanceof HTMLScriptElement && current.src) {
    capturedScriptEl = current;
    return current;
  }

  const scripts = Array.from(document.getElementsByTagName("script"));
  for (let i = scripts.length - 1; i >= 0; i -= 1) {
    const script = scripts[i];
    const src = (script.getAttribute("src") || "").toLowerCase();
    if (
      src.includes("/cdn/webchat.js") ||
      src.includes("/webchat/embed.js") ||
      src.includes("medical-chatbot.iife.js") ||
      src.includes("/cdn/webchat/")
    ) {
      capturedScriptEl = script;
      return script;
    }
  }
  return null;
};

/** Call as early as possible so deferred scripts still resolve config from the tag. */
export const captureWidgetScriptElement = (): void => {
  findWidgetScriptElement();
};

const resolveCdnBaseUrl = (scriptEl: HTMLScriptElement | null): string => {
  if (scriptEl?.src) {
    try {
      const url = new URL(scriptEl.src, window.location.href);
      // https://host/cdn/webchat.js → https://host/cdn
      const path = url.pathname.replace(/\/[^/]*$/, "");
      if (path && path !== "/") {
        return `${url.origin}${path}`;
      }
      return url.origin;
    } catch {
      /* fall through */
    }
  }

  const envBackend = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.trim();
  if (envBackend) {
    return `${trimSlash(envBackend)}/cdn`;
  }

  if (typeof window !== "undefined") {
    return `${window.location.origin}/cdn`;
  }

  return "/cdn";
};

const resolveBackendUrl = (
  hostEl: Element | null,
  scriptEl: HTMLScriptElement | null,
  cdnBaseUrl: string,
): string => {
  const fromAttr =
    attr(hostEl, "data-backend-url") ||
    attr(scriptEl, "data-backend-url") ||
    queryParam(scriptEl, ["backendUrl", "backend-url", "backend"]);
  if (fromAttr) return trimSlash(fromAttr);

  const envBackend = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.trim();
  if (envBackend) return trimSlash(envBackend);

  // CDN host is the API host when serving /cdn/webchat.js from Express.
  try {
    return new URL(cdnBaseUrl, window.location.href).origin;
  } catch {
    /* fall through */
  }

  return `${window.location.protocol}//${window.location.host}`;
};

const resolveClinicId = (hostEl: Element | null, scriptEl: HTMLScriptElement | null): string => {
  return (
    attr(hostEl, "data-clinic-id") ||
    attr(scriptEl, "data-clinic-id") ||
    queryParam(scriptEl, ["clinicId", "clinic-id", "clinic_id", "clinic"]) ||
    ((import.meta.env.VITE_CLINIC_ID as string | undefined) ?? "").trim()
  );
};

/**
 * Ensures the mount host exists. Clinics only need the CDN script tag —
 * this injects `<div id="medical-chatbot-root-component" …>` automatically.
 */
export const ensureMountElement = (): HTMLElement | null => {
  if (typeof document === "undefined") return null;

  const scriptEl = findWidgetScriptElement();
  let hostEl = document.getElementById(WIDGET_MOUNT_ID);

  if (!hostEl) {
    hostEl = document.createElement("div");
    hostEl.id = WIDGET_MOUNT_ID;
    (document.body || document.documentElement).appendChild(hostEl);
  }

  // Sync runtime config from the script tag onto the mount node.
  const clinicId = resolveClinicId(hostEl, scriptEl);
  if (clinicId && !attr(hostEl, "data-clinic-id")) {
    hostEl.setAttribute("data-clinic-id", clinicId);
  }

  const backendUrl =
    attr(scriptEl, "data-backend-url") ||
    queryParam(scriptEl, ["backendUrl", "backend-url", "backend"]);
  if (backendUrl && !attr(hostEl, "data-backend-url")) {
    hostEl.setAttribute("data-backend-url", backendUrl);
  }

  const websocketUrl =
    attr(scriptEl, "data-websocket-url") ||
    queryParam(scriptEl, ["websocketUrl", "websocket-url", "wsUrl"]);
  if (websocketUrl && !attr(hostEl, "data-websocket-url")) {
    hostEl.setAttribute("data-websocket-url", websocketUrl);
  }

  const websocketPath =
    attr(scriptEl, "data-websocket-path") ||
    queryParam(scriptEl, ["websocketPath", "websocket-path", "wsPath"]);
  if (websocketPath && !attr(hostEl, "data-websocket-path")) {
    hostEl.setAttribute("data-websocket-path", websocketPath);
  }

  return hostEl;
};

/**
 * Reads embed settings from the mount node / script tag / script URL query.
 * Prefer runtime config so one CDN bundle works for every clinic.
 */
export const readEmbedConfig = (hostElement?: HTMLElement | null): EmbedConfig => {
  if (cached) return cached;

  const hostEl =
    hostElement ??
    (typeof document !== "undefined" ? document.getElementById(WIDGET_MOUNT_ID) : null);
  const scriptEl = findWidgetScriptElement();
  const cdnBaseUrl = resolveCdnBaseUrl(scriptEl);
  const backendUrl = resolveBackendUrl(hostEl, scriptEl, cdnBaseUrl);

  const clinicId = resolveClinicId(hostEl, scriptEl);

  const websocketPath =
    attr(hostEl, "data-websocket-path") ||
    attr(scriptEl, "data-websocket-path") ||
    queryParam(scriptEl, ["websocketPath", "websocket-path", "wsPath"]) ||
    ((import.meta.env.VITE_WEBSOCKET_PATH as string | undefined) ?? "").trim() ||
    DEFAULT_WS_PATH;

  const websocketUrl =
    attr(hostEl, "data-websocket-url") ||
    attr(scriptEl, "data-websocket-url") ||
    queryParam(scriptEl, ["websocketUrl", "websocket-url", "wsUrl"]) ||
    ((import.meta.env.VITE_WEBSOCKET_URL as string | undefined) ?? "").trim();

  cached = {
    clinicId,
    backendUrl,
    websocketUrl,
    websocketPath: websocketPath.startsWith("/") ? websocketPath : `/${websocketPath}`,
    cdnBaseUrl: trimSlash(cdnBaseUrl),
  };

  return cached;
};

export const getEmbedConfig = (): EmbedConfig => {
  return cached ?? readEmbedConfig();
};

/** Clears cache (tests / remount). */
export const resetEmbedConfig = (): void => {
  cached = null;
};
