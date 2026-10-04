const { KarmaWallet, KarmaTransaction, PenaltyRule } = require('../models');
const config = require('../config');
const { DEFAULT_RULES } = require('./rules');
const { notify } = require('./notify');

// Pure state-transition function for wallet standing (Karma Wallet state diagram).
function nextWalletStatus(current, balance, delta) {
  if (balance <= 0) return 'restricted';
  if (delta < 0) return 'penalty_applied';
  // Earning points (or positive adjustment) clears a penalty / restriction once balance > 0.
  if (delta > 0) return 'active';
  return current;
}

async function ensureDefaultRules() {
  for (const rule of DEFAULT_RULES) {
    await PenaltyRule.updateOne({ code: rule.code }, { $setOnInsert: rule }, { upsert: true });
  }
}

async function getRule(code) {
  const rule = await PenaltyRule.findOne({ code });
  if (rule) return rule;
  const def = DEFAULT_RULES.find((r) => r.code === code);
  return def ? { ...def, active: true } : null;
}

async function createWallet(userId) {
  const existing = await KarmaWallet.findOne({ user: userId });
  if (existing) return existing;
  const start = config.karma.startingBalance;
  const wallet = await KarmaWallet.create({ user: userId, balance: start, totalEarned: start });
  await KarmaTransaction.create({
    wallet: wallet._id, user: userId, points: start, type: 'earn',
    ruleCode: 'WELCOME_BONUS', reason: 'Welcome bonus', balanceAfter: start,
  });
  return wallet;
}

async function getWallet(userId) {
  return (await KarmaWallet.findOne({ user: userId })) || createWallet(userId);
}

/**
 * Apply a signed change to a wallet and write the ledger row.
 * Uses an atomic $inc so concurrent sweeps/requests cannot lose updates.
 */
async function applyDelta(userId, delta, { type, ruleCode = null, reason = '', refModel = null, refId = null }) {
  await getWallet(userId); // make sure it exists
  const inc = { balance: delta };
  if (delta > 0) inc.totalEarned = delta;
  if (delta < 0) inc.totalDeducted = -delta;
  const wallet = await KarmaWallet.findOneAndUpdate({ user: userId }, { $inc: inc }, { returnDocument: 'after' });
  const status = nextWalletStatus(wallet.status, wallet.balance, delta);
  if (status !== wallet.status) {
    wallet.status = status;
    await wallet.save();
  }
  const tx = await KarmaTransaction.create({
    wallet: wallet._id, user: userId, points: delta, type, ruleCode, reason, refModel, refId,
    balanceAfter: wallet.balance,
  });
  return { wallet, tx };
}

/**
 * Fire a rule from PENALTY_RULE for a user. Idempotent per (user, rule, refId):
 * the same reservation can never be penalised twice.
 */
async function applyRule(userId, code, { reason, refModel = null, refId = null, silent = false } = {}) {
  const rule = await getRule(code);
  if (!rule || rule.active === false || !rule.points) return null;
  if (refId) {
    const dup = await KarmaTransaction.findOne({ user: userId, ruleCode: code, refId });
    if (dup) return null;
  }
  const delta = rule.penaltyType === 'deduct' ? -rule.points : rule.points;
  const result = await applyDelta(userId, delta, {
    type: rule.penaltyType, ruleCode: code, reason: reason || rule.description, refModel, refId,
  });
  if (!silent) {
    const verb = delta > 0 ? `+${delta}` : `${delta}`;
    let msg = `${verb} karma: ${reason || rule.description}`;
    if (result.wallet.status === 'restricted') msg += ' Your account is now RESTRICTED until your balance is positive.';
    await notify(userId, msg, { type: 'karma', link: '/karma' });
  }
  return result;
}

async function adjust(userId, points, reason, adminId) {
  return applyDelta(userId, points, { type: 'adjust', ruleCode: 'ADMIN_ADJUST', reason: reason || 'Admin adjustment', refModel: 'User', refId: adminId });
}

async function isRestricted(userId) {
  const wallet = await getWallet(userId);
  return wallet.status === 'restricted';
}

module.exports = { nextWalletStatus, ensureDefaultRules, getRule, createWallet, getWallet, applyRule, applyDelta, adjust, isRestricted };
