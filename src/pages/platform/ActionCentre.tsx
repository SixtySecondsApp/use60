/**
 * ActionCentre — CC-004: Deprecated
 *
 * Redirects to /command-centre (Command Centre, the unified AI inbox).
 * This file is kept as a redirect stub; the full implementation has moved
 * to src/pages/platform/CommandCentre.tsx.
 *
 * @deprecated Use /command-centre instead.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ActionCentre() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/command-centre', { replace: true });
  }, [navigate]);

  return null;
}
