import { Route, Routes } from 'react-router';
import { RequireRole } from './auth/RequireGroup';
import { AcademicSectionView } from './components/AcademicSectionView';
import AdminDashboard from './routes/(admin)/AdminDashboard';
import StaffDashboard from './routes/(staff)/StaffDashboard';
import StudentDashboard from './routes/(student)/StudentDashboard';
import LandingPage from './routes/LandingPage';
import SignIn from './routes/SignIn';
import SignUp from './routes/SignUp';
import ProfilePage from './routes/ProfilePage';
import SettingsPage from './routes/SettingsPage';
import NotFoundPage from './routes/NotFoundPage';
import { AppLayout } from './shell/AppLayout';

export function App() {
  return (
    <Routes>
      {/* =========================================================================
          1. Public Landing & Authentication Routes
          ========================================================================= */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<SignIn />} />
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/signup" element={<SignUp />} />

      {/* =========================================================================
          2. Administrator Command Center (/admin, /portal/admin)
             Restricted to: 'admin'
          ========================================================================= */}
      <Route element={<RequireRole allowedRoles={['admin']} />}>
        <Route element={<AppLayout />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/portal/admin" element={<AdminDashboard />} />
          <Route path="/admin/*" element={<AdminDashboard />} />
          <Route path="/portal/admin/*" element={<AdminDashboard />} />
        </Route>
      </Route>

      {/* =========================================================================
          3. Staff Resolution Workspace (/staff, /worker, /portal/staff)
             Restricted to: 'worker' (staff), 'admin'
             Note: Full migration from former "worker" nomenclature to "staff"
          ========================================================================= */}
      <Route element={<RequireRole allowedRoles={['worker', 'admin']} />}>
        <Route element={<AppLayout />}>
          <Route path="/staff" element={<StaffDashboard />} />
          <Route path="/worker" element={<StaffDashboard />} />
          <Route path="/portal/staff" element={<StaffDashboard />} />
          <Route path="/staff/*" element={<StaffDashboard />} />
          <Route path="/worker/*" element={<StaffDashboard />} />
          <Route path="/portal/staff/*" element={<StaffDashboard />} />
        </Route>
      </Route>

      {/* =========================================================================
          4. Student Portal & Academic Records (/student, /portal/student)
             Restricted to: 'student', 'admin'
          ========================================================================= */}
      <Route element={<RequireRole allowedRoles={['student', 'admin']} />}>
        <Route element={<AppLayout />}>
          <Route path="/student" element={<StudentDashboard />} />
          <Route path="/portal/student" element={<StudentDashboard />} />
          <Route path="/portal/student/ac" element={<AcademicSectionView />} />
          <Route path="/student/*" element={<StudentDashboard />} />
          <Route path="/portal/student/*" element={<StudentDashboard />} />
        </Route>
      </Route>

      {/* =========================================================================
          5. Shared Authenticated Suite (/profile, /settings)
             Accessible to all authenticated roles: 'student', 'worker', 'admin'
          ========================================================================= */}
      <Route element={<RequireRole allowedRoles={['student', 'worker', 'admin']} />}>
        <Route element={<AppLayout />}>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      {/* =========================================================================
          6. Dedicated macOS Liquid Glass 404 Fallback Route
             Replacing former silent redirect (<Navigate to="/" replace />)
          ========================================================================= */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
