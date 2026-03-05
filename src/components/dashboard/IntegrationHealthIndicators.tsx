/**
 * IntegrationHealthIndicators (SETUP-004)
 *
 * Health badges for key integrations: Google (calendar), HubSpot/Attio (CRM),
 * Slack, and Instantly.
 * Connected = green, disconnected = grey, error = red.
 * Queries integration_credentials table.
 */

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, AlertCircle, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { useNavigate } from 'react-router-dom';

interface IntegrationDef {
  key: string;
  label: string;
  types: string[];   // credential_type values to match
  settingsPath: string;
}

const INTEGRATIONS: IntegrationDef[] = [
  {
    key: 'google',
    label: 'Google',
    types: ['google', 'google_oauth', 'google_workspace'],
    settingsPath: '/settings/integrations/google-workspace',
  },
  {
    key: 'crm',
    label: 'CRM',
    types: ['hubspot', 'attio', 'bullhorn'],
    settingsPath: '/settings/integrations/hubspot',
  },
  {
    key: 'slack',
    label: 'Slack',
    types: ['slack'],
    settingsPath: '/settings/integrations/slack',
  },
  {
    key: 'instantly',
    label: 'Instantly',
    types: ['instantly'],
    settingsPath: '/settings/integrations/instantly',
  },
];

type HealthStatus = 'connected' | 'disconnected' | 'error';

interface CredentialRow {
  credential_type: string;
  is_active: boolean | null;
  has_error: boolean | null;
}

function statusForCredentials(rows: CredentialRow[], types: string[]): HealthStatus {
  const matching = rows.filter(r => types.includes(r.credential_type));
  if (matching.length === 0) return 'disconnected';
  const hasError = matching.some(r => r.has_error === true);
  if (hasError) return 'error';
  const active = matching.some(r => r.is_active !== false);
  return active ? 'connected' : 'disconnected';
}

function StatusBadge({ status }: { status: HealthStatus }) {
  if (status === 'connected') {
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  }
  if (status === 'error') {
    return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
  }
  return <Circle className="h-3.5 w-3.5 text-gray-400 dark:text-gray-600" />;
}

const STATUS_LABEL: Record<HealthStatus, string> = {
  connected: 'Connected',
  disconnected: 'Not connected',
  error: 'Error',
};

const STATUS_COLOR: Record<HealthStatus, string> = {
  connected: 'text-emerald-600 dark:text-emerald-400',
  disconnected: 'text-gray-400 dark:text-gray-500',
  error: 'text-red-600 dark:text-red-400',
};

export function IntegrationHealthIndicators() {
  const orgId = useActiveOrgId();
  const navigate = useNavigate();

  const { data: credentials } = useQuery({
    queryKey: ['integration-health', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('integration_credentials')
        .select('credential_type, is_active, has_error')
        .eq('organization_id', orgId);
      if (error) return [];
      return (data || []) as CredentialRow[];
    },
    enabled: !!orgId,
    staleTime: 2 * 60 * 1000,
  });

  return (
    <div className="flex flex-wrap gap-2">
      {INTEGRATIONS.map((intg) => {
        const status = statusForCredentials(credentials || [], intg.types);
        return (
          <button
            key={intg.key}
            onClick={() => navigate(intg.settingsPath)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors
              bg-white/60 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800
              hover:border-gray-300 dark:hover:border-gray-700"
          >
            <StatusBadge status={status} />
            <span className={STATUS_COLOR[status]}>{intg.label}</span>
            {status !== 'connected' && (
              <ExternalLink className="h-2.5 w-2.5 text-gray-400 dark:text-gray-600 ml-0.5" />
            )}
          </button>
        );
      })}
    </div>
  );
}
