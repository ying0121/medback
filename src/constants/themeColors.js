/**
 * Chat frontend theme tokens (`themeColor` on Socket.IO connect).
 * Each id maps to a primary → accent gradient on the client.
 */
const THEME_COLOR_OPTIONS = [
  { id: "azure", from: "#0DA2E7", to: "#21CAB9" },
  { id: "blue", from: "#2474F5", to: "#0DA2E7" },
  { id: "sky", from: "#0DA2E7", to: "#1DD8ED" },
  { id: "cyan", from: "#12CAE2", to: "#21CAB9" },
  { id: "teal", from: "#21CAB9", to: "#20B684" },
  { id: "emerald", from: "#11C589", to: "#18B451" },
  { id: "green", from: "#21C45D", to: "#24A824" },
  { id: "lime", from: "#82CB15", to: "#98B620" },
  { id: "yellow", from: "#FACC14", to: "#F59F0A" },
  { id: "amber", from: "#F59F0A", to: "#F97415" },
  { id: "orange", from: "#F97415", to: "#F59F0A" },
  { id: "red", from: "#EF4343", to: "#E63754" },
  { id: "rose", from: "#E63754", to: "#E44494" },
  { id: "pink", from: "#E44494", to: "#DF49C6" },
  { id: "purple", from: "#9449DF", to: "#C24EDA" },
  { id: "violet", from: "#7444E4", to: "#9449DF" }
];

const ALLOWED_THEME_COLORS = THEME_COLOR_OPTIONS.map((o) => o.id);

const DEFAULT_THEME_COLOR = "azure";

/** Legacy id from earlier releases. */
const LEGACY_THEME_COLOR_ALIASES = {
  "dark-blue": "azure",
  "dark-mode": "azure"
};

function normalizeThemeColor(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  const resolved = LEGACY_THEME_COLOR_ALIASES[normalized] || normalized;
  if (ALLOWED_THEME_COLORS.includes(resolved)) {
    return resolved;
  }
  return DEFAULT_THEME_COLOR;
}

module.exports = {
  THEME_COLOR_OPTIONS,
  ALLOWED_THEME_COLORS,
  DEFAULT_THEME_COLOR,
  normalizeThemeColor
};
