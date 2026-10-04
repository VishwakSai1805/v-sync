// Trust & Rating algorithm (P2P Resource Library).
//
// trustScore (0-100) blends two signals, with a Bayesian prior so a brand-new
// user starts at a neutral 50 instead of swinging wildly on their first rating:
//
//   ratingComponent  = (ratingSum*20 + PRIOR_SCORE*PRIOR_WEIGHT) / (ratingCount + PRIOR_WEIGHT)
//                      (each 1-5 star rating mapped to 20-100)
//   punctuality      = (onTime + PRIOR_WEIGHT*0.5) / (onTime + late + PRIOR_WEIGHT)   -> 0..1
//
//   trustScore = round( 0.7 * ratingComponent + 0.3 * punctuality*100 )
//
// Lenders see the borrower's trustScore before approving a loan.

const PRIOR_SCORE = 50;
const PRIOR_WEIGHT = 3;

function computeTrustScore({ ratingSum = 0, ratingCount = 0, onTimeReturns = 0, lateReturns = 0 }) {
  const ratingComponent = (ratingSum * 20 + PRIOR_SCORE * PRIOR_WEIGHT) / (ratingCount + PRIOR_WEIGHT);
  const punctuality = (onTimeReturns + PRIOR_WEIGHT * 0.5) / (onTimeReturns + lateReturns + PRIOR_WEIGHT);
  const score = 0.7 * ratingComponent + 0.3 * punctuality * 100;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Apply a completed loan's outcome to the borrower document (mutates, caller saves). */
function applyLoanOutcome(user, { rating, onTime }) {
  if (rating) {
    user.ratingSum += rating;
    user.ratingCount += 1;
  }
  if (onTime) user.onTimeReturns += 1;
  else user.lateReturns += 1;
  user.trustScore = computeTrustScore(user);
  return user.trustScore;
}

module.exports = { computeTrustScore, applyLoanOutcome, PRIOR_SCORE, PRIOR_WEIGHT };
