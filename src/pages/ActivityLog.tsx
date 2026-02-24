import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { SalesTable } from '@/components/SalesTable';
import { useActivityFilters } from '@/lib/hooks/useActivityFilters';

export default function ActivityLog() {
  const { resetFilters } = useActivityFilters();
  const location = useLocation();
  const isFromDashboard = useRef(false);

  // Check if navigation came from dashboard (has state)
  useEffect(() => {
    // When embedded as a Dashboard tab, skip filter reset entirely
    if (location.pathname === '/dashboard') return;

    // If location.state exists, we're coming from a dashboard card click
    // Otherwise, we're navigating directly to the Activity page
    if (!location.state || !location.state.preserveFilters) {
      if (!isFromDashboard.current) {
        resetFilters();
      }
    } else {
      isFromDashboard.current = true;
    }

    // Reset the ref when leaving the page
    return () => {
      isFromDashboard.current = false;
    };
  }, [location, resetFilters]);

  return <SalesTable />;
}
