import { motion, AnimatePresence } from 'framer-motion';
import { Linkedin, ChevronDown, User, MessageCircle } from 'lucide-react';
import type { DiscoveredContact } from '../demo/demo-types';

interface ContactCardProps {
  contact: DiscoveredContact;
  expanded?: boolean;
  onToggle?: () => void;
  /** Slot for outreach content (wired later in CC-004/CC-005) */
  children?: React.ReactNode;
  loading?: boolean;
}

function getSeniorityBadgeClasses(seniority: string): string {
  const s = seniority.toLowerCase();
  if (s.includes('c-suite') || s.includes('c-level') || s.includes('ceo') || s.includes('cto') || s.includes('cfo') || s.includes('coo') || s.includes('vp') || s.includes('vice president')) {
    return 'bg-violet-500/20 text-violet-300 border-violet-500/30';
  }
  if (s.includes('director')) {
    return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
  }
  if (s.includes('manager')) {
    return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  }
  return 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30';
}

function getInitials(contact: DiscoveredContact): string {
  const first = contact.first_name?.[0] ?? '';
  const last = contact.last_name?.[0] ?? '';
  return (first + last).toUpperCase() || '?';
}

function ContactCardSkeleton() {
  return (
    <div className="rounded-xl bg-zinc-900/40 border border-zinc-800/50 p-3">
      <div className="flex items-center gap-3">
        {/* Photo skeleton */}
        <div className="w-10 h-10 rounded-full bg-zinc-800/60 animate-pulse flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          {/* Name skeleton */}
          <div className="h-4 w-32 bg-zinc-800/60 rounded animate-pulse" />
          {/* Title skeleton */}
          <div className="h-3 w-48 bg-zinc-800/60 rounded animate-pulse" />
        </div>
        {/* Badge skeleton */}
        <div className="h-5 w-16 bg-zinc-800/60 rounded-full animate-pulse flex-shrink-0" />
      </div>
    </div>
  );
}

export function ContactCard({
  contact,
  expanded = false,
  onToggle,
  children,
  loading = false,
}: ContactCardProps) {
  if (loading) {
    return <ContactCardSkeleton />;
  }

  return (
    <div className="rounded-xl bg-zinc-900/40 border border-zinc-800/50 transition-colors hover:border-zinc-700/60">
      {/* Collapsed header — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left cursor-pointer"
      >
        {/* Photo / initials avatar */}
        {contact.photo_url ? (
          <img
            src={contact.photo_url}
            alt={contact.full_name}
            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-medium text-violet-300">
              {getInitials(contact)}
            </span>
          </div>
        )}

        {/* Name + title */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 font-medium truncate">
            {contact.full_name}
          </p>
          <p className="text-xs text-zinc-400 truncate">
            {contact.title}
            {contact.company_name ? ` at ${contact.company_name}` : ''}
          </p>
        </div>

        {/* Seniority badge */}
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full font-medium border flex-shrink-0 ${getSeniorityBadgeClasses(contact.seniority)}`}
        >
          {contact.seniority}
        </span>

        {/* LinkedIn icon */}
        {contact.linkedin_url && (
          <a
            href={contact.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 rounded-md hover:bg-zinc-800/60 text-zinc-400 hover:text-blue-400 transition-colors flex-shrink-0"
            aria-label="Open LinkedIn profile"
          >
            <Linkedin className="w-3.5 h-3.5" />
          </a>
        )}

        {/* Expand chevron */}
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-zinc-500 flex-shrink-0"
        >
          <ChevronDown className="w-4 h-4" />
        </motion.span>
      </button>

      {/* Expanded content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 border-t border-zinc-800/40">
              {/* Meta row */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500 mb-2">
                {contact.department && <span>{contact.department}</span>}
                {contact.location && <span>{contact.location}</span>}
                {contact.email && <span>{contact.email}</span>}
              </div>

              {/* Recent LinkedIn activity */}
              {contact.recent_posts && contact.recent_posts.length > 0 && (
                <div className="mb-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <MessageCircle className="w-3 h-3 text-blue-400" />
                    <span className="text-[10px] text-zinc-500 font-medium">Recent Activity</span>
                  </div>
                  <div className="space-y-1">
                    {contact.recent_posts.slice(0, 2).map((post, i) => (
                      <p key={i} className="text-[11px] text-zinc-400 truncate leading-relaxed">{post}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Children slot for outreach draft / action buttons */}
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ContactCard;
