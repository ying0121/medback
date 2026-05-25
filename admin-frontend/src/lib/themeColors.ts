/** Must match `src/constants/themeColors.js` on the backend. */
export const THEME_COLOR_OPTIONS = [
  { id: "azure", label: "Azure", from: "#0DA2E7", to: "#21CAB9" },
  { id: "blue", label: "Blue", from: "#2474F5", to: "#0DA2E7" },
  { id: "sky", label: "Sky", from: "#0DA2E7", to: "#1DD8ED" },
  { id: "cyan", label: "Cyan", from: "#12CAE2", to: "#21CAB9" },
  { id: "teal", label: "Teal", from: "#21CAB9", to: "#20B684" },
  { id: "emerald", label: "Emerald", from: "#11C589", to: "#18B451" },
  { id: "green", label: "Green", from: "#21C45D", to: "#24A824" },
  { id: "lime", label: "Lime", from: "#82CB15", to: "#98B620" },
  { id: "yellow", label: "Yellow", from: "#FACC14", to: "#F59F0A" },
  { id: "amber", label: "Amber", from: "#F59F0A", to: "#F97415" },
  { id: "orange", label: "Orange", from: "#F97415", to: "#F59F0A" },
  { id: "red", label: "Red", from: "#EF4343", to: "#E63754" },
  { id: "rose", label: "Rose", from: "#E63754", to: "#E44494" },
  { id: "pink", label: "Pink", from: "#E44494", to: "#DF49C6" },
  { id: "purple", label: "Purple", from: "#9449DF", to: "#C24EDA" },
  { id: "violet", label: "Violet", from: "#7444E4", to: "#9449DF" }
] as const;

export type ClinicThemeColor = (typeof THEME_COLOR_OPTIONS)[number]["id"];

export const CLINIC_THEME_COLORS = THEME_COLOR_OPTIONS.map((o) => ({
  value: o.id,
  label: o.label,
  from: o.from,
  to: o.to
}));

export const DEFAULT_CLINIC_THEME_COLOR: ClinicThemeColor = "azure";

export function themeGradient(from: string, to: string) {
  return `linear-gradient(135deg, ${from}, ${to})`;
}

const LEGACY_THEME_COLOR_ALIASES: Record<string, ClinicThemeColor> = {
  "dark-blue": "azure",
  "dark-mode": "azure"
};

export function normalizeClinicThemeColor(id: string | undefined): ClinicThemeColor {
  const key = String(id || "").trim().toLowerCase();
  const resolved = LEGACY_THEME_COLOR_ALIASES[key] || key;
  if (CLINIC_THEME_COLORS.some((c) => c.value === resolved)) {
    return resolved as ClinicThemeColor;
  }
  return DEFAULT_CLINIC_THEME_COLOR;
}

export function getThemeColorOption(id: string | undefined) {
  return CLINIC_THEME_COLORS.find((c) => c.value === normalizeClinicThemeColor(id)) ?? CLINIC_THEME_COLORS[0];
}
