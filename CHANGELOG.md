# Changelog

All notable changes to V-Sync are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-05

First production release, deployed at **https://v-sync-website.vercel.app**.

### Functional modules
- **M1 · P2P Campus Resource Library**: students list personal academic gear. Loan lifecycle: requested → approved → borrowed → returned / overdue. **Trust & Rating algorithm**: Bayesian-smoothed 70% lender rating + 30% on-time return rate.
- **M2 · Smart Civic Issue Tracker**: issue reports with photos. The **Duplicate Detection Engine** (category filter + location score + Jaccard keyword similarity, threshold 0.6) merges reports into master tickets, and priority escalates with report count. Admin assigns tickets; maintenance staff resolve them; every reporter is notified.
- **M3 · Campus Karma Wallet**: append-only points ledger with an active → penalty_applied → restricted standing state machine. Every point value is in an admin-editable `PenaltyRule` table.
- **M4 · Anti-Ghosting Mechanics**: check-in windows on facility bookings. A per-minute scheduler auto-cancels no-shows (idempotent penalty) and marks overdue loans.
- **M5 · Multi-Tier Approval Workflow**: restricted facilities route Faculty Proctor → Hostel Warden; final approval auto-creates the reservation.

### Platform
- **Google Sign-In (OpenID Connect)** restricted to VIT Google Workspace accounts, verified server-side (signature, audience, expiry, `hd` claim).
  - Students are auto-provisioned on first sign-in; staff roles are admin-provisioned.
  - It uses the redirect flow with `state` + `nonce`, so ad blockers can't break it.
- Role-based access control across 5 roles: Student, Faculty Proctor, Hostel Warden, Maintenance Staff, Admin.
- User profiles with Google photo, academic details, trust breakdown and activity stats.
- In-app notifications, karma leaderboard, admin Reports & Analytics dashboard.
- Public Privacy Policy and Terms of Use pages.
- Demo role accounts for evaluation, switchable off with `ENABLE_PASSWORD_LOGIN=false`.

### Engineering
- MERN stack: React 18 + Vite + Tailwind CSS 4, Node.js 22 + Express 5, MongoDB Atlas (Mongoose 9).
- 47 automated tests: unit tests for the algorithms and state machines, plus API integration tests for all five modules and every Google sign-in rule.
- GitHub Actions CI runs the full suite against a real MongoDB 7 and builds the frontend on every push.
- Deployed on MongoDB Atlas (database), Render (API, `render.yaml` blueprint) and Vercel (frontend).

[1.0.0]: https://github.com/VishwakSai1805/v-sync/releases/tag/v1.0.0
