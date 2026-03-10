import { useState } from 'react';
import { X, MousePointerSquareDashed, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TIER_COLORS } from './constants';
import type { GraphNode, ColdCluster, WarmthTier } from './types';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { ServiceLocator } from '@/lib/services/ServiceLocator';
import { toast } from 'sonner';

interface ClusterDetailPanelProps {
  cluster: ColdCluster;
  allColdContacts: GraphNode[];
  onClose: () => void;
  onSelectContact?: (id: string) => void;
  onSelectMultiple?: (ids: string[]) => void;
}

export function ClusterDetailPanel({ cluster, allColdContacts, onClose, onSelectContact, onSelectMultiple }: ClusterDetailPanelProps) {
  const [creatingTable, setCreatingTable] = useState(false);
  const { user } = useAuth();
  const activeOrgId = useOrgStore((state) => state.activeOrgId);
  const navigate = useNavigate();
  const tierColor = TIER_COLORS.cold;

  const handleViewAllCold = async () => {
    if (!user || !activeOrgId || creatingTable) return;
    setCreatingTable(true);

    try {
      const svc = ServiceLocator.instance.opsTableService;

      // Create the ops table
      const table = await svc.createTable({
        organizationId: activeOrgId,
        createdBy: user.id,
        name: `Cold Contacts (${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })})`,
        description: `${allColdContacts.length} cold contacts exported from relationship graph`,
        sourceType: 'manual',
      });

      // Add columns
      const columns = [
        { key: 'full_name', label: 'Name', columnType: 'text' as const },
        { key: 'email', label: 'Email', columnType: 'email' as const },
        { key: 'title', label: 'Title', columnType: 'text' as const },
        { key: 'company', label: 'Company', columnType: 'company' as const },
        { key: 'warmth_score', label: 'Warmth', columnType: 'number' as const },
        { key: 'last_interaction', label: 'Last Interaction', columnType: 'date' as const },
      ];

      for (const col of columns) {
        await svc.addColumn({ tableId: table.id, ...col });
      }

      // Add all cold contacts as rows
      const rows = allColdContacts.map((c) => ({
        sourceId: c.id,
        cells: {
          full_name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
          email: c.email,
          title: c.title || '',
          company: c.company_obj?.name || c.company || '',
          warmth_score: ((c.warmth_score ?? 0) * 100).toFixed(0),
          last_interaction: c.last_interaction_at || '',
        },
      }));

      // Batch insert rows in chunks of 25 to avoid URL length limits
      const BATCH_SIZE = 25;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        await svc.addRows(table.id, rows.slice(i, i + BATCH_SIZE));
      }
      toast.success(`Created ops table with ${allColdContacts.length} cold contacts`);
      navigate(`/ops/${table.id}`);
    } catch (err) {
      toast.error('Failed to create ops table');
      console.error(err);
    } finally {
      setCreatingTable(false);
    }
  };

  return (
    <div
      className="w-[370px] shrink-0 flex flex-col overflow-hidden border-l border-white/[0.08]"
      style={{ background: 'rgba(17,17,24,0.88)', backdropFilter: 'blur(20px)' }}
    >
      {/* Header */}
      <div
        className="px-4 py-3.5 border-b border-white/[0.06]"
        style={{ background: `linear-gradient(135deg, ${tierColor.primary}11, transparent)` }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[15px] font-bold"
              style={{ background: `linear-gradient(135deg, ${tierColor.primary}, ${tierColor.gradient[1]})` }}
            >
              {cluster.contacts.length}
            </div>
            <div>
              <div className="text-gray-100 text-sm font-bold">Cold Contacts</div>
              <div className="text-gray-400 text-[11px]">
                {cluster.contacts.length} contacts in this cluster
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-gray-400 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Actions row */}
        <div className="flex gap-2">
          {onSelectMultiple && (
            <button
              onClick={() => onSelectMultiple(cluster.contacts.map((c) => c.id))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 text-[11px] font-semibold hover:bg-indigo-500/30 transition-all"
            >
              <MousePointerSquareDashed className="w-3 h-3" />
              Select all {cluster.contacts.length}
            </button>
          )}
        </div>
      </div>

      {/* 2-column x 5-row contact grid */}
      <div className="flex-1 overflow-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          {cluster.contacts.map((contact) => {
            const displayName = contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email;
            const initial = (contact.first_name || contact.email)[0]?.toUpperCase() ?? '?';
            const warmthPct = ((contact.warmth_score ?? 0) * 100).toFixed(0);

            return (
              <button
                key={contact.id}
                onClick={() => onSelectContact?.(contact.id)}
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-[#1e1e2e]/50 hover:bg-[#1e1e2e]/90 border border-white/[0.04] hover:border-white/[0.1] transition-all text-center"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[12px] font-bold shrink-0"
                  style={{ background: `linear-gradient(135deg, ${tierColor.primary}, ${tierColor.gradient[1]})` }}
                >
                  {initial}
                </div>
                <div className="w-full min-w-0">
                  <div className="text-gray-200 text-[11px] font-semibold truncate">{displayName}</div>
                  <div className="text-gray-500 text-[9px] truncate">
                    {contact.title || contact.company_obj?.name || contact.email}
                  </div>
                </div>
                <span
                  className="text-[10px] font-bold"
                  style={{ color: tierColor.primary }}
                >
                  {warmthPct}%
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer: View all cold contacts */}
      <div className="px-4 py-3 border-t border-white/[0.06]">
        <div className="text-gray-500 text-[10px] mb-2">
          {allColdContacts.length} total cold contacts across all clusters
        </div>
        <button
          onClick={handleViewAllCold}
          disabled={creatingTable}
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-indigo-500/15 text-indigo-300 text-xs font-semibold hover:bg-indigo-500/25 transition-all disabled:opacity-50 border border-indigo-500/20"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          {creatingTable ? 'Creating table...' : 'View all in Ops Table'}
        </button>
      </div>
    </div>
  );
}
