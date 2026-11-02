import { NavLink, Navigate, Route, Routes } from 'react-router';
import { OfflineIndicator } from '../../pwa/OfflineIndicator';
import CampusHelp from './CampusHelp';
import Notifications from './Notifications';
import Opportunities from './Opportunities';
import Privacy from './Privacy';
import Profile from './Profile';
import StudentOverview from './StudentOverview';
import TicketDetail from './TicketDetail';
import TicketForm from './TicketForm';
import TicketList from './TicketList';

export default function StudentHome() {
  return (
    <>
      <OfflineIndicator />
      <div className="cc-subnav-bar">
        <div className="cc-subnav-inner" role="navigation" aria-label="Student Navigation">
          <NavLink to="/student" end className={({ isActive }) => `cc-subnav-link ${isActive ? 'active' : ''}`}>
            <span>🏠</span> Overview
          </NavLink>
          <NavLink to="/student/tickets" className={({ isActive }) => `cc-subnav-link ${isActive ? 'active' : ''}`}>
            <span>📋</span> My Requests
          </NavLink>
          <NavLink to="/student/new" className={({ isActive }) => `cc-subnav-link ${isActive ? 'active' : ''}`}>
            <span>➕</span> Raise Request
          </NavLink>
          <NavLink to="/student/opportunities" className={({ isActive }) => `cc-subnav-link ${isActive ? 'active' : ''}`}>
            <span>🎯</span> Opportunities & Aid
          </NavLink>
          <NavLink to="/student/profile" className={({ isActive }) => `cc-subnav-link ${isActive ? 'active' : ''}`}>
            <span>👤</span> Profile & Skills
          </NavLink>
          <NavLink to="/student/help" className={({ isActive }) => `cc-subnav-link ${isActive ? 'active' : ''}`}>
            <span>❓</span> Campus Help & SLAs
          </NavLink>
          <NavLink to="/student/notifications" className={({ isActive }) => `cc-subnav-link ${isActive ? 'active' : ''}`}>
            <span>🔔</span> Notifications
          </NavLink>
          <NavLink to="/student/privacy" className={({ isActive }) => `cc-subnav-link ${isActive ? 'active' : ''}`}>
            <span>🛡️</span> Privacy
          </NavLink>
        </div>
      </div>

      <div className="cc-container">
        <Routes>
          <Route index element={<StudentOverview />} />
          <Route path="tickets" element={<TicketList />} />
          <Route path="tickets/:id" element={<TicketDetail />} />
          <Route path="new" element={<TicketForm />} />
          <Route path="opportunities" element={<Opportunities />} />
          <Route path="profile" element={<Profile />} />
          <Route path="help" element={<CampusHelp />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="*" element={<Navigate to="/student" replace />} />
        </Routes>
      </div>
    </>
  );
}
