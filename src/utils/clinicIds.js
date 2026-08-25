/**
 * Parse / serialize clinic_ids for knowledge rows (JSON array of business clinic ids).
 */

function parseClinicIds(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  }
  if (value == null || value === "") return [];
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? [value] : [];
  }
  const text = String(value).trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return [...new Set(parsed.map(Number).filter((n) => Number.isFinite(n) && n > 0))];
    }
  } catch {
    // fall through
  }
  return [
    ...new Set(
      text
        .split(/[,\s]+/)
        .map((part) => Number(part))
        .filter((n) => Number.isFinite(n) && n > 0)
    )
  ];
}

function serializeClinicIds(ids) {
  return JSON.stringify(parseClinicIds(ids));
}

function rowMatchesClinic(row, businessClinicId) {
  const id = Number(businessClinicId);
  if (!Number.isFinite(id) || id <= 0) return false;
  const raw = row.getDataValue?.("clinicIds") ?? row.clinicIds;
  return parseClinicIds(raw).includes(id);
}

module.exports = {
  parseClinicIds,
  serializeClinicIds,
  rowMatchesClinic
};
