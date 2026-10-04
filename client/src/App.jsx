import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import { Login, Register } from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Library from './pages/Library';
import Facilities from './pages/Facilities';
import Issues from './pages/Issues';
import IssueDetail from './pages/IssueDetail';
import Karma from './pages/Karma';
import Approvals from './pages/Approvals';
import { AdminUsers, AdminRules } from './pages/Admin';
import { MyProfile, PublicProfile } from './pages/Profile';

function Guard({ roles, children }) {
  const { user } = useAuth();
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner className="h-full items-center" />;

  if (!user) {
    return (
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="library" element={<Guard roles={['student']}><Library /></Guard>} />
        <Route path="facilities" element={<Guard roles={['student', 'admin', 'warden']}><Facilities /></Guard>} />
        <Route path="issues" element={<Issues />} />
        <Route path="issues/:id" element={<IssueDetail />} />
        <Route path="karma" element={<Guard roles={['student']}><Karma /></Guard>} />
        <Route path="approvals" element={<Guard roles={['student', 'faculty', 'warden', 'admin']}><Approvals /></Guard>} />
        <Route path="profile" element={<MyProfile />} />
        <Route path="users/:id" element={<PublicProfile />} />
        <Route path="admin/users" element={<Guard roles={['admin']}><AdminUsers /></Guard>} />
        <Route path="admin/rules" element={<Guard roles={['admin']}><AdminRules /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
