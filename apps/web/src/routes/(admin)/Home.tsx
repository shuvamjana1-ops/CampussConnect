import { NavLink, Navigate, Route, Routes } from 'react-router';
import AuditPage from './AuditPage';
import ConfigPage from './ConfigPage';
import ErpPage from './ErpPage';
import NotificationFailuresPage from './NotificationFailuresPage';

/** Tenant_Admin area mounted at `/admin/*`. */
export default function AdminHome() {
  return (
    <>
      <div className="cc-subnav-bar">
        <div className="cc-subnav-inner" role="navigation" aria-label="Administration Navigation">
          <NavLink
            to="/admin/config"
            className={({ isActive }) => `cc-subnav-link ${isActive ? 'active' : ''}`}
          >
            <span>⚙️</span> Tenant Configuration & SLAs
          </NavLink>
          <NavLink
            to="/admin/erp"
            className={({ isActive }) => `cc-subnav-link ${isActive ? 'active' : ''}`}
          >
            <span>🔄</span> ERP Integration & Freshness
          </NavLink>
          <NavLink
            to="/admin/notifications"
            className={({ isActive }) => `cc-subnav-link ${isActive ? 'active' : ''}`}
          >
            <span>✉️</span> Notification Failures
          </NavLink>
          <NavLink
            to="/admin/audit"
            className={({ isActive }) => `cc-subnav-link ${isActive ? 'active' : ''}`}
          >
            <span>🔐</span> Cryptographic Audit Trail
          </NavLink>
        </div>
      </div>

      <div className="cc-container">
        <Routes>
          <Route index element={<Navigate to="config" replace />} />
          <Route path="config" element={<ConfigPage />} />
          <Route path="erp" element={<ErpPage />} />
          <Route path="notifications" element={<NotificationFailuresPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="*" element={<Navigate to="config" replace />} />
        </Routes>
      </div>
    </>
  );
}
