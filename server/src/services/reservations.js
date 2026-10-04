const { Reservation, Resource } = require('../models');
const { ApiError } = require('../middleware/errors');

const MAX_HOURS = 4;

function validateWindow(start, end) {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new ApiError(400, 'Invalid start/end time');
  if (end <= start) throw new ApiError(400, 'endTime must be after startTime');
  if (start < new Date(Date.now() - 5 * 60 * 1000)) throw new ApiError(400, 'startTime cannot be in the past');
  if (end - start > MAX_HOURS * 3600 * 1000) throw new ApiError(400, `Maximum booking length is ${MAX_HOURS} hours`);
}

// Two intervals overlap when a.start < b.end && b.start < a.end.
async function countOverlaps(resourceId, start, end, excludeId) {
  const filter = {
    resource: resourceId,
    status: { $in: ['requested', 'confirmed', 'in_use'] },
    startTime: { $lt: end },
    endTime: { $gt: start },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return Reservation.countDocuments(filter);
}

async function assertSlotFree(resource, start, end, excludeId) {
  const overlaps = await countOverlaps(resource._id, start, end, excludeId);
  if (overlaps >= (resource.capacity || 1)) throw new ApiError(409, 'That time slot is already fully booked');
}

/** Create a confirmed reservation (used directly and by the approval workflow). */
async function createConfirmed({ resourceId, userId, start, end, purpose, approvalRequest = null }) {
  const resource = await Resource.findById(resourceId);
  if (!resource || resource.kind !== 'facility') throw new ApiError(404, 'Facility not found');
  if (resource.availabilityStatus === 'unavailable') throw new ApiError(409, 'Facility is unavailable');
  await assertSlotFree(resource, start, end);
  return Reservation.create({ resource: resource._id, user: userId, startTime: start, endTime: end, status: 'confirmed', purpose, approvalRequest });
}

module.exports = { validateWindow, assertSlotFree, createConfirmed, countOverlaps, MAX_HOURS };
