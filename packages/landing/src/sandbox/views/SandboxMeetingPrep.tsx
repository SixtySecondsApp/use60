/**
 * SandboxMeetingPrep
 *
 * AI-generated meeting preparation doc for the visitor's company.
 */

import { motion } from 'framer-motion';
import {
  Video,
  MessageSquare,
  AlertTriangle,
  HelpCircle,
  Briefcase,
  Building2,
  Clock,
  Users,
  Sparkles,
} from 'lucide-react';
import { useSandboxData } from '../data/SandboxDataProvider';

const stagger = {
  animate: {
    transition: { staggerChildren: 0.06 },
  },
};

const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
};

export default function SandboxMeetingPrep() {
  const { data } = useSandboxData();

  // Find the primary deal meeting (first meeting with prep data, or first overall)
  const meeting = data.meetings.find((m) => m.prep) ?? data.meetings[0];
  const prep = meeting?.prep;

  if (!meeting) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">
        No upcoming meetings
      </div>
    );
  }

  const meetingDate = new Date(meeting.meeting_start);
  const timeStr = meetingDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const dateStr = meetingDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-5 max-w-3xl">
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <span className="text-[10px] font-mono text-violet-400 uppercase tracking-wider">
              AI Meeting Prep
            </span>
          </div>
          <h2 className="text-xl font-bold text-white">{meeting.title}</h2>
          <div className="flex items-center gap-3 mt-2 text-sm text-zinc-500">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {dateStr} at {timeStr}
            </span>
            <span className="flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5" />
              {meeting.duration_minutes}m
            </span>
          </div>
        </div>
      </motion.div>

      {/* Attendees */}
      <motion.div variants={fadeUp} className="bg-zinc-900/80 border border-white/[0.06] rounded-xl p-4">
        <h3 className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          <Users className="w-3.5 h-3.5" />
          Attendees
        </h3>
        <div className="flex flex-wrap gap-2">
          {meeting.attendees.map((attendee, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]"
            >
              <div className="w-8 h-8 rounded-full bg-violet-500/15 flex items-center justify-center">
                <span className="text-xs font-semibold text-violet-400">
                  {attendee.name.split(' ').map(n => n[0]).join('')}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-white">{attendee.name}</p>
                <p className="text-[11px] text-zinc-500">
                  {attendee.title}{attendee.company ? ` · ${attendee.company}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Company Overview */}
      {prep?.company_overview && (
        <motion.div variants={fadeUp} className="bg-zinc-900/80 border border-white/[0.06] rounded-xl p-4">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            <Building2 className="w-3.5 h-3.5" />
            Company Context
          </h3>
          <p className="text-sm text-zinc-300 leading-relaxed">{prep.company_overview}</p>
        </motion.div>
      )}

      {/* Talking Points */}
      {prep?.talking_points && prep.talking_points.length > 0 && (
        <motion.div variants={fadeUp} className="bg-zinc-900/80 border border-white/[0.06] rounded-xl p-4">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            <MessageSquare className="w-3.5 h-3.5" />
            Talking Points
          </h3>
          <div className="space-y-2">
            {prep.talking_points.map((point, i) => (
              <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <div className="w-5 h-5 rounded-md bg-violet-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-violet-400">{i + 1}</span>
                </div>
                <p className="text-sm text-zinc-300 leading-relaxed">{point}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Risk Signals */}
      {prep?.risk_signals && prep.risk_signals.length > 0 && (
        <motion.div variants={fadeUp} className="bg-zinc-900/80 border border-amber-500/10 rounded-xl p-4">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3">
            <AlertTriangle className="w-3.5 h-3.5" />
            Risk Signals
          </h3>
          <div className="space-y-2">
            {prep.risk_signals.map((signal, i) => (
              <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-amber-500/[0.04] border border-amber-500/[0.08]">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-400/80 leading-relaxed">{signal}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Questions to Ask */}
      {prep?.questions_to_ask && prep.questions_to_ask.length > 0 && (
        <motion.div variants={fadeUp} className="bg-zinc-900/80 border border-white/[0.06] rounded-xl p-4">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            <HelpCircle className="w-3.5 h-3.5" />
            Questions to Ask
          </h3>
          <div className="space-y-2">
            {prep.questions_to_ask.map((q, i) => (
              <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <HelpCircle className="w-3.5 h-3.5 text-teal-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-zinc-300 leading-relaxed">{q}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Deal Context */}
      {prep?.deal_context && (
        <motion.div variants={fadeUp} className="bg-zinc-900/80 border border-white/[0.06] rounded-xl p-4">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            <Briefcase className="w-3.5 h-3.5" />
            Deal Context
          </h3>
          <p className="text-sm text-zinc-300 leading-relaxed">{prep.deal_context}</p>
        </motion.div>
      )}
    </motion.div>
  );
}
