// src/components/demo/acts/Act1BeforeSixty.tsx
// Act 1: Before/After split-view — pain state vs transformed state.
// The "After" panel starts blurred and is revealed in Act 5 via RevealAfterPanel.

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Inbox,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Pencil,
  Shield,
  Sparkles,
  StickyNote,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { SlackMessagePreview } from '../SlackMessagePreview';

// ---------------------------------------------------------------------------
// Before panel mock data
// ---------------------------------------------------------------------------

const crmRows = [
  { company: 'DataFlow Inc', stage: 'Negotia...', value: '$95,000', updated: '3 days ago', overdue: true },
  { company: 'CloudBase', stage: 'Proposal', value: '$72,000', updated: '14 days ago', overdue: true },
  { company: 'Meridian Grp', stage: '???', value: '$22,000', updated: '18 days ago', overdue: true },
  { company: 'TechVault', stage: 'Discovery', value: '$38K', updated: '2 days ago', overdue: false },
];

const inboxItems = [
  'RE: RE: RE: Pricing follow-up',
  'Intro: Jake Torres <> Sarah',
  'Q1 forecast spreadsheet — v4 FINAL (2)',
  'Meeting recap — CloudBase demo',
  'FW: Contract redline from legal',
  'Vendor invoice #4821',
  'RE: Can we move the call to Thursday?',
];

const calendarItems = [
  { time: '09:00', title: 'DataFlow Inc — Demo Call', prep: false },
  { time: '10:30', title: 'Internal pipeline review', prep: false },
  { time: '12:00', title: 'CloudBase Technologies check-in', prep: false },
  { time: '14:00', title: 'TechVault discovery call', prep: false },
  { time: '15:30', title: '1:1 with James (Manager)', prep: false },
  { time: '17:00', title: 'Meridian Group follow-up', prep: false },
];

const followUps = [
  'Follow up with Acme???',
  'Send proposal -- when?',
  'Who was that VP?',
  'Check pricing with finance',
  'Call back re: contract',
];

// ---------------------------------------------------------------------------
// After panel mock data (clean/transformed)
// ---------------------------------------------------------------------------

const afterCrmRows = [
  { company: 'DataFlow Inc', stage: 'Negotiation', value: '$95,000', health: 'on_track' as const, auto: true },
  { company: 'CloudBase', stage: 'At Risk', value: '$72,000', health: 'at_risk' as const, auto: true },
  { company: 'Meridian Grp', stage: 'Proposal', value: '$22,000', health: 'at_risk' as const, auto: true },
  { company: 'TechVault', stage: 'Discovery', value: '$38,000', health: 'on_track' as const, auto: true },
];

const afterInboxItems = [
  { subject: 'Jake Torres — intro', tag: 'Champion', priority: 'high' as const },
  { subject: 'Contract redline', tag: 'Legal', priority: 'high' as const },
  { subject: 'Pricing follow-up', tag: 'Deal', priority: 'medium' as const },
  { subject: 'Q1 forecast v4', tag: 'Internal', priority: 'low' as const },
];

const afterCalendar = [
  { time: '09:00', title: 'DataFlow Demo', prepped: true, brief: 'Stakeholder map + objections ready' },
  { time: '10:30', title: 'Pipeline Review', prepped: true, brief: 'Auto-generated deck attached' },
  { time: '14:00', title: 'TechVault Discovery', prepped: true, brief: 'ICP match analysis prepared' },
];

const afterFollowUps = [
  { text: 'Send Jira docs to Jake Torres', status: 'draft_ready' as const },
  { text: 'Re-engage Maria Chen (CloudBase)', status: 'draft_ready' as const },
  { text: 'Follow up on Meridian proposal', status: 'scheduled' as const },
];

// ---------------------------------------------------------------------------
// Shared card wrapper
// ---------------------------------------------------------------------------

function PanelCard({
  icon,
  title,
  badge,
  children,
  desaturated = false,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  desaturated?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        desaturated
          ? 'bg-gray-50 border-gray-200'
          : 'bg-white border-gray-200'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          {icon}
          {title}
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Before panel
// ---------------------------------------------------------------------------

function BeforePanel() {
  return (
    <div className="space-y-3">
      {/* CRM Dashboard */}
      <PanelCard
        icon={<LayoutDashboard className="w-4 h-4 text-gray-400" />}
        title="CRM Dashboard"
        badge={
          <span className="text-[10px] text-gray-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Last updated: 3 days ago
          </span>
        }
        desaturated
      >
        <div className="overflow-hidden rounded border border-gray-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-100 text-gray-500">
                <th className="text-left py-1 px-2 font-medium">Company</th>
                <th className="text-left py-1 px-2 font-medium">Stage</th>
                <th className="text-left py-1 px-2 font-medium">Value</th>
                <th className="text-left py-1 px-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {crmRows.map((r) => (
                <tr key={r.company} className="border-t border-gray-100">
                  <td className="py-1 px-2 text-gray-600">{r.company}</td>
                  <td className="py-1 px-2 text-gray-600">{r.stage}</td>
                  <td className="py-1 px-2 text-gray-600">{r.value}</td>
                  <td className="py-1 px-2">
                    <span className={`flex items-center gap-1 ${r.overdue ? 'text-red-500' : 'text-gray-400'}`}>
                      {r.overdue && <AlertTriangle className="w-3 h-3" />}
                      {r.updated}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelCard>

      {/* Inbox */}
      <PanelCard
        icon={<Inbox className="w-4 h-4 text-gray-400" />}
        title="Inbox"
        badge={
          <span className="bg-red-100 text-red-600 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
            47 unread
          </span>
        }
        desaturated
      >
        <div className="space-y-1">
          {inboxItems.map((item) => (
            <div key={item} className="flex items-center gap-2 text-xs text-gray-500 py-0.5">
              <Mail className="w-3 h-3 text-gray-300 shrink-0" />
              <span className="truncate">{item}</span>
            </div>
          ))}
        </div>
      </PanelCard>

      {/* Calendar */}
      <PanelCard
        icon={<Calendar className="w-4 h-4 text-gray-400" />}
        title="Today's Meetings"
        badge={
          <span className="text-[10px] text-gray-400">6 meetings</span>
        }
        desaturated
      >
        <div className="space-y-1">
          {calendarItems.map((item) => (
            <div key={item.time} className="flex items-center justify-between text-xs py-0.5">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 font-mono w-10">{item.time}</span>
                <span className="text-gray-600 truncate">{item.title}</span>
              </div>
              <span className="text-[10px] text-orange-400 bg-orange-50 px-1.5 py-0.5 rounded shrink-0">
                No prep available
              </span>
            </div>
          ))}
        </div>
      </PanelCard>

      {/* Follow-ups (sticky note feel) */}
      <PanelCard
        icon={<StickyNote className="w-4 h-4 text-yellow-500" />}
        title="Follow-ups"
        desaturated
      >
        <div className="bg-yellow-50 border border-yellow-200 rounded p-2 space-y-1.5">
          {followUps.map((item) => (
            <div key={item} className="flex items-start gap-1.5 text-xs text-yellow-800">
              <Pencil className="w-3 h-3 mt-0.5 text-yellow-500 shrink-0" />
              <span className="italic">{item}</span>
            </div>
          ))}
        </div>
      </PanelCard>

      {/* Manager Slack message */}
      <SlackMessagePreview
        botName="James (Manager)"
        timestamp="4:47 PM"
        blocks={[
          {
            type: 'section',
            text: "Where's the forecast update? Need it by EOD. Board meeting tomorrow and I'm flying blind on pipeline numbers.",
          },
          {
            type: 'context',
            text: 'Sent in #sales-team',
          },
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// After panel
// ---------------------------------------------------------------------------

const healthColors = {
  on_track: 'bg-emerald-100 text-emerald-700',
  at_risk: 'bg-amber-100 text-amber-700',
  off_track: 'bg-red-100 text-red-700',
};

const healthLabels = {
  on_track: 'Healthy',
  at_risk: 'At Risk',
  off_track: 'Off Track',
};

const priorityColors = {
  high: 'bg-red-100 text-red-600',
  medium: 'bg-amber-100 text-amber-600',
  low: 'bg-gray-100 text-gray-500',
};

function AfterPanel() {
  return (
    <div className="space-y-3">
      {/* CRM Dashboard — auto-synced */}
      <PanelCard
        icon={<LayoutDashboard className="w-4 h-4 text-violet-500" />}
        title="CRM Dashboard"
        badge={
          <span className="text-[10px] text-emerald-500 flex items-center gap-1">
            <Zap className="w-3 h-3" />
            Auto-synced just now
          </span>
        }
      >
        <div className="overflow-hidden rounded border border-gray-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-violet-50 text-violet-600">
                <th className="text-left py-1 px-2 font-medium">Company</th>
                <th className="text-left py-1 px-2 font-medium">Stage</th>
                <th className="text-left py-1 px-2 font-medium">Value</th>
                <th className="text-left py-1 px-2 font-medium">Health</th>
              </tr>
            </thead>
            <tbody>
              {afterCrmRows.map((r) => (
                <tr key={r.company} className="border-t border-gray-100">
                  <td className="py-1 px-2 text-gray-700 font-medium">{r.company}</td>
                  <td className="py-1 px-2 text-gray-600">{r.stage}</td>
                  <td className="py-1 px-2 text-gray-600">{r.value}</td>
                  <td className="py-1 px-2">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${healthColors[r.health]}`}>
                      {healthLabels[r.health]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelCard>

      {/* Inbox — classified */}
      <PanelCard
        icon={<Inbox className="w-4 h-4 text-violet-500" />}
        title="Inbox"
        badge={
          <span className="bg-violet-100 text-violet-600 text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            4 prioritized
          </span>
        }
      >
        <div className="space-y-1">
          {afterInboxItems.map((item) => (
            <div key={item.subject} className="flex items-center justify-between text-xs py-0.5">
              <div className="flex items-center gap-2">
                <Mail className="w-3 h-3 text-violet-400 shrink-0" />
                <span className="text-gray-700">{item.subject}</span>
                <span className="text-[10px] text-violet-500 bg-violet-50 px-1 py-0.5 rounded">
                  {item.tag}
                </span>
              </div>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${priorityColors[item.priority]}`}>
                {item.priority}
              </span>
            </div>
          ))}
        </div>
      </PanelCard>

      {/* Calendar — prepped */}
      <PanelCard
        icon={<Calendar className="w-4 h-4 text-violet-500" />}
        title="Today's Meetings"
        badge={
          <span className="text-[10px] text-emerald-500 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            All prepped
          </span>
        }
      >
        <div className="space-y-1.5">
          {afterCalendar.map((item) => (
            <div key={item.time} className="text-xs py-0.5">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 font-mono w-10">{item.time}</span>
                <span className="text-gray-700 font-medium">{item.title}</span>
                <span className="text-[10px] text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0">
                  Prepped
                </span>
              </div>
              <div className="ml-12 text-[10px] text-gray-400 mt-0.5">{item.brief}</div>
            </div>
          ))}
        </div>
      </PanelCard>

      {/* Follow-ups — auto-drafted */}
      <PanelCard
        icon={<Zap className="w-4 h-4 text-violet-500" />}
        title="Follow-ups"
        badge={
          <span className="text-[10px] text-violet-500 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Auto-drafted
          </span>
        }
      >
        <div className="space-y-1.5">
          {afterFollowUps.map((item) => (
            <div key={item.text} className="flex items-center justify-between text-xs py-0.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="text-gray-700">{item.text}</span>
              </div>
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  item.status === 'draft_ready'
                    ? 'bg-violet-100 text-violet-600'
                    : 'bg-emerald-100 text-emerald-600'
                }`}
              >
                {item.status === 'draft_ready' ? 'Draft Ready' : 'Scheduled'}
              </span>
            </div>
          ))}
        </div>
      </PanelCard>

      {/* Slack — proactive forecast update */}
      <SlackMessagePreview
        botName="60 Sales Copilot"
        timestamp="4:45 PM"
        blocks={[
          {
            type: 'header',
            text: 'Forecast Update — Auto-Generated',
          },
          {
            type: 'section',
            text: "I've compiled your Q1 forecast based on today's pipeline activity.",
            fields: [
              { label: 'Weighted Pipeline', value: '**$89,400**' },
              { label: 'Coverage Ratio', value: '**2.1x** (target: 3.0x)' },
              { label: 'At Risk', value: '**$94K** across 2 deals' },
              { label: 'Closing This Week', value: '**2 deals** ($117K)' },
            ],
          },
          {
            type: 'actions',
            buttons: [
              { text: 'Send to James', style: 'primary' },
              { text: 'Edit First', style: 'default' },
            ],
          },
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// RevealAfterPanel — exported for Act 5 to trigger the unblur
// ---------------------------------------------------------------------------

export function RevealAfterPanel({
  revealed,
  onReveal,
}: {
  revealed: boolean;
  onReveal: () => void;
}) {
  return (
    <div className="relative">
      <motion.div
        animate={{
          filter: revealed ? 'blur(0px)' : 'blur(8px)',
          opacity: revealed ? 1 : 0.5,
        }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        <AfterPanel />
      </motion.div>

      {/* Reveal overlay button */}
      <AnimatePresence>
        {!revealed && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <button
              onClick={onReveal}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold shadow-lg transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Reveal the After
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Act1BeforeSixty() {
  const [afterRevealed, setAfterRevealed] = useState(false);

  const handleReveal = useCallback(() => setAfterRevealed(true), []);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Split-view header */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Before header */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-400" />
          <h2 className="text-lg font-bold text-gray-300">Before 60</h2>
          <span className="text-xs text-gray-500 ml-auto">Manual, reactive, behind</span>
        </div>
        {/* After header */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-violet-400" />
          <h2 className="text-lg font-bold text-gray-300">After 60</h2>
          <span className="text-xs text-gray-500 ml-auto">Automated, proactive, ahead</span>
        </div>
      </div>

      {/* Split panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left — Before (slightly desaturated) */}
        <div className="space-y-0" style={{ filter: 'saturate(0.7)' }}>
          <BeforePanel />
        </div>

        {/* Right — After (blurred until revealed) */}
        <RevealAfterPanel revealed={afterRevealed} onReveal={handleReveal} />
      </div>

      {/* Bottom quote banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        className="bg-gradient-to-r from-violet-900/30 to-purple-900/30 border border-violet-700/30 rounded-xl p-5 text-center"
      >
        <p className="text-gray-300 text-sm md:text-base italic leading-relaxed">
          "What if your CRM updated itself, your meetings prepped themselves, and your pipeline told you what to do next?"
        </p>
      </motion.div>
    </div>
  );
}
