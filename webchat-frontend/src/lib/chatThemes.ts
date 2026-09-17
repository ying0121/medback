/** CSS variable values (HSL components without hsl() wrapper). */
export type ChatThemeVariables = Record<string, string>;

export type ColorMode = "dark" | "light";

/** Supported brand color ids — backend sends one of these via `themeColor`. */
export const THEME_COLOR_IDS = [
  "azure",
  "blue",
  "sky",
  "cyan",
  "teal",
  "emerald",
  "green",
  "lime",
  "yellow",
  "amber",
  "orange",
  "red",
  "rose",
  "pink",
  "purple",
  "violet",
] as const;

export type ThemeColorId = (typeof THEME_COLOR_IDS)[number];

/** Default brand color (formerly `dark-blue`). */
export const DEFAULT_THEME_COLOR_ID: ThemeColorId = "azure";

const THEME_BRAND: Record<ThemeColorId, readonly [primary: string, accent: string]> = {
  azure: ["199 89% 48%", "174 72% 46%"],
  blue: ["217 91% 55%", "199 89% 48%"],
  sky: ["199 89% 48%", "186 85% 52%"],
  cyan: ["187 85% 48%", "174 72% 46%"],
  teal: ["174 72% 46%", "160 70% 42%"],
  emerald: ["160 84% 42%", "142 76% 40%"],
  green: ["142 71% 45%", "120 65% 40%"],
  lime: ["84 81% 44%", "72 70% 42%"],
  yellow: ["48 96% 53%", "38 92% 50%"],
  amber: ["38 92% 50%", "25 95% 53%"],
  orange: ["25 95% 53%", "38 92% 50%"],
  red: ["0 84% 60%", "350 78% 56%"],
  rose: ["350 78% 56%", "330 75% 58%"],
  pink: ["330 75% 58%", "310 70% 58%"],
  purple: ["270 70% 58%", "290 65% 58%"],
  violet: ["258 75% 58%", "270 70% 58%"],
};

const parseHue = (hsl: string): number => {
  const match = hsl.trim().match(/^(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 222;
};

const buildThemeDark = (primary: string, accent: string): ChatThemeVariables => {
  const hue = parseHue(primary);
  const accentHue = parseHue(accent);

  const background = `${hue} 48% 6%`;
  const card = `${hue} 42% 9%`;
  const muted = `${hue} 34% 13%`;
  const secondary = `${hue} 32% 16%`;
  const border = `${hue} 28% 20%`;
  const botMsg = `${hue} 36% 15%`;
  const headerFrom = `${hue} 42% 11%`;
  const headerTo = `${accentHue} 38% 12%`;
  const inputSurface = `${hue} 36% 12%`;
  const foreground = `${hue} 25% 94%`;
  const mutedForeground = `${hue} 18% 58%`;
  const primaryForeground = `${hue} 48% 6%`;

  return {
    background,
    foreground,
    card,
    "card-foreground": foreground,
    popover: card,
    "popover-foreground": foreground,
    primary,
    "primary-foreground": primaryForeground,
    secondary,
    "secondary-foreground": foreground,
    muted,
    "muted-foreground": mutedForeground,
    accent,
    "accent-foreground": primaryForeground,
    destructive: "0 84% 60%",
    "destructive-foreground": "210 40% 98%",
    border,
    input: border,
    ring: primary,
    "chat-bubble-bg": primary,
    "chat-user-msg": primary,
    "chat-bot-msg": botMsg,
    "chat-gradient-start": primary,
    "chat-gradient-end": accent,
    "chat-glow": primary,
    "chat-header-from": headerFrom,
    "chat-header-to": headerTo,
    "chat-input-surface": inputSurface,
    "sidebar-background": background,
    "sidebar-foreground": foreground,
    "sidebar-primary": primary,
    "sidebar-primary-foreground": primaryForeground,
    "sidebar-accent": secondary,
    "sidebar-accent-foreground": foreground,
    "sidebar-border": border,
    "sidebar-ring": primary,
    "voice-panel-from": primary,
    "voice-panel-to": accent,
    "voice-border": primary,
    "voice-accent": primary,
    "voice-text": foreground,
    "voice-text-muted": mutedForeground,
    "voice-bubble-from": botMsg,
    "voice-bubble-to": muted,
  };
};

const buildThemeLight = (primary: string, accent: string): ChatThemeVariables => {
  const hue = parseHue(primary);
  const accentHue = parseHue(accent);

  const background = `${hue} 40% 96%`;
  const card = `${hue} 35% 99%`;
  const muted = `${hue} 32% 92%`;
  const secondary = `${hue} 38% 90%`;
  const border = `${hue} 22% 84%`;
  const botMsg = `${hue} 35% 93%`;
  const headerFrom = `${hue} 45% 94%`;
  const headerTo = `${accentHue} 40% 93%`;
  const inputSurface = `${hue} 38% 97%`;
  const foreground = `${hue} 45% 14%`;
  const mutedForeground = `${hue} 18% 42%`;
  const primaryForeground = "0 0% 100%";

  return {
    background,
    foreground,
    card,
    "card-foreground": foreground,
    popover: card,
    "popover-foreground": foreground,
    primary,
    "primary-foreground": primaryForeground,
    secondary,
    "secondary-foreground": foreground,
    muted,
    "muted-foreground": mutedForeground,
    accent,
    "accent-foreground": primaryForeground,
    destructive: "0 72% 51%",
    "destructive-foreground": "0 0% 100%",
    border,
    input: border,
    ring: primary,
    "chat-bubble-bg": primary,
    "chat-user-msg": primary,
    "chat-bot-msg": botMsg,
    "chat-gradient-start": primary,
    "chat-gradient-end": accent,
    "chat-glow": primary,
    "chat-header-from": headerFrom,
    "chat-header-to": headerTo,
    "chat-input-surface": inputSurface,
    "sidebar-background": background,
    "sidebar-foreground": foreground,
    "sidebar-primary": primary,
    "sidebar-primary-foreground": primaryForeground,
    "sidebar-accent": secondary,
    "sidebar-accent-foreground": foreground,
    "sidebar-border": border,
    "sidebar-ring": primary,
    "voice-panel-from": primary,
    "voice-panel-to": accent,
    "voice-border": primary,
    "voice-accent": primary,
    "voice-text": foreground,
    "voice-text-muted": mutedForeground,
    "voice-bubble-from": botMsg,
    "voice-bubble-to": muted,
  };
};

const buildThemesForMode = (mode: ColorMode): Record<ThemeColorId, ChatThemeVariables> => {
  const build = mode === "light" ? buildThemeLight : buildThemeDark;
  return Object.fromEntries(
    THEME_COLOR_IDS.map((id) => [id, build(...THEME_BRAND[id])]),
  ) as Record<ThemeColorId, ChatThemeVariables>;
};

export const CHAT_THEMES_DARK = buildThemesForMode("dark");
export const CHAT_THEMES_LIGHT = buildThemesForMode("light");

/** @deprecated Use CHAT_THEMES_DARK */
export const CHAT_THEMES = CHAT_THEMES_DARK;

export const getThemeVariables = (
  themeId: ThemeColorId,
  colorMode: ColorMode = "dark",
): ChatThemeVariables => {
  const palette = colorMode === "light" ? CHAT_THEMES_LIGHT : CHAT_THEMES_DARK;
  return palette[themeId] ?? palette[DEFAULT_THEME_COLOR_ID];
};

const THEME_ALIAS: Record<string, ThemeColorId> = {
  azure: "azure",
  "dark-blue": "azure",
  darkblue: "azure",
  "dark_blue": "azure",
  blue: "blue",
  sky: "sky",
  cyan: "cyan",
  teal: "teal",
  emerald: "emerald",
  green: "green",
  lime: "lime",
  yellow: "yellow",
  amber: "amber",
  orange: "orange",
  red: "red",
  rose: "rose",
  pink: "pink",
  purple: "purple",
  violet: "violet",
};

/** Maps backend `themeColor` strings to a known theme id (fallback: azure). */
export const normalizeThemeColorId = (raw: string | undefined | null): ThemeColorId => {
  if (!raw?.trim()) return DEFAULT_THEME_COLOR_ID;
  const key = raw.trim().toLowerCase().replace(/\s+/g, "-");
  return THEME_ALIAS[key] ?? DEFAULT_THEME_COLOR_ID;
};

export const normalizeColorMode = (raw: string | undefined | null): ColorMode => {
  if (raw?.trim().toLowerCase() === "light") return "light";
  return "dark";
};

export const WIDGET_MOUNT_ID = "medical-chatbot-root-component";
const WIDGET_MOUNTED_SELECTOR = '[data-medical-chatbot-mounted="true"]';

let registeredWidgetRoot: HTMLElement | null = null;
let registeredWidgetHost: HTMLElement | null = null;

export const registerWidgetElements = (root: HTMLElement, host: HTMLElement): void => {
  registeredWidgetRoot = root;
  registeredWidgetHost = host;
};

export const getWidgetHostElement = (): HTMLElement | null => {
  if (registeredWidgetHost?.isConnected) {
    return registeredWidgetHost;
  }
  const host = document.getElementById(WIDGET_MOUNT_ID);
  return host instanceof HTMLElement ? host : null;
};

export const getWidgetRootElement = (): HTMLElement | null => {
  if (registeredWidgetRoot?.isConnected) {
    return registeredWidgetRoot;
  }

  const host = getWidgetHostElement();
  if (host?.shadowRoot) {
    const inShadow = host.shadowRoot.querySelector<HTMLElement>(WIDGET_MOUNTED_SELECTOR);
    if (inShadow) return inShadow;
  }

  return document.querySelector<HTMLElement>(WIDGET_MOUNTED_SELECTOR);
};

export const applyChatTheme = (
  element: HTMLElement,
  themeId: ThemeColorId,
  colorMode: ColorMode = "dark",
): void => {
  const vars = getThemeVariables(themeId, colorMode);
  for (const [name, value] of Object.entries(vars)) {
    element.style.setProperty(`--${name}`, value);
  }
  element.dataset.theme = themeId;
  element.dataset.colorMode = colorMode;
};

export const applyChatThemeToWidget = (
  themeId: ThemeColorId,
  colorMode: ColorMode = "dark",
): boolean => {
  const root = getWidgetRootElement();
  const host = getWidgetHostElement();
  if (!root && !host) return false;

  if (root) applyChatTheme(root, themeId, colorMode);
  if (host) applyChatTheme(host, themeId, colorMode);
  return true;
};
