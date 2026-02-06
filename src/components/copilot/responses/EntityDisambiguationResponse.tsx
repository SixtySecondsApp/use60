/**
 * Entity Disambiguation Response Component
 *
 * Displays interactive contact cards when the AI needs to disambiguate between
 * multiple people with the same name. Users can click on a contact to select them.
 */

import React from 'react';
import { motion } from 'framer-motion';
import {
  User,
  Building2,
  Mail,
  Phone,
  Calendar,
  MessageSquare,
  Video,
  ExternalLink,
  Clock,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCopilot } from '@/lib/contexts/CopilotContext';
import { formatDistanceToNow } from 'date-fns';

// Entity candidate from resolve_entity tool
export interface EntityCandidate {
  id: string;
  type: 'contact' | 'meeting_attendee' | 'calendar_attendee' | 'email_participant';
  first_name: string;
  last_name?: string;
  full_name: string;
  email?: string;
  company_name?: string;
  title?: string;
  phone?: string;
  source: string;
  last_interaction: string;
  last_interaction_type: string;
  last_interaction_description?: string;
  recency_score: number;
  contact_id?: string;
  crm_url?: string;
  recent_interactions?: RecentInteraction[];
}

export interface RecentInteraction {
  type: 'meeting' | 'email' | 'calendar';
  date: string;
  title: string;
  description?: string;
  snippet?: string;
  url?: string;
}

export interface EntityDisambiguationData {
  name_searched: string;
  disambiguation_reason?: string;
  candidates: EntityCandidate[];
}

interface EntityDisambiguationResponseProps {
  data: EntityDisambiguationData;
  onSelect?: (candidate: EntityCandidate) => void;
}

/**
 * Icon for interaction type
 */
const InteractionIcon: React.FC<{ type: string; className?: string }> = ({ type, className }) => {
  switch (type) {
    case 'meeting':
      return <Video className={cn('w-3.5 h-3.5', className)} />;
    case 'email':
      return <Mail className={cn('w-3.5 h-3.5', className)} />;
    case 'calendar':
      return <Calendar className={cn('w-3.5 h-3.5', className)} />;
    default:
      return <MessageSquare className={cn('w-3.5 h-3.5', className)} />;
  }
};

/**
 * Individual contact card for disambiguation
 */
const CandidateCard: React.FC<{
  candidate: EntityCandidate;
  index: number;
  onSelect: () => void;
}> = ({ candidate, index, onSelect }) => {
  const formattedLastInteraction = candidate.last_interaction
    ? formatDistanceToNow(new Date(candidate.last_interaction), { addSuffix: true })
    : 'Unknown';

  const sourceLabel = {
    contact: 'CRM Contact',
    meeting_attendee: 'Meeting Attendee',
    calendar_attendee: 'Calendar',
    email_participant: 'Email'
  }[candidate.type] || 'Contact';

  // Get color based on recency score
  const getRecencyColor = (score: number) => {
    if (score >= 70) return 'text-green-500 dark:text-green-400';
    if (score >= 40) return 'text-yellow-500 dark:text-yellow-400';
    return 'text-gray-400 dark:text-gray-500';
  };

  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      onClick={onSelect}
      className={cn(
        'w-full text-left p-4 rounded-lg border transition-all duration-200',
        'bg-white dark:bg-gray-800/60',
        'border-gray-200 dark:border-gray-700/50',
        'hover:border-blue-400 dark:hover:border-blue-500/50',
        'hover:shadow-md dark:hover:shadow-blue-500/5',
        'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
        'group cursor-pointer'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-semibold text-white">
            {candidate.first_name?.[0]?.toUpperCase() || 'U'}
            {candidate.last_name?.[0]?.toUpperCase() || ''}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Name and source */}
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate">
              {candidate.full_name}
            </h4>
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex-shrink-0">
              {sourceLabel}
            </span>
          </div>

          {/* Title and company */}
          {(candidate.title || candidate.company_name) && (
            <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 mb-2">
              {candidate.title && <span className="truncate">{candidate.title}</span>}
              {candidate.title && candidate.company_name && <span>at</span>}
              {candidate.company_name && (
                <span className="flex items-center gap-1 truncate">
                  <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                  {candidate.company_name}
                </span>
              )}
            </div>
          )}

          {/* Contact info */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-2">
            {candidate.email && (
              <span className="flex items-center gap-1 truncate max-w-[200px]">
                <Mail className="w-3 h-3 flex-shrink-0" />
                {candidate.email}
              </span>
            )}
            {candidate.phone && (
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3 flex-shrink-0" />
                {candidate.phone}
              </span>
            )}
          </div>

          {/* Last interaction */}
          <div className="flex items-center gap-2 text-xs">
            <Clock className={cn('w-3 h-3', getRecencyColor(candidate.recency_score))} />
            <span className="text-gray-500 dark:text-gray-400">
              {candidate.last_interaction_type && (
                <>
                  <InteractionIcon
                    type={candidate.last_interaction_type}
                    className="inline-block mr-1 -mt-0.5"
                  />
                </>
              )}
              {formattedLastInteraction}
              {candidate.last_interaction_description && (
                <span className="text-gray-400 dark:text-gray-500 ml-1">
                  — {candidate.last_interaction_description}
                </span>
              )}
            </span>
          </div>

          {/* Recent interactions preview */}
          {candidate.recent_interactions && candidate.recent_interactions.length > 0 && (
            <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-700/50">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                Recent Activity:
              </div>
              <div className="space-y-1">
                {candidate.recent_interactions.slice(0, 2).map((interaction, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400"
                  >
                    <InteractionIcon
                      type={interaction.type}
                      className="flex-shrink-0 mt-0.5 text-gray-400"
                    />
                    <div className="min-w-0">
                      <span className="font-medium">{interaction.title}</span>
                      {interaction.snippet && (
                        <p className="text-gray-400 dark:text-gray-500 truncate">
                          {interaction.snippet}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Select indicator */}
        <div className="flex-shrink-0 self-center">
          <ChevronRight className="w-5 h-5 text-gray-300 dark:text-gray-600 group-hover:text-blue-500 transition-colors" />
        </div>
      </div>

      {/* CRM link */}
      {candidate.crm_url && (
        <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-700/50">
          <a
            href={candidate.crm_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            View in CRM
          </a>
        </div>
      )}
    </motion.button>
  );
};

/**
 * Entity Disambiguation Response Component
 *
 * Displays when the AI finds multiple contacts matching a name and needs
 * the user to select which one they meant.
 */
export const EntityDisambiguationResponse: React.FC<EntityDisambiguationResponseProps> = ({
  data,
  onSelect
}) => {
  const { sendMessage } = useCopilot();

  const handleSelect = async (candidate: EntityCandidate) => {
    // If custom handler provided, use that
    if (onSelect) {
      onSelect(candidate);
      return;
    }

    // Otherwise, send a follow-up message to the copilot
    const selectionMessage = candidate.email
      ? `I mean ${candidate.full_name} (${candidate.email})`
      : candidate.company_name
        ? `I mean ${candidate.full_name} from ${candidate.company_name}`
        : `I mean ${candidate.full_name}`;

    await sendMessage(selectionMessage);
  };

  if (!data.candidates || data.candidates.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
        <User className="w-4 h-4" />
        <span>
          I found {data.candidates.length} people named "{data.name_searched}". Which one did you mean?
        </span>
      </div>

      {/* Candidate cards */}
      <div className="space-y-2">
        {data.candidates.map((candidate, index) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            index={index}
            onSelect={() => handleSelect(candidate)}
          />
        ))}
      </div>

      {/* Help text */}
      <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
        Click on a contact to select them, or provide more details in your message.
      </p>
    </div>
  );
};

export default EntityDisambiguationResponse;
