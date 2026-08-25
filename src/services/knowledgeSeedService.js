const Clinic = require("../models/clinic");
const Knowledge = require("../models/knowledge");
const { getDefaultKnowledgePromptDefs } = require("../constants/defaultKnowledgePrompts");
const { rowMatchesClinic, parseClinicIds } = require("../utils/clinicIds");

async function seedDefaultKnowledgeForClinic(businessClinicId) {
  const clinicId = Number(businessClinicId);
  if (!Number.isFinite(clinicId) || clinicId <= 0) return 0;

  const defs = getDefaultKnowledgePromptDefs();
  let inserted = 0;
  for (const def of defs) {
    const existingRows = await Knowledge.findAll({
      where: { promptKey: def.promptKey }
    });
    const already = existingRows.find((row) => rowMatchesClinic(row, clinicId));
    if (already) continue;

    const reusable = existingRows.find(
      (row) => String(row.knowledge || "").trim() === String(def.knowledge || "").trim()
    );
    if (reusable) {
      const ids = parseClinicIds(reusable.clinicIds);
      if (!ids.includes(clinicId)) {
        await reusable.update({ clinicIds: [...ids, clinicId] });
      }
      continue;
    }

    await Knowledge.create({
      clinicIds: [clinicId],
      promptKey: def.promptKey,
      knowledge: def.knowledge,
      status: "active"
    });
    inserted += 1;
  }
  return inserted;
}

async function seedDefaultKnowledgeForAllClinics() {
  const clinics = await Clinic.findAll({
    attributes: ["clinicId"],
    where: {}
  });
  const seen = new Set();
  let inserted = 0;
  for (const row of clinics) {
    const clinicId = Number(row.clinicId);
    if (!Number.isFinite(clinicId) || clinicId <= 0 || seen.has(clinicId)) continue;
    seen.add(clinicId);
    inserted += await seedDefaultKnowledgeForClinic(clinicId);
  }
  if (inserted > 0) {
    console.log(`[knowledge] seeded ${inserted} default bot prompt(s)`);
  }
  return inserted;
}

module.exports = {
  seedDefaultKnowledgeForClinic,
  seedDefaultKnowledgeForAllClinics
};
