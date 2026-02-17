import React, { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Database,
  Users,
  Building2,
  Calendar,
  Zap,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Briefcase,
  TrendingUp,
  ClipboardList,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { STANDARD_TABLE_TEMPLATES } from '@/lib/config/standardTableTemplates';
import { STANDARD_TABLE_AUTOMATIONS } from '@/lib/config/standardTableAutomations';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { isUserAdmin } from '@/lib/utils/adminUtils';
import { useUser } from '@/lib/hooks/useUser';
import { useActiveOrg } from '@/lib/stores/orgStore';

interface StandardTablesGalleryProps {
  onTableClick: (tableId: string) => void;
  existingTables: Array<{ id: string; name: string; row_count: number; is_standard?: boolean }>;
}

const TABLE_ICONS: Record<string, any> = {
  'standard_leads': Zap,
  'standard_meetings': Calendar,
  'standard_all_contacts': Users,
  'standard_all_companies': Building2,
  'standard_clients': Briefcase,
  'standard_deals': TrendingUp,
  'standard_waitlist': ClipboardList,
};

interface StandardTableCardData {
  key: string;
  name: string;
  description: string;
  columnCount: number;
  viewCount: number;
  automationCount: number;
}

export function StandardTablesGallery({ onTableClick, existingTables }: StandardTablesGalleryProps) {
  const queryClient = useQueryClient();
  const { userData: user } = useUser();
  const activeOrg = useActiveOrg();
  const [provisioning, setProvisioning] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [restoringKey, setRestoringKey] = useState<string | null>(null);

  const isAdmin = isUserAdmin(user);
  const isPlatformOrg = isAdmin && activeOrg?.name?.toLowerCase().includes('sixty');

  // Last synced timestamp (persisted in localStorage)
  const SYNC_TS_KEY = 'sixty:standard-tables:last-synced';
  const [lastSynced, setLastSynced] = useState<string | null>(
    () => localStorage.getItem(SYNC_TS_KEY)
  );
  const [, setTick] = useState(0);

  // Re-render every 60s to keep relative time fresh
  useEffect(() => {
    if (!lastSynced) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [lastSynced]);

  const formatRelativeTime = useCallback((iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }, []);

  // Build card data from templates (filter platform_only unless in platform org)
  const visibleTemplates = STANDARD_TABLE_TEMPLATES.filter(
    (t) => !t.platform_only || isPlatformOrg
  );

  const standardCards: StandardTableCardData[] = visibleTemplates.map((template) => {
    const automationCount = STANDARD_TABLE_AUTOMATIONS.filter(
      (a) => a.target_table === template.key
    ).length;

    return {
      key: template.key,
      name: template.name,
      description: template.description,
      columnCount: template.columns.length,
      viewCount: template.views.length,
      automationCount,
    };
  });

  // Check if a standard table exists
  const getExistingTable = (templateKey: string) => {
    // Map template key to expected table name
    const nameMap: Record<string, string> = {
      'standard_leads': 'Leads',
      'standard_meetings': 'Meetings',
      'standard_all_contacts': 'All Contacts',
      'standard_all_companies': 'All Companies',
      'standard_clients': 'Clients',
      'standard_deals': 'Deals',
      'standard_waitlist': 'Waitlist Signups',
    };
    const expectedName = nameMap[templateKey];
    return existingTables.find((t) => t.name === expectedName && (t.is_standard === true || t.is_standard === undefined));
  };

  const missingTables = standardCards.filter((card) => !getExistingTable(card.key));
  const hasNoStandardTables = missingTables.length === visibleTemplates.length;
  const activeTables = standardCards.filter((card) => getExistingTable(card.key));
  const hasEmptyTables = activeTables.some((card) => {
    const existing = getExistingTable(card.key);
    return existing && existing.row_count === 0;
  });

  const triggerBackfill = async (silent = false) => {
    if (!silent) setBackfilling(true);
    try {
      await supabase.auth.refreshSession();
      const { data, error } = await supabase.functions.invoke('backfill-standard-ops-tables');

      if (error) {
        // Extract actual error body from FunctionsHttpError
        let msg = error.message;
        try {
          const body = await error.context?.json();
          msg = body?.error || msg;
        } catch {}
        throw new Error(msg);
      }

      const results = data?.results || {};
      const totalRows = Object.values(results).reduce((sum: number, v) => sum + (v as number), 0);

      if (data?.errors && Object.keys(data.errors).length > 0) {
        const failedTables = Object.keys(data.errors).join(', ');
        toast.warning(`Partial backfill — ${totalRows} rows populated. Failed: ${failedTables}`);
        console.warn('Backfill errors:', data.errors);
      } else {
        toast.success(`Backfill complete — ${totalRows} rows populated`);
      }
      const ts = new Date().toISOString();
      localStorage.setItem(SYNC_TS_KEY, ts);
      setLastSynced(ts);
      queryClient.invalidateQueries({ queryKey: ['ops-tables'] });
      queryClient.invalidateQueries({ queryKey: ['standard-table-health'] });
    } catch (err) {
      if (!silent) toast.error('Backfill failed: ' + (err as Error).message);
      console.error('Backfill error:', err);
    } finally {
      if (!silent) setBackfilling(false);
    }
  };

  const handleProvisionAll = async () => {
    setProvisioning(true);
    try {
      // Ensure fresh auth session before calling edge function
      await supabase.auth.refreshSession();
      const { data, error } = await supabase.functions.invoke('provision-standard-ops-tables');
      if (error) throw error;
      toast.success('Standard tables created — populating data...');
      queryClient.invalidateQueries({ queryKey: ['ops-tables'] });
      // Auto-trigger backfill to populate rows
      triggerBackfill(true);
    } catch (err) {
      console.error('Provisioning error:', err);
      toast.error('Failed to provision tables: ' + (err as Error).message);
    } finally {
      setProvisioning(false);
    }
  };

  const handleRestoreSingle = async (tableKey: string) => {
    if (!isAdmin) {
      toast.error('Admin permission required');
      return;
    }

    setRestoringKey(tableKey);
    try {
      await supabase.auth.refreshSession();
      const { data, error } = await supabase.functions.invoke('provision-standard-ops-tables', {
        body: { table_keys: [tableKey] },
      });
      if (error) throw error;
      toast.success('Table restored — populating data...');
      queryClient.invalidateQueries({ queryKey: ['ops-tables'] });
      triggerBackfill(true);
    } catch (err) {
      console.error('Restore error:', err);
      toast.error('Failed to restore table: ' + (err as Error).message);
    } finally {
      setRestoringKey(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner: No standard tables exist */}
      {hasNoStandardTables && (
        <div className="rounded-lg border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-blue-500/10 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="mb-1 text-lg font-semibold text-white">
                Set up your standard CRM tables
              </h3>
              <p className="text-sm text-zinc-400">
                Get started with pre-configured tables for leads, meetings, contacts, and companies
                with automatic enrichment and CRM sync.
              </p>
            </div>
            <Button
              onClick={handleProvisionAll}
              disabled={provisioning}
              className="shrink-0 bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              {provisioning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Provisioning...
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-4 w-4" />
                  Provision Now
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Sync button when tables have data */}
      {activeTables.length > 0 && !hasEmptyTables && isAdmin && (
        <div className="flex items-center justify-end gap-3">
          {lastSynced && (
            <span className="text-xs text-zinc-500">
              Last synced {formatRelativeTime(lastSynced)}
            </span>
          )}
          <Button
            onClick={() => triggerBackfill()}
            disabled={backfilling}
            variant="outline"
            size="sm"
            className="border-gray-700 text-gray-300 hover:bg-gray-800"
          >
            {backfilling ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-3 w-3" />
                Sync Data
              </>
            )}
          </Button>
        </div>
      )}

      {/* Cards Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {standardCards.map((card) => {
          const IconComponent = TABLE_ICONS[card.key] || Database;
          const existing = getExistingTable(card.key);
          const isActive = !!existing;
          const isMissing = !isActive;
          const isRestoring = restoringKey === card.key;

          return (
            <div
              key={card.key}
              onClick={isActive ? () => onTableClick(existing.id) : undefined}
              className={`
                group relative overflow-hidden rounded-lg border bg-gradient-to-br p-4 transition-all duration-300
                ${
                  isActive
                    ? 'cursor-pointer border-gray-800/50 from-gray-900/80 to-gray-900/40 backdrop-blur-xl hover:border-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/10'
                    : 'border-gray-800/30 from-gray-900/40 to-gray-900/20'
                }
              `}
            >
              {/* Icon + Name */}
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      isActive
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-gray-800/50 text-gray-500'
                    }`}
                  >
                    <IconComponent className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-100">{card.name}</h3>
                  </div>
                </div>
              </div>

              {/* Description */}
              <p className="mb-4 line-clamp-2 text-xs text-gray-400">{card.description}</p>

              {/* Metadata */}
              <div className="mb-4 space-y-1.5 text-xs text-gray-500">
                <div className="flex items-center gap-1.5">
                  <Database className="h-3 w-3" />
                  <span>
                    {card.columnCount} columns · {card.viewCount} views
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3 w-3" />
                  <span>{card.automationCount} automations</span>
                </div>
                {isActive && (
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>{existing.row_count.toLocaleString()} rows</span>
                  </div>
                )}
              </div>

              {/* Status Badge + Actions */}
              <div className="flex items-center justify-between">
                {isActive ? (
                  <>
                    <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-400">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Active
                    </Badge>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTableClick(existing.id);
                      }}
                      className="rounded-lg p-1.5 text-gray-400 opacity-0 transition-all hover:bg-gray-800/60 hover:text-white group-hover:opacity-100"
                      title="View"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <Badge variant="secondary" className="bg-gray-700/30 text-gray-500">
                      <AlertCircle className="mr-1 h-3 w-3" />
                      Not Provisioned
                    </Badge>
                    {isAdmin && isMissing && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRestoreSingle(card.key);
                        }}
                        disabled={isRestoring}
                        className="rounded-lg bg-gray-800/60 px-2.5 py-1 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700/60 hover:text-white disabled:opacity-50"
                        title="Restore this table"
                      >
                        {isRestoring ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <RefreshCw className="mr-1 inline h-3 w-3" />
                            Restore
                          </>
                        )}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Backfill prompt when tables exist but are empty */}
      {hasEmptyTables && isAdmin && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-300">
                <Database className="mr-2 inline h-4 w-4" />
                Tables are empty — populate from your existing data
              </p>
              <p className="mt-1 text-xs text-blue-300/60">
                Pulls contacts, companies, meetings, and leads from your app data into the standard tables.
              </p>
            </div>
            <Button
              onClick={() => triggerBackfill()}
              disabled={backfilling}
              className="shrink-0 bg-blue-500 hover:bg-blue-600 text-white"
            >
              {backfilling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Populating...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Populate Tables
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Footer hint if some are missing (but not all) */}
      {!hasNoStandardTables && missingTables.length > 0 && isAdmin && (
        <div className="rounded-lg border border-gray-800/50 bg-gray-900/40 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">
              <AlertCircle className="mr-2 inline h-4 w-4 text-yellow-500" />
              {missingTables.length} standard{' '}
              {missingTables.length === 1 ? 'table' : 'tables'} not provisioned
            </p>
            <Button
              onClick={handleProvisionAll}
              disabled={provisioning}
              variant="outline"
              size="sm"
              className="border-gray-700 text-gray-300 hover:bg-gray-800"
            >
              {provisioning ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Provisioning...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-3 w-3" />
                  Provision All
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
