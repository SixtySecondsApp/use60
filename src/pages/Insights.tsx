import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

// Tab mapping: insights tab names → dashboard tab names (same keys, kept for forward-compat)
const TAB_MAP: Record<string, string> = {
  funnel: 'funnel',
  heatmap: 'heatmap',
  activity: 'activity',
  leads: 'leads',
};

export default function Insights() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get('tab');
    const dashTab = (tab && TAB_MAP[tab]) ? TAB_MAP[tab] : null;
    const target = dashTab ? `/dashboard?tab=${dashTab}` : '/dashboard';
    navigate(target, { replace: true });
  }, [navigate, searchParams]);

  return null;
}
