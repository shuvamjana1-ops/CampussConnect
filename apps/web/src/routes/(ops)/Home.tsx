import { NavLink, Navigate, Route, Routes } from 'react-router';
import BreachPage from './BreachPage';
import GuardrailsPage from './GuardrailsPage';
import ProvisionPage from './ProvisionPage';
import ServiceHealthPage from './ServiceHealthPage';

/** Platform operator console mounted at `/ops/*`. */
export default function OpsHome() {
  return (
    <>
      <div className="cc-subnav-bar">
        <div className="cc-subnav-inner" role="navigation" aria-label="Operations Navigation">
          <NavLink
            to="/ops/health"
            className={({ isActive }) => `cc-subnav-link ${isActive ? 'active' : ''}`}
          >
            <span>📡</span> Service Health & Latency
          </NavLink>
          <NavLink
            to="/ops/tenants"
            className={({ isActive }) => `cc-subnav-link ${isActive ? 'active' : ''}`}
          >
            <span>🏛️</span> Tenant Provisioning
          </NavLink>
          <NavLink
            to="/ops/breaches"
            className={({ isActive }) => `cc-subnav-link ${isActive ? 'active' : ''}`}
          >
            <span>🚨</span> SLA Breaches & Incidents
          </NavLink>
          <NavLink
            to="/ops/guardrails"
            className={({ isActive }) => `cc-subnav-link ${isActive ? 'active' : ''}`}
          >
            <span>🛡️</span> Guardrails & Kill-switches
          </NavLink>
        </div>
      </div>

      <Routes>
        <Route index element={<Navigate to="health" replace />} />
        <Route path="health" element={<ServiceHealthPage />} />
        <Route path="tenants" element={<ProvisionPage />} />
        <Route path="breaches" element={<BreachPage />} />
        <Route path="guardrails" element={<GuardrailsPage />} />
        <Route path="*" element={<Navigate to="health" replace />} />
      </Routes>
    </>
  );
}
