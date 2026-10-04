const cron = require('node-cron');
const { Reservation, Loan } = require('../models');
const karma = require('../services/karma');
const { notify } = require('../services/notify');

// ANTI-GHOSTING: a confirmed reservation whose start time + grace period has
// passed without a check-in is auto-cancelled ("ghosted") and the student is
// penalised via the GHOST_RESERVATION rule. Also auto-completes in-use bookings
// that were never checked out, and marks overdue loans.
async function sweepGhostedReservations(now = new Date()) {
  const rule = await karma.getRule('GHOST_RESERVATION');
  const graceMs = (rule ? rule.gracePeriod : 10) * 60000;
  const deadline = new Date(now.getTime() - graceMs);
  const ghosts = await Reservation.find({ status: 'confirmed', checkInTime: null, startTime: { $lte: deadline } }).populate('resource', 'name');
  let count = 0;
  for (const r of ghosts) {
    // Conditional update guards against a concurrent check-in racing the sweep.
    const upd = await Reservation.updateOne({ _id: r._id, status: 'confirmed' }, { $set: { status: 'ghosted', penaltyApplied: true } });
    if (!upd.modifiedCount) continue;
    count += 1;
    await karma.applyRule(r.user, 'GHOST_RESERVATION', {
      reason: `No-show for ${r.resource ? r.resource.name : 'a reservation'} (${r.startTime.toLocaleString('en-IN')})`,
      refModel: 'Reservation', refId: r._id,
    });
  }
  return count;
}

async function sweepUnclosedReservations(now = new Date()) {
  const stale = await Reservation.find({ status: 'in_use', endTime: { $lte: new Date(now.getTime() - 30 * 60000) } });
  for (const r of stale) {
    r.status = 'completed';
    r.checkOutTime = r.endTime;
    await r.save();
  }
  return stale.length;
}

async function sweepOverdueLoans(now = new Date()) {
  const late = await Loan.find({ status: 'borrowed', dueDate: { $lt: now } }).populate('resource', 'name');
  for (const loan of late) {
    loan.status = 'overdue';
    loan.overduePenaltyApplied = true;
    await loan.save();
    await karma.applyRule(loan.borrower, 'LATE_RETURN', { reason: `"${loan.resource.name}" is overdue`, refModel: 'Loan', refId: loan._id });
    await notify(loan.lender, `"${loan.resource.name}" is overdue — the borrower has been penalised.`, { type: 'loan', link: '/library?tab=lending' });
  }
  return late.length;
}

async function runAllSweeps(now = new Date()) {
  const ghosted = await sweepGhostedReservations(now);
  const autoCompleted = await sweepUnclosedReservations(now);
  const overdue = await sweepOverdueLoans(now);
  return { ghosted, autoCompleted, overdue, ranAt: now };
}

let task = null;
let running = false;
function startScheduler() {
  if (task) return task;
  task = cron.schedule('* * * * *', async () => {
    if (running) return;
    running = true;
    try {
      const r = await runAllSweeps();
      if (r.ghosted || r.overdue || r.autoCompleted) console.log('[sweeps]', r);
    } catch (err) {
      console.error('[sweeps] failed', err.message);
    } finally {
      running = false;
    }
  });
  return task;
}

module.exports = { sweepGhostedReservations, sweepUnclosedReservations, sweepOverdueLoans, runAllSweeps, startScheduler };
