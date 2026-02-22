// 5 fictional deals at various pipeline stages

export interface DemoDeal {
  id: string;
  name: string;
  company: string;
  value: number;
  stage: string;
  daysInStage: number;
  daysInPipeline: number;
  closeDate: string;
  health: 'on_track' | 'at_risk' | 'off_track';
  temperature: number;
  temperatureTrend: 'rising' | 'stable' | 'falling';
  riskScore: number;
  contacts: string[];
  lastActivity: string;
  nextStep: string;
  tags?: string[];
}

export const deals: DemoDeal[] = [
  {
    id: 'deal-1',
    name: 'DataFlow Inc — AI Support Transformation',
    company: 'DataFlow Inc',
    value: 95000,
    stage: 'Negotiation',
    daysInStage: 5,
    daysInPipeline: 45,
    closeDate: '2026-04-05',
    health: 'on_track',
    temperature: 0.78,
    temperatureTrend: 'rising',
    riskScore: 22,
    contacts: ['Jake Torres', 'Lisa Park'],
    lastActivity: 'Demo call — today',
    nextStep: 'Send Jira integration docs',
    tags: ['NEW_STAGE'],
  },
  {
    id: 'deal-2',
    name: 'CloudBase Technologies — Support Automation',
    company: 'CloudBase Technologies',
    value: 72000,
    stage: 'Proposal',
    daysInStage: 18,
    daysInPipeline: 52,
    closeDate: '2026-03-28',
    health: 'at_risk',
    temperature: 0.32,
    temperatureTrend: 'falling',
    riskScore: 68,
    contacts: ['Maria Chen'],
    lastActivity: 'Email sent — 14 days ago',
    nextStep: 'Re-engage champion',
    tags: ['STALE'],
  },
  {
    id: 'deal-3',
    name: 'Meridian Group — CX Platform Migration',
    company: 'Meridian Group',
    value: 22000,
    stage: 'Proposal',
    daysInStage: 18,
    daysInPipeline: 35,
    closeDate: '2026-03-15',
    health: 'at_risk',
    temperature: 0.41,
    temperatureTrend: 'stable',
    riskScore: 55,
    contacts: ['Tom Richards', 'Emma Wallace'],
    lastActivity: 'Proposal sent — 18 days ago',
    nextStep: 'Follow up on proposal',
  },
  {
    id: 'deal-4',
    name: 'Pinnacle Partners — Enterprise Support Suite',
    company: 'Pinnacle Partners',
    value: 45000,
    stage: 'Closed Lost',
    daysInStage: 32,
    daysInPipeline: 78,
    closeDate: '2026-01-20',
    health: 'off_track',
    temperature: 0.12,
    temperatureTrend: 'falling',
    riskScore: 92,
    contacts: ['David Kim'],
    lastActivity: 'Lost — budget concerns',
    nextStep: 'Monitor for re-engagement signals',
  },
  {
    id: 'deal-5',
    name: 'TechVault — Discovery Phase',
    company: 'TechVault',
    value: 38000,
    stage: 'Discovery',
    daysInStage: 8,
    daysInPipeline: 8,
    closeDate: '2026-05-01',
    health: 'on_track',
    temperature: 0.55,
    temperatureTrend: 'rising',
    riskScore: 15,
    contacts: ['Rachel Adams', 'Ben Foster'],
    lastActivity: 'Discovery call — 2 days ago',
    nextStep: 'Schedule technical deep-dive',
    tags: ['NEW'],
  },
];

export const pipelineSummary = {
  totalValue: 272000,
  weightedValue: 89400,
  dealCount: 5,
  activeCount: 4,
  atRiskCount: 2,
  closingThisWeek: [deals[0], deals[2]],
  signalWatch: {
    heatingUp: [
      { deal: 'DataFlow Inc', delta: '+0.3', temperature: 0.78 },
      { deal: 'TechVault', delta: '+0.15', temperature: 0.55 },
    ],
    coolingDown: [
      { deal: 'CloudBase Technologies', delta: '-0.22', temperature: 0.32 },
    ],
  },
};

export const pipelineByStage = [
  { stage: 'Discovery', count: 1, value: 38000 },
  { stage: 'Qualification', count: 0, value: 0 },
  { stage: 'Proposal', count: 2, value: 94000 },
  { stage: 'Negotiation', count: 1, value: 95000 },
  { stage: 'Closed Won', count: 0, value: 0 },
  { stage: 'Closed Lost', count: 1, value: 45000 },
];
