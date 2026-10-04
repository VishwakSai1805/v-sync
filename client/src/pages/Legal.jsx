import { Link } from 'react-router-dom';

const UPDATED = '5 October 2026';

function LegalPage({ title, children }) {
  return (
    <div className="min-h-full bg-slate-50 px-4 py-10">
      <article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <Link to="/" className="mb-6 flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <span className="font-bold text-slate-900">V-Sync</span>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">Last updated {UPDATED}</p>
        <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-slate-700 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_li]:ml-5 [&_li]:list-disc">
          {children}
        </div>
        <p className="mt-10 border-t border-slate-100 pt-4 text-sm text-slate-500">
          <Link to="/privacy" className="text-indigo-600 hover:underline">Privacy Policy</Link> ·{' '}
          <Link to="/terms" className="text-indigo-600 hover:underline">Terms of Use</Link> ·{' '}
          <Link to="/" className="text-indigo-600 hover:underline">Back to V-Sync</Link>
        </p>
      </article>
    </div>
  );
}

export function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        V-Sync is a campus resource-sharing and maintenance-reporting platform built by Group 21 (Gudivada Vishwak Sai,
        Suyash Singh, Pratik Tekriwal) as an academic project for the Software Engineering Lab (BCSE301P) at VIT. This
        policy explains what data V-Sync collects and how it is used.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li><b>From Google Sign-In:</b> your name, email address and profile picture. We request only the basic
          <code className="mx-1 rounded bg-slate-100 px-1">openid</code>,
          <code className="mx-1 rounded bg-slate-100 px-1">email</code> and
          <code className="mx-1 rounded bg-slate-100 px-1">profile</code> scopes. We never receive your Google password and
          cannot read your Gmail, Drive or any other Google data.</li>
        <li><b>Details you add:</b> registration number, department, year of study and hostel block.</li>
        <li><b>Activity in the app:</b> items you list or borrow, facility bookings and check-ins, issue reports and any
          photos you attach, access requests, ratings, and your karma points history.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To sign you in and confirm you belong to the VIT community (only VIT Google Workspace accounts are accepted).</li>
        <li>To run the platform's features: lending, bookings, maintenance tickets, approvals, karma and trust scores.</li>
        <li>To show other signed-in campus users the information needed for those features, for example your name, photo,
          registration number and trust score when you request to borrow an item. Your karma balance appears on the
          campus leaderboard.</li>
        <li>Your email address and hostel block are visible only to you, administrators, and the Faculty Proctor and
          Hostel Warden reviewing an access request you submit. Your karma transaction history is visible only to you
          and administrators.</li>
      </ul>

      <h2>What we do not do</h2>
      <ul>
        <li>We do not sell, rent or share your data with advertisers or any third party.</li>
        <li>We do not use your data for advertising or profiling outside the platform.</li>
      </ul>

      <h2>Storage and security</h2>
      <p>
        Data is stored in a MongoDB Atlas database and served by an API hosted on Render; the web app is hosted on Vercel.
        Connections use HTTPS, sign-in tokens are verified on the server, and access to each feature is limited by role.
      </p>

      <h2>Retention and your choices</h2>
      <p>
        You can view and edit your details on your profile page at any time. To have your account and data deleted,
        contact the project team at the address below. As an academic project, the service and its data may be removed
        after the course concludes.
      </p>

      <h2>Contact</h2>
      <p>Questions about this policy: contact the Group 21 project team via the repository at{' '}
        <a href="https://github.com/VishwakSai1805/v-sync" className="text-indigo-600 hover:underline">github.com/VishwakSai1805/v-sync</a>.
      </p>
    </LegalPage>
  );
}

export function Terms() {
  return (
    <LegalPage title="Terms of Use">
      <p>
        V-Sync is an academic project created for the Software Engineering Lab (BCSE301P) at VIT. By signing in, you agree
        to the following terms.
      </p>
      <h2>Eligibility</h2>
      <p>V-Sync is for members of the VIT community with a valid institutional Google account.</p>
      <h2>Acceptable use</h2>
      <ul>
        <li>Report genuine campus issues only; spam or false reports may be rejected and cost karma.</li>
        <li>Return borrowed items on time and in the condition you received them.</li>
        <li>Honour facility bookings or cancel them in advance; no-shows are penalised automatically.</li>
        <li>Do not attempt to access other users' accounts or roles you were not assigned.</li>
      </ul>
      <h2>Peer-to-peer lending</h2>
      <p>
        Items listed in the P2P Library belong to the students who list them. V-Sync only helps arrange the loan and does
        not take responsibility for loss of, or damage to, lent items. Arrangements are between the lender and borrower.
      </p>
      <h2>Karma and trust scores</h2>
      <p>Karma points and trust scores are in-app indicators with no monetary value and may be adjusted by administrators.</p>
      <h2>No warranty</h2>
      <p>
        As an academic project, V-Sync is provided "as is", without guarantees of availability or fitness for any
        particular purpose. It may be changed or discontinued at any time.
      </p>
    </LegalPage>
  );
}
