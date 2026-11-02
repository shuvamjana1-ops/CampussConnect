import { NavLink, Navigate, Route, Routes } from 'react-router';
import ExecutiveOverview from './ExecutiveOverview';
import ReportSchedulesPage from './ReportSchedulesPage';

/** Dept_Head and Executive area mounted at `/exec/*`. */
export default function ExecHome() {
  return (
    <>
      <div className="cc-subnav-bar">
        <div className="cc-subnav-inner" role="navigation" aria-label="Executive Navigation">
          <NavLink
            to="/exec/overview"
            className={({ isActive }) => `cc-subnav-link ${isActive ? 'active' : ''}`}
          >
            <span>📊</span> Operations Overview
          </NavLink>
          <NavLink
            to="/exec/reports"
            className={({ isActive }) => `cc-subnav-link ${isActive ? 'active' : ''}`}
          >
            <span>📑</span> Scheduled Reports & Compliance
          </NavLink>
        </div>
      </div>

      <Routes>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<ExecutiveOverview />} />
        <Route path="reports" element={<ReportSchedulesPage />} />
        <Route path="*" element={<Navigate to="overview" replace />} />
      </Routes>
    </>
  );
}
