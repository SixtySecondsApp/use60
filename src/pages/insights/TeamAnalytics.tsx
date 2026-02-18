import { Navigate } from 'react-router-dom';

/**
 * Team Analytics has been merged into the Meeting Analytics page.
 * This component redirects to the Dashboard tab.
 */
export default function TeamAnalytics() {
  return <Navigate to="/meeting-analytics?tab=dashboard" replace />;
}
