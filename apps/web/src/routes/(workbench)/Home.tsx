import { NavLink, Navigate, Route, Routes } from 'react-router';
import Grievances from './Grievances';
import OverrideRate from './OverrideRate';
import Queue from './Queue';
import TicketView from './TicketView';

/** Staff_Workbench routes, mounted at `/workbench/*`. */
export default function WorkbenchHome() {
  return (
    <>
      <div className="cc-subnav-bar">
        <div className="cc-subnav-inner" role="navigation" aria-label="Workbench Navigation">
          <NavLink
            to="/workbench"
            end
            className={({ isActive }) => `cc-subnav-link ${isActive ? 'active' : ''}`}
          >
            <span>📥</span> Triage Queue
          </NavLink>
          <NavLink
            to="/workbench/grievances"
            className={({ isActive }) => `cc-subnav-link ${isActive ? 'active' : ''}`}
          >
            <span>⚖️</span> L3 Grievance Committee
          </NavLink>
          <NavLink
            to="/workbench/ai-overrides"
            className={({ isActive }) => `cc-subnav-link ${isActive ? 'active' : ''}`}
          >
            <span>📈</span> AI Calibration & Overrides
          </NavLink>
        </div>
      </div>

      <Routes>
        <Route index element={<Queue />} />
        <Route path="tickets/:id" element={<TicketView />} />
        <Route path="grievances" element={<Grievances />} />
        <Route path="ai-overrides" element={<OverrideRate />} />
        <Route path="*" element={<Navigate to="/workbench" replace />} />
      </Routes>
    </>
  );
}
