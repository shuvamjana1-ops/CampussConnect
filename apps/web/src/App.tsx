import { Navigate, Route, Routes } from 'react-router';
import { RequireRole } from './auth/RequireGroup';
import { AcademicSectionView } from './components/AcademicSectionView';
import AdminDashboard from './routes/(admin)/AdminDashboard';
import WorkerDashboard from './routes/(staff)/WorkerDashboard';
import StudentDashboard from './routes/(student)/StudentDashboard';
import LandingPage from './routes/LandingPage';
import SignIn from './routes/SignIn';
import { AppLayout } from './shell/AppLayout';

export function App() {
  return (
    <Routes>
      {/* Public Landing & Authentication */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<SignIn />} />
      <Route path="/sign-in" element={<SignIn />} />

      {/* 1. Administrator Dashboard & Command Center (/admin, /portal/admin) */}
      <Route element={<RequireRole allowedRoles={['admin']} />}>
        <Route element={<AppLayout />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/portal/admin" element={<AdminDashboard />} />
          <Route path="/admin/*" element={<AdminDashboard />} />
          <Route path="/portal/admin/*" element={<AdminDashboard />} />
        </Route>
      </Route>

      {/* 2. Worker / Staff Dashboard (/worker, /portal/staff) */}
      <Route element={<RequireRole allowedRoles={['worker', 'admin']} />}>
        <Route element={<AppLayout />}>
          <Route path="/worker" element={<WorkerDashboard />} />
          <Route path="/portal/staff" element={<WorkerDashboard />} />
          <Route path="/worker/*" element={<WorkerDashboard />} />
          <Route path="/portal/staff/*" element={<WorkerDashboard />} />
        </Route>
      </Route>

      {/* 3. Student Portal Dashboard (/student, /portal/student) */}
      <Route element={<RequireRole allowedRoles={['student', 'admin']} />}>
        <Route element={<AppLayout />}>
          <Route path="/student" element={<StudentDashboard />} />
          <Route path="/portal/student" element={<StudentDashboard />} />
          <Route path="/portal/student/ac" element={<AcademicSectionView />} />
          <Route path="/student/*" element={<StudentDashboard />} />
          <Route path="/portal/student/*" element={<StudentDashboard />} />
        </Route>
      </Route>

      {/* Fallback to Landing */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
