import { useState, useRef, useEffect } from 'react';
import { X, TableProperties, Loader2, Tag, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { ServiceLocator } from '@/lib/services/ServiceLocator';
import { supabase } from '@/lib/supabase/clientV2';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { GraphNode, ContactCategory } from './types';

const CATEGORY_OPTIONS: { value: ContactCategory; label: string; color: string }[] = [
  { value: 'prospect', label: 'Prospect', color: '#6366f1' },
  { value: 'client', label: 'Client', color: '#22c55e' },
  { value: 'partner', label: 'Partner', color: '#0ea5e9' },
  { value: 'supplier', label: 'Supplier', color: '#f59e0b' },
  { value: 'employee', label: 'Employee', color: '#94a3b8' },
  { value: 'investor', label: 'Investor', color: '#a78bfa' },
  { value: 'other', label: 'Other', color: '#64748b' },
];

interface SelectionActionBarProps {
  selectedIds: Set<string>;
  allNodes: GraphNode[];
  allColdContacts: GraphNode[];
  onToggleMode: () => void;
  onClearSelection: () => void;
}

export function SelectionActionBar({ selectedIds, allNodes, allColdContacts, onToggleMode, onClearSelection }: SelectionActionBarProps) {
  const [creating, setCreating] = useState(false);
  const [changingType, setChangingType] = useState(false);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const typeMenuRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const activeOrgId = useOrgStore((state) => state.activeOrgId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const selectedContacts = allNodes.filter((n) => selectedIds.has(n.id));

  // Close type menu on outside click
  useEffect(() => {
    if (!showTypeMenu) return;
    const handler = (e: MouseEvent) => {
      if (typeMenuRef.current && !typeMenuRef.current.contains(e.target as Node)) {
        setShowTypeMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showTypeMenu]);

  const handleChangeType = async (category: ContactCategory) => {
    if (!user || changingType || selectedContacts.length === 0) return;
    setChangingType(true);
    setShowTypeMenu(false);

    try {
      const ids = selectedContacts.map((c) => c.id);

      // Update contacts category in batch
      const { error } = await (supabase
        .from('contacts') as any)
        .update({ category })
        .in('id', ids);

      if (error) throw error;

      // If marking as client, upsert into the clients table
      if (category === 'client') {
        const clientRows = selectedContacts.map((c) => ({
          company_name: c.company_obj?.name || c.company || '',
          contact_name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
          contact_email: c.email,
          status: 'active' as const,
          owner_id: c.owner_id || user.id,
        }));

        // Insert clients, skip duplicates on contact_email
        for (const row of clientRows) {
          const { error: clientErr } = await (supabase
            .from('clients') as any)
            .upsert(row, { onConflict: 'contact_email', ignoreDuplicates: true });
          if (clientErr) console.warn('Client upsert warning:', clientErr.message);
        }
      }

      // Invalidate graph data to reflect updated categories
      queryClient.invalidateQueries({ queryKey: ['graph-data'] });

      const label = CATEGORY_OPTIONS.find((o) => o.value === category)?.label ?? category;
      toast.success(`Updated ${ids.length} contact${ids.length > 1 ? 's' : ''} to ${label}${category === 'client' ? ' — synced to Clients' : ''}`);
    } catch (err) {
      toast.error('Failed to update contact type');
      console.error(err);
    } finally {
      setChangingType(false);
    }
  };

  const handleAddToOpsTable = async () => {
    if (!user || !activeOrgId || creating || selectedContacts.length === 0) return;
    setCreating(true);

    try {
      const svc = ServiceLocator.instance.opsTableService;

      const table = await svc.createTable({
        organizationId: activeOrgId,
        createdBy: user.id,
        name: `Selected Contacts (${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })})`,
        description: `${selectedContacts.length} contacts selected from relationship graph`,
        sourceType: 'manual',
      });

      const columns = [
        { key: 'full_name', label: 'Name', columnType: 'text' as const },
        { key: 'email', label: 'Email', columnType: 'email' as const },
        { key: 'title', label: 'Title', columnType: 'text' as const },
        { key: 'company', label: 'Company', columnType: 'company' as const },
        { key: 'warmth_score', label: 'Warmth', columnType: 'number' as const },
        { key: 'tier', label: 'Tier', columnType: 'text' as const },
        { key: 'last_interaction', label: 'Last Interaction', columnType: 'date' as const },
      ];

      for (const col of columns) {
        await svc.addColumn({ tableId: table.id, ...col });
      }

      const rows = selectedContacts.map((c) => ({
        sourceId: c.id,
        cells: {
          full_name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
          email: c.email,
          title: c.title || '',
          company: c.company_obj?.name || c.company || '',
          warmth_score: ((c.warmth_score ?? 0) * 100).toFixed(0),
          tier: c.tier || 'cold',
          last_interaction: c.last_interaction_at || '',
        },
      }));

      // Batch insert rows in chunks of 25 to avoid URL length limits
      const BATCH_SIZE = 25;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        await svc.addRows(table.id, rows.slice(i, i + BATCH_SIZE));
      }
      toast.success(`Created ops table with ${selectedContacts.length} contacts`);
      navigate(`/ops/${table.id}`);
    } catch (err) {
      toast.error('Failed to create ops table');
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  if (selectedIds.size === 0) {
    return (
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#1a1a2e]/95 border border-white/[0.1] shadow-2xl backdrop-blur-sm">
        <span className="text-gray-400 text-xs">Click contacts to select them</span>
        <button
          onClick={onToggleMode}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] text-gray-400 text-[11px] font-semibold hover:bg-white/[0.12] transition-all"
        >
          <X className="w-3 h-3" />
          Exit select
        </button>
      </div>
    );
  }

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#1a1a2e]/95 border border-indigo-500/20 shadow-2xl backdrop-blur-sm">
      <span className="text-indigo-300 text-xs font-bold">{selectedIds.size} selected</span>

      <div className="w-px h-5 bg-white/[0.08]" />

      {/* Change Type dropdown */}
      <div className="relative" ref={typeMenuRef}>
        <button
          onClick={() => setShowTypeMenu(!showTypeMenu)}
          disabled={changingType}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 text-[11px] font-semibold hover:bg-indigo-500/30 transition-all disabled:opacity-50"
        >
          {changingType ? <Loader2 className="w-3 h-3 animate-spin" /> : <Tag className="w-3 h-3" />}
          Change Type
          <ChevronDown className="w-3 h-3" />
        </button>

        {showTypeMenu && (
          <div className="absolute bottom-full left-0 mb-2 z-50 bg-[#1a1a2e] border border-white/[0.1] rounded-lg shadow-xl py-1 min-w-[150px]">
            {CATEGORY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleChangeType(opt.value)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-gray-200 hover:bg-white/[0.06] transition-colors"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: opt.color }}
                />
                {opt.label}
                {opt.value === 'client' && (
                  <span className="ml-auto text-[9px] text-green-400/60">+ Clients</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={handleAddToOpsTable}
        disabled={creating}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 text-[11px] font-semibold hover:bg-indigo-500/30 transition-all disabled:opacity-50"
      >
        {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <TableProperties className="w-3 h-3" />}
        {creating ? 'Creating...' : 'Add to Ops Table'}
      </button>

      <button
        onClick={onClearSelection}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] text-gray-400 text-[11px] font-semibold hover:bg-white/[0.12] transition-all"
      >
        Clear
      </button>

      <button
        onClick={onToggleMode}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] text-gray-400 text-[11px] font-semibold hover:bg-white/[0.12] transition-all"
      >
        <X className="w-3 h-3" />
        Exit
      </button>
    </div>
  );
}
