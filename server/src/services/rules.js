// Default karma economy. Seeded into PENALTY_RULE on startup if missing;
// Admin can change points/grace periods later from the dashboard.
const DEFAULT_RULES = [
  { code: 'GHOST_RESERVATION', penaltyType: 'deduct', points: 20, gracePeriod: 10,
    description: 'No check-in within the grace period after a reservation starts (Anti-Ghosting).' },
  { code: 'LATE_CANCELLATION', penaltyType: 'deduct', points: 5, gracePeriod: 60,
    description: 'Cancelling a confirmed reservation less than gracePeriod minutes before it starts.' },
  { code: 'LATE_RETURN', penaltyType: 'deduct', points: 15, gracePeriod: 0,
    description: 'A borrowed item passes its due date without being returned.' },
  { code: 'LEND_ITEM', penaltyType: 'earn', points: 10, gracePeriod: 0,
    description: 'Lender earns karma when a loan is completed (item returned).' },
  { code: 'ON_TIME_RETURN', penaltyType: 'earn', points: 3, gracePeriod: 0,
    description: 'Borrower returns an item on or before the due date.' },
  { code: 'VALID_ISSUE_REPORT', penaltyType: 'earn', points: 5, gracePeriod: 0,
    description: 'Reporting a new civic issue that becomes a master ticket.' },
  { code: 'DUPLICATE_CONFIRMATION', penaltyType: 'earn', points: 1, gracePeriod: 0,
    description: 'Confirming an existing issue (report merged into a master ticket).' },
  { code: 'ISSUE_RESOLVED_BONUS', penaltyType: 'earn', points: 5, gracePeriod: 0,
    description: 'Original reporter bonus when their ticket is resolved.' },
  { code: 'COMPLETED_RESERVATION', penaltyType: 'earn', points: 2, gracePeriod: 0,
    description: 'Checking in and out of a reservation properly.' },
  { code: 'INVALID_ISSUE_REPORT', penaltyType: 'deduct', points: 5, gracePeriod: 0,
    description: 'Admin rejects a report as spam / invalid.' },
];

module.exports = { DEFAULT_RULES };
