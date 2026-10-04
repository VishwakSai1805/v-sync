const router = require('express').Router();
const { Issue, IssueReport, User } = require('../models');
const { ah, ApiError } = require('../middleware/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const { upload, saveImage } = require('../middleware/upload');
const { findDuplicate, priorityForCount, extractKeywords } = require('../services/duplicateDetector');
const karma = require('../services/karma');
const { notify } = require('../services/notify');

router.use(requireAuth);

const DUP_WINDOW_DAYS = 30;
const populate = (q) =>
  q.populate('createdBy', 'name department')
    .populate('assignedTo', 'name department staffId')
    .populate('statusHistory.by', 'name role');

router.get('/meta', (req, res) => {
  res.json({ categories: Issue.CATEGORIES, statuses: Issue.STATUSES, priorities: Issue.PRIORITIES });
});

// GET /api/issues?status=&category=&priority=&building=&mine=true&assigned=me
router.get('/', ah(async (req, res) => {
  const { status, category, priority, building, mine, assigned, q } = req.query;
  const filter = {};
  if (status) filter.status = { $in: String(status).split(',') };
  if (category) filter.category = category;
  if (priority) filter.priority = priority;
  if (building) filter.building = new RegExp(`^${String(building).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  if (mine === 'true') filter.reporters = req.user._id;
  if (assigned === 'me') filter.assignedTo = req.user._id;
  if (assigned === 'none') filter.assignedTo = null;
  if (q) filter.title = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  // Maintenance staff only see tickets assigned to them.
  if (req.user.role === 'maintenance') filter.assignedTo = req.user._id;
  const issues = await populate(Issue.find(filter).sort({ updatedAt: -1 }).limit(300));
  res.json({ issues });
}));

router.get('/:id', ah(async (req, res) => {
  const issue = await populate(Issue.findById(req.params.id));
  if (!issue) throw new ApiError(404, 'Issue not found');
  const reports = await IssueReport.find({ issue: issue._id }).populate('reporter', 'name department').sort({ timestamp: 1 });
  res.json({ issue, reports });
}));

// Level-2 DFD 3.1 -> 3.2 -> (3.3 link | 3.4 create)
router.post('/', requireRole('student', 'faculty', 'warden'), upload.single('image'), ah(async (req, res) => {
  const { title, description = '', category, building, room = '' } = req.body;
  if (!title || !category || !building) throw new ApiError(400, 'title, category and building are required');
  if (!Issue.CATEGORIES.includes(category)) throw new ApiError(400, 'Invalid category');

  const since = new Date(Date.now() - DUP_WINDOW_DAYS * 86400000);
  const candidates = await Issue.find({ category, status: { $in: ['open', 'in_progress'] }, createdAt: { $gte: since } })
    .select('title description category building room keywords status reporters reportCount assignedTo')
    .lean();
  const { match, score, keywords } = findDuplicate({ title, description, category, building, room }, candidates);
  const image = await saveImage(req.file, req.user._id);

  if (match) {
    const already = (match.reporters || []).some((r) => r.toString() === req.user._id.toString());
    if (already) throw new ApiError(409, 'You have already reported this issue', { issueId: match._id });
    const issue = await Issue.findById(match._id);
    issue.reportCount += 1;
    issue.reporters.push(req.user._id);
    issue.priority = priorityForCount(issue.reportCount);
    if (!issue.image && image) issue.image = image;
    // Grow the ticket's keyword set so later reports match better.
    issue.keywords = [...new Set([...(issue.keywords || []), ...keywords])].slice(0, 40);
    await issue.save();
    await IssueReport.create({ reporter: req.user._id, issue: issue._id, title, description, category, building, room, image, isDuplicate: true, similarityScore: score });
    if (req.user.role === 'student') {
      await karma.applyRule(req.user._id, 'DUPLICATE_CONFIRMATION', { reason: `Confirmed issue "${issue.title}"`, refModel: 'Issue', refId: issue._id, silent: true });
    }
    if (issue.assignedTo) await notify(issue.assignedTo, `Ticket "${issue.title}" now has ${issue.reportCount} reports (priority ${issue.priority}).`, { type: 'issue', link: `/issues/${issue._id}` });
    return res.status(200).json({ duplicate: true, similarityScore: score, issue: await populate(Issue.findById(issue._id)) });
  }

  const location = room ? `${building} / ${room}` : building;
  const issue = await Issue.create({
    title, description, category, building, room, location, image,
    keywords: keywords.length ? keywords : extractKeywords(title),
    createdBy: req.user._id, reporters: [req.user._id], reportCount: 1, priority: 'low',
    statusHistory: [{ status: 'open', note: 'Reported', by: req.user._id }],
  });
  await IssueReport.create({ reporter: req.user._id, issue: issue._id, title, description, category, building, room, image, isDuplicate: false, similarityScore: score || null });
  if (req.user.role === 'student') {
    await karma.applyRule(req.user._id, 'VALID_ISSUE_REPORT', { reason: `Reported "${title}"`, refModel: 'Issue', refId: issue._id, silent: true });
  }
  const admins = await User.find({ role: 'admin', isActive: true }).select('_id');
  await Promise.all(admins.map((a) => notify(a._id, `New ${category} issue: "${title}" at ${location}`, { type: 'issue', link: `/issues/${issue._id}` })));
  res.status(201).json({ duplicate: false, issue: await populate(Issue.findById(issue._id)) });
}));

// Admin assigns (Level-2 DFD 3.5).
router.patch('/:id/assign', requireRole('admin'), ah(async (req, res) => {
  const issue = await Issue.findById(req.params.id);
  if (!issue) throw new ApiError(404, 'Issue not found');
  const staff = await User.findOne({ _id: req.body.staffId, role: 'maintenance' });
  if (!staff) throw new ApiError(400, 'Maintenance staff member not found');
  if (['resolved', 'rejected'].includes(issue.status)) throw new ApiError(409, `Issue is already ${issue.status}`);
  issue.assignedTo = staff._id;
  issue.statusHistory.push({ status: issue.status, note: `Assigned to ${staff.name}`, by: req.user._id });
  await issue.save();
  await notify(staff._id, `New assignment: "${issue.title}" at ${issue.location} (priority ${issue.priority}).`, { type: 'issue', link: `/issues/${issue._id}` });
  res.json({ issue: await populate(Issue.findById(issue._id)) });
}));

const TRANSITIONS = { open: ['in_progress', 'rejected'], in_progress: ['resolved', 'open'], resolved: [], rejected: [] };

// Status updates (Level-2 DFD 3.6 -> 3.7 notify reporters).
router.patch('/:id/status', requireRole('maintenance', 'admin'), ah(async (req, res) => {
  const { status, note = '' } = req.body;
  const issue = await Issue.findById(req.params.id);
  if (!issue) throw new ApiError(404, 'Issue not found');
  if (req.user.role === 'maintenance' && (!issue.assignedTo || issue.assignedTo.toString() !== req.user._id.toString())) {
    throw new ApiError(403, 'This ticket is not assigned to you');
  }
  if (status === 'rejected' && req.user.role !== 'admin') throw new ApiError(403, 'Only admins can reject a ticket');
  if (!(TRANSITIONS[issue.status] || []).includes(status)) throw new ApiError(409, `Cannot move from ${issue.status} to ${status}`);
  issue.status = status;
  issue.statusHistory.push({ status, note, by: req.user._id });
  if (status === 'resolved') {
    issue.resolvedAt = new Date();
    issue.resolutionNotes = note;
  }
  await issue.save();

  const label = { in_progress: 'is being worked on', resolved: 'has been resolved', open: 'was reopened', rejected: 'was rejected as invalid' }[status];
  await Promise.all(issue.reporters.map((u) => notify(u, `Issue "${issue.title}" ${label}.${note ? ` Note: ${note}` : ''}`, { type: 'issue', link: `/issues/${issue._id}` })));
  if (status === 'resolved') {
    await karma.applyRule(issue.createdBy, 'ISSUE_RESOLVED_BONUS', { reason: `Your report "${issue.title}" was resolved`, refModel: 'Issue', refId: issue._id });
  }
  if (status === 'rejected') {
    await karma.applyRule(issue.createdBy, 'INVALID_ISSUE_REPORT', { reason: `Report "${issue.title}" rejected as invalid`, refModel: 'Issue', refId: issue._id });
  }
  res.json({ issue: await populate(Issue.findById(issue._id)) });
}));

module.exports = router;
