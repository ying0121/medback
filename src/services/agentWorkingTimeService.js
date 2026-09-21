/**
 * Aggregate agent working time from inbound calls + campaign call histories.
 */

const { Op } = require("sequelize");
const { Call, Campaign, CampaignCallHistory } = require("../db");

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function startOfPeriod(period) {
  const now = new Date();
  if (period === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === "7d") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  if (period === "30d") {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  return null;
}

async function sumInboundSeconds(agentId, since) {
  const where = { agentId: Number(agentId) };
  if (since) where.createdAt = { [Op.gte]: since };
  const rows = await Call.findAll({
    where,
    attributes: ["seconds"]
  });
  return rows.reduce((sum, r) => sum + toInt(r.seconds), 0);
}

async function sumCampaignSeconds(agentId, since) {
  const campaigns = await Campaign.findAll({
    where: { agentId: Number(agentId) },
    attributes: ["id"]
  });
  const campaignIds = campaigns.map((c) => c.id).filter(Boolean);
  if (!campaignIds.length) return 0;

  const where = { campaignId: { [Op.in]: campaignIds } };
  if (since) where.createdAt = { [Op.gte]: since };

  const rows = await CampaignCallHistory.findAll({
    where,
    attributes: ["durationSeconds"]
  });

  return rows.reduce((sum, r) => sum + toInt(r.durationSeconds), 0);
}

async function getAgentWorkingTime(agentId, { period = "all" } = {}) {
  const id = Number(agentId);
  if (!id) {
    return {
      agentId: null,
      inboundSeconds: 0,
      campaignSeconds: 0,
      totalSeconds: 0,
      period
    };
  }
  const since = startOfPeriod(period);
  const [inboundSeconds, campaignSeconds] = await Promise.all([
    sumInboundSeconds(id, since),
    sumCampaignSeconds(id, since)
  ]);
  return {
    agentId: String(id),
    inboundSeconds,
    campaignSeconds,
    totalSeconds: inboundSeconds + campaignSeconds,
    period
  };
}

async function getWorkingTimeMap(agentIds, { period = "all" } = {}) {
  const ids = [...new Set((agentIds || []).map(Number).filter(Boolean))];
  const map = {};
  await Promise.all(
    ids.map(async (id) => {
      map[String(id)] = await getAgentWorkingTime(id, { period });
    })
  );
  return map;
}

module.exports = {
  getAgentWorkingTime,
  getWorkingTimeMap
};
