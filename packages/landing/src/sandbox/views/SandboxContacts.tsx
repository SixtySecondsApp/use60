/**
 * SandboxContacts
 *
 * Pixel-perfect replica of the real 60 Contacts/Leads view.
 * Table with avatars, engagement badges, detail panel.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Mail,
  Phone,
  Linkedin,
  Building2,
  X,
  Clock,
  TrendingUp,
  Search,
  Filter,
  SortAsc,
} from 'lucide-react';
import { useSandboxData } from '../data/SandboxDataProvider';
import type { SandboxContact } from '../data/sandboxTypes';

const ENGAGEMENT_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  hot: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Hot' },
  warm: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Warm' },
  cold: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Cold' },
};

function ContactRow({
  contact,
  index,
  isSelected,
  onClick,
}: {
  contact: SandboxContact;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const badge = ENGAGEMENT_BADGE[contact.engagement_level];
  const timeAgo = getTimeAgo(contact.last_interaction_at);

  return (
    <motion.tr
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      onClick={onClick}
      className={`
        cursor-pointer transition-colors
        ${isSelected ? 'bg-[#37bd7e]/[0.06]' : 'hover:bg-white/[0.05]'}
        ${contact.isVisitor ? 'ring-1 ring-[#37bd7e]/20' : ''}
      `}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gray-800 to-gray-700 border border-white/[0.06] flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-gray-300">
              {contact.first_name[0]}{contact.last_name[0]}
            </span>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-200">
              {contact.first_name} {contact.last_name}
              {contact.isVisitor && (
                <span className="ml-2 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-[#37bd7e]/15 text-[#37bd7e]">
                  You
                </span>
              )}
            </p>
            <p className="text-[11px] text-gray-500">{contact.title}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 hidden sm:table-cell">
        <span className="text-sm text-gray-400">{contact.email}</span>
      </td>
      <td className="px-4 py-3 hidden lg:table-cell">
        <div className="flex items-center gap-1.5">
          <Building2 className="w-3 h-3 text-gray-600" />
          <span className="text-sm text-gray-400">{contact.company_name}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
          {badge.label}
        </span>
      </td>
      <td className="px-4 py-3 hidden md:table-cell">
        <span className="text-xs text-gray-500">{timeAgo}</span>
      </td>
    </motion.tr>
  );
}

function ContactDetail({ contact, onClose }: { contact: SandboxContact; onClose: () => void }) {
  const badge = ENGAGEMENT_BADGE[contact.engagement_level];
  const { data } = useSandboxData();
  const companyDeals = data.deals.filter((d) => d.company_id === contact.company_id);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border bg-gradient-to-br from-gray-900/80 to-gray-900/40 backdrop-blur-xl border-gray-800/50 p-5 w-80"
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-gray-500 font-mono">Contact Details</span>
        <button onClick={onClose} className="p-1 rounded text-gray-500 hover:text-gray-300">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-lg bg-[#37bd7e]/15 border border-[#37bd7e]/20 flex items-center justify-center">
          <span className="text-sm font-bold text-[#37bd7e]">
            {contact.first_name[0]}{contact.last_name[0]}
          </span>
        </div>
        <div>
          <p className="text-base font-semibold text-white">
            {contact.first_name} {contact.last_name}
          </p>
          <p className="text-xs text-gray-500">{contact.title}</p>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex items-center gap-2.5 text-sm">
          <Building2 className="w-3.5 h-3.5 text-gray-600" />
          <span className="text-gray-300">{contact.company_name}</span>
        </div>
        <div className="flex items-center gap-2.5 text-sm">
          <Mail className="w-3.5 h-3.5 text-gray-600" />
          <span className="text-gray-400">{contact.email}</span>
        </div>
        {contact.phone && (
          <div className="flex items-center gap-2.5 text-sm">
            <Phone className="w-3.5 h-3.5 text-gray-600" />
            <span className="text-gray-400">{contact.phone}</span>
          </div>
        )}
        {contact.linkedin_url && (
          <div className="flex items-center gap-2.5 text-sm">
            <Linkedin className="w-3.5 h-3.5 text-gray-600" />
            <span className="text-gray-400">LinkedIn Profile</span>
          </div>
        )}
      </div>

      <div className="border-t border-gray-800/50 pt-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500">Engagement</span>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
            {badge.label}
          </span>
        </div>
        {contact.last_interaction_at && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-gray-600" />
            <span className="text-xs text-gray-500">
              Last interaction {getTimeAgo(contact.last_interaction_at)}
            </span>
          </div>
        )}
      </div>

      {companyDeals.length > 0 && (
        <div className="border-t border-gray-800/50 pt-3">
          <span className="text-xs text-gray-500 flex items-center gap-1.5 mb-2">
            <TrendingUp className="w-3 h-3" />
            Active Deals
          </span>
          {companyDeals.map((deal) => (
            <div key={deal.id} className="flex items-center justify-between py-1.5 text-xs">
              <span className="text-gray-300 truncate">{deal.name}</span>
              <span className="text-gray-500 font-mono">${(deal.value / 1000).toFixed(0)}K</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export default function SandboxContacts() {
  const { data } = useSandboxData();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedContact = selectedId
    ? data.contacts.find((c) => c.id === selectedId) ?? null
    : null;

  const sorted = [...data.contacts].sort((a, b) => {
    if (a.company_id === data.visitorCompany.id && b.company_id !== data.visitorCompany.id) return -1;
    if (b.company_id === data.visitorCompany.id && a.company_id !== data.visitorCompany.id) return 1;
    const engOrder = { hot: 0, warm: 1, cold: 2 };
    return engOrder[a.engagement_level] - engOrder[b.engagement_level];
  });

  return (
    <div className="flex gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">Leads</h2>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
              {data.contacts.length} contacts
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]">
              <Search className="w-4 h-4" />
            </button>
            <button className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]">
              <Filter className="w-4 h-4" />
            </button>
            <button className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]">
              <SortAsc className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="rounded-2xl border bg-white/[0.03] backdrop-blur-xl border-white/[0.06] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800/50">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Email</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Company</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Engagement</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Last Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/30">
              {sorted.map((contact, i) => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  index={i}
                  isSelected={selectedId === contact.id}
                  onClick={() => setSelectedId(selectedId === contact.id ? null : contact.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {selectedContact && (
          <ContactDetail
            contact={selectedContact}
            onClose={() => setSelectedId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function getTimeAgo(dateStr?: string): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}
