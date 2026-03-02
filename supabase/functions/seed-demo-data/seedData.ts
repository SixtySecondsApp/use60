// supabase/functions/seed-demo-data/seedData.ts
// Static seed data constants for the demo data seeding function.
// All data is realistic B2B companies across diverse industries.

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

export interface SeedCompany {
  name: string;
  domain: string;
  industry: string;
  size: 'startup' | 'small' | 'medium' | 'large' | 'enterprise';
  website: string;
  description: string;
  linkedin_url: string;
}

export const COMPANIES: SeedCompany[] = [
  {
    name: 'Meridian Analytics',
    domain: 'meridiananalytics.io',
    industry: 'SaaS / Business Intelligence',
    size: 'medium',
    website: 'https://meridiananalytics.io',
    description: 'Revenue intelligence platform that turns raw CRM data into predictive forecasts and pipeline health scores for B2B sales teams.',
    linkedin_url: 'https://linkedin.com/company/meridian-analytics',
  },
  {
    name: 'ClearPath Finance',
    domain: 'clearpathfinance.com',
    industry: 'Fintech',
    size: 'small',
    website: 'https://clearpathfinance.com',
    description: 'Embedded lending and working-capital solutions for SMBs, delivered via API directly into accounting and ERP platforms.',
    linkedin_url: 'https://linkedin.com/company/clearpath-finance',
  },
  {
    name: 'Vantage Health Systems',
    domain: 'vantagehealthsystems.com',
    industry: 'Healthcare Technology',
    size: 'large',
    website: 'https://vantagehealthsystems.com',
    description: 'Clinical workflow automation software used by 400+ hospitals to reduce admin burden on nursing staff and cut patient discharge times.',
    linkedin_url: 'https://linkedin.com/company/vantage-health-systems',
  },
  {
    name: 'Forge Manufacturing Co.',
    domain: 'forgemfg.com',
    industry: 'Manufacturing',
    size: 'medium',
    website: 'https://forgemfg.com',
    description: 'Precision contract manufacturer specialising in aerospace and defence components. AS9100-certified, 320 employees across two facilities.',
    linkedin_url: 'https://linkedin.com/company/forge-manufacturing-co',
  },
  {
    name: 'ShipStream Logistics',
    domain: 'shipstream.io',
    industry: 'Logistics & Supply Chain',
    size: 'medium',
    website: 'https://shipstream.io',
    description: 'Last-mile delivery orchestration platform connecting e-commerce brands to a network of regional carriers with real-time tracking and dynamic routing.',
    linkedin_url: 'https://linkedin.com/company/shipstream-logistics',
  },
  {
    name: 'Amplify Creative Agency',
    domain: 'amplifycreative.co',
    industry: 'Marketing & Creative Services',
    size: 'small',
    website: 'https://amplifycreative.co',
    description: 'Full-service B2B demand generation agency specialising in content, ABM campaigns, and paid media for SaaS and professional services firms.',
    linkedin_url: 'https://linkedin.com/company/amplify-creative-agency',
  },
  {
    name: 'Nexus Cybersecurity',
    domain: 'nexuscybersec.com',
    industry: 'Cybersecurity',
    size: 'startup',
    website: 'https://nexuscybersec.com',
    description: 'Zero-trust endpoint protection startup offering automated threat detection and response for mid-market companies that cannot afford a full SOC team.',
    linkedin_url: 'https://linkedin.com/company/nexus-cybersecurity',
  },
  {
    name: 'Verdant PropTech',
    domain: 'verdantproptech.com',
    industry: 'Real Estate Technology',
    size: 'small',
    website: 'https://verdantproptech.com',
    description: 'Intelligent property management suite automating lease renewals, maintenance scheduling, and tenant communications for commercial landlords.',
    linkedin_url: 'https://linkedin.com/company/verdant-proptech',
  },
  {
    name: 'Orion Enterprise Software',
    domain: 'orionenterprise.com',
    industry: 'Enterprise Software / ERP',
    size: 'enterprise',
    website: 'https://orionenterprise.com',
    description: 'Legacy ERP vendor modernising its platform with a modular cloud architecture. 2,000 enterprise clients across manufacturing, retail, and utilities.',
    linkedin_url: 'https://linkedin.com/company/orion-enterprise-software',
  },
  {
    name: 'BrightPath EdTech',
    domain: 'brightpathedtech.com',
    industry: 'Education Technology',
    size: 'startup',
    website: 'https://brightpathedtech.com',
    description: 'Corporate learning and upskilling platform using adaptive AI to personalise training paths for sales, customer success, and operations teams.',
    linkedin_url: 'https://linkedin.com/company/brightpath-edtech',
  },
];

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export interface SeedContact {
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  title: string;
  company: string; // company name string (matches COMPANIES[companyIndex].name)
  phone: string;
  linkedin_url: string;
  engagement_level: 'low' | 'medium' | 'high';
  source: 'manual' | 'meeting' | 'enrichment';
  companyIndex: number; // index into COMPANIES array
  is_primary: boolean;
}

export const CONTACTS: SeedContact[] = [
  // Meridian Analytics (index 0) — 3 contacts
  {
    email: 'sarah.chen@meridiananalytics.io',
    first_name: 'Sarah',
    last_name: 'Chen',
    full_name: 'Sarah Chen',
    title: 'VP of Sales',
    company: 'Meridian Analytics',
    phone: '+1 415 555 0191',
    linkedin_url: 'https://linkedin.com/in/sarahchen-meridian',
    engagement_level: 'high',
    source: 'meeting',
    companyIndex: 0,
    is_primary: true,
  },
  {
    email: 'james.okafor@meridiananalytics.io',
    first_name: 'James',
    last_name: 'Okafor',
    full_name: 'James Okafor',
    title: 'Chief Revenue Officer',
    company: 'Meridian Analytics',
    phone: '+1 415 555 0142',
    linkedin_url: 'https://linkedin.com/in/jamesokafor',
    engagement_level: 'medium',
    source: 'enrichment',
    companyIndex: 0,
    is_primary: false,
  },
  {
    email: 'priya.nair@meridiananalytics.io',
    first_name: 'Priya',
    last_name: 'Nair',
    full_name: 'Priya Nair',
    title: 'Head of Revenue Operations',
    company: 'Meridian Analytics',
    phone: '+1 415 555 0177',
    linkedin_url: 'https://linkedin.com/in/priyanair-revops',
    engagement_level: 'low',
    source: 'manual',
    companyIndex: 0,
    is_primary: false,
  },

  // ClearPath Finance (index 1) — 3 contacts
  {
    email: 'tom.bradshaw@clearpathfinance.com',
    first_name: 'Tom',
    last_name: 'Bradshaw',
    full_name: 'Tom Bradshaw',
    title: 'CEO & Co-Founder',
    company: 'ClearPath Finance',
    phone: '+44 207 555 0283',
    linkedin_url: 'https://linkedin.com/in/tombradshaw-clearpath',
    engagement_level: 'high',
    source: 'meeting',
    companyIndex: 1,
    is_primary: true,
  },
  {
    email: 'emily.walsh@clearpathfinance.com',
    first_name: 'Emily',
    last_name: 'Walsh',
    full_name: 'Emily Walsh',
    title: 'CFO',
    company: 'ClearPath Finance',
    phone: '+44 207 555 0264',
    linkedin_url: 'https://linkedin.com/in/emilywalsh-cfo',
    engagement_level: 'medium',
    source: 'enrichment',
    companyIndex: 1,
    is_primary: false,
  },
  {
    email: 'raj.mehta@clearpathfinance.com',
    first_name: 'Raj',
    last_name: 'Mehta',
    full_name: 'Raj Mehta',
    title: 'Head of Partnerships',
    company: 'ClearPath Finance',
    phone: '+44 207 555 0251',
    linkedin_url: 'https://linkedin.com/in/rajmehta-finance',
    engagement_level: 'low',
    source: 'manual',
    companyIndex: 1,
    is_primary: false,
  },

  // Vantage Health Systems (index 2) — 4 contacts
  {
    email: 'dr.lisa.hartmann@vantagehealthsystems.com',
    first_name: 'Lisa',
    last_name: 'Hartmann',
    full_name: 'Lisa Hartmann',
    title: 'Chief Medical Officer',
    company: 'Vantage Health Systems',
    phone: '+1 312 555 0334',
    linkedin_url: 'https://linkedin.com/in/drlisahartmann',
    engagement_level: 'high',
    source: 'meeting',
    companyIndex: 2,
    is_primary: true,
  },
  {
    email: 'marcus.bell@vantagehealthsystems.com',
    first_name: 'Marcus',
    last_name: 'Bell',
    full_name: 'Marcus Bell',
    title: 'VP of Procurement',
    company: 'Vantage Health Systems',
    phone: '+1 312 555 0312',
    linkedin_url: 'https://linkedin.com/in/marcusbell-vantage',
    engagement_level: 'medium',
    source: 'meeting',
    companyIndex: 2,
    is_primary: false,
  },
  {
    email: 'nina.torres@vantagehealthsystems.com',
    first_name: 'Nina',
    last_name: 'Torres',
    full_name: 'Nina Torres',
    title: 'Director of IT',
    company: 'Vantage Health Systems',
    phone: '+1 312 555 0398',
    linkedin_url: 'https://linkedin.com/in/ninatorres-healthtech',
    engagement_level: 'medium',
    source: 'enrichment',
    companyIndex: 2,
    is_primary: false,
  },
  {
    email: 'charles.wu@vantagehealthsystems.com',
    first_name: 'Charles',
    last_name: 'Wu',
    full_name: 'Charles Wu',
    title: 'Legal Counsel',
    company: 'Vantage Health Systems',
    phone: '+1 312 555 0371',
    linkedin_url: 'https://linkedin.com/in/charleswu-legal',
    engagement_level: 'low',
    source: 'manual',
    companyIndex: 2,
    is_primary: false,
  },

  // Forge Manufacturing (index 3) — 3 contacts
  {
    email: 'david.kowalski@forgemfg.com',
    first_name: 'David',
    last_name: 'Kowalski',
    full_name: 'David Kowalski',
    title: 'President & Owner',
    company: 'Forge Manufacturing Co.',
    phone: '+1 313 555 0447',
    linkedin_url: 'https://linkedin.com/in/davidkowalski-forge',
    engagement_level: 'high',
    source: 'meeting',
    companyIndex: 3,
    is_primary: true,
  },
  {
    email: 'anna.reyes@forgemfg.com',
    first_name: 'Anna',
    last_name: 'Reyes',
    full_name: 'Anna Reyes',
    title: 'Operations Manager',
    company: 'Forge Manufacturing Co.',
    phone: '+1 313 555 0423',
    linkedin_url: 'https://linkedin.com/in/annareyes-ops',
    engagement_level: 'medium',
    source: 'enrichment',
    companyIndex: 3,
    is_primary: false,
  },
  {
    email: 'steve.porter@forgemfg.com',
    first_name: 'Steve',
    last_name: 'Porter',
    full_name: 'Steve Porter',
    title: 'Head of Supply Chain',
    company: 'Forge Manufacturing Co.',
    phone: '+1 313 555 0409',
    linkedin_url: 'https://linkedin.com/in/steveporter-supply',
    engagement_level: 'low',
    source: 'manual',
    companyIndex: 3,
    is_primary: false,
  },

  // ShipStream Logistics (index 4) — 3 contacts
  {
    email: 'claire.dubois@shipstream.io',
    first_name: 'Claire',
    last_name: 'Dubois',
    full_name: 'Claire Dubois',
    title: 'VP of Business Development',
    company: 'ShipStream Logistics',
    phone: '+1 646 555 0512',
    linkedin_url: 'https://linkedin.com/in/clairedubois-shipstream',
    engagement_level: 'high',
    source: 'meeting',
    companyIndex: 4,
    is_primary: true,
  },
  {
    email: 'michael.jones@shipstream.io',
    first_name: 'Michael',
    last_name: 'Jones',
    full_name: 'Michael Jones',
    title: 'CTO',
    company: 'ShipStream Logistics',
    phone: '+1 646 555 0534',
    linkedin_url: 'https://linkedin.com/in/michaeljones-shipstream',
    engagement_level: 'medium',
    source: 'enrichment',
    companyIndex: 4,
    is_primary: false,
  },
  {
    email: 'grace.kim@shipstream.io',
    first_name: 'Grace',
    last_name: 'Kim',
    full_name: 'Grace Kim',
    title: 'Director of Carrier Partnerships',
    company: 'ShipStream Logistics',
    phone: '+1 646 555 0567',
    linkedin_url: 'https://linkedin.com/in/gracekim-logistics',
    engagement_level: 'low',
    source: 'manual',
    companyIndex: 4,
    is_primary: false,
  },

  // Amplify Creative Agency (index 5) — 3 contacts
  {
    email: 'ben.harvey@amplifycreative.co',
    first_name: 'Ben',
    last_name: 'Harvey',
    full_name: 'Ben Harvey',
    title: 'Managing Director',
    company: 'Amplify Creative Agency',
    phone: '+44 161 555 0621',
    linkedin_url: 'https://linkedin.com/in/benharvey-amplify',
    engagement_level: 'high',
    source: 'meeting',
    companyIndex: 5,
    is_primary: true,
  },
  {
    email: 'zoe.miller@amplifycreative.co',
    first_name: 'Zoe',
    last_name: 'Miller',
    full_name: 'Zoe Miller',
    title: 'Head of Strategy',
    company: 'Amplify Creative Agency',
    phone: '+44 161 555 0643',
    linkedin_url: 'https://linkedin.com/in/zoemiller-strategy',
    engagement_level: 'medium',
    source: 'meeting',
    companyIndex: 5,
    is_primary: false,
  },
  {
    email: 'luke.patel@amplifycreative.co',
    first_name: 'Luke',
    last_name: 'Patel',
    full_name: 'Luke Patel',
    title: 'Paid Media Director',
    company: 'Amplify Creative Agency',
    phone: '+44 161 555 0678',
    linkedin_url: 'https://linkedin.com/in/lukepatel-media',
    engagement_level: 'low',
    source: 'enrichment',
    companyIndex: 5,
    is_primary: false,
  },

  // Nexus Cybersecurity (index 6) — 3 contacts
  {
    email: 'alex.ford@nexuscybersec.com',
    first_name: 'Alex',
    last_name: 'Ford',
    full_name: 'Alex Ford',
    title: 'CEO & Co-Founder',
    company: 'Nexus Cybersecurity',
    phone: '+1 512 555 0712',
    linkedin_url: 'https://linkedin.com/in/alexford-nexus',
    engagement_level: 'high',
    source: 'meeting',
    companyIndex: 6,
    is_primary: true,
  },
  {
    email: 'mia.johnson@nexuscybersec.com',
    first_name: 'Mia',
    last_name: 'Johnson',
    full_name: 'Mia Johnson',
    title: 'VP of Sales',
    company: 'Nexus Cybersecurity',
    phone: '+1 512 555 0754',
    linkedin_url: 'https://linkedin.com/in/miajohnson-cybersec',
    engagement_level: 'high',
    source: 'meeting',
    companyIndex: 6,
    is_primary: false,
  },
  {
    email: 'daniel.scott@nexuscybersec.com',
    first_name: 'Daniel',
    last_name: 'Scott',
    full_name: 'Daniel Scott',
    title: 'Chief Information Security Officer',
    company: 'Nexus Cybersecurity',
    phone: '+1 512 555 0789',
    linkedin_url: 'https://linkedin.com/in/danielscott-ciso',
    engagement_level: 'medium',
    source: 'enrichment',
    companyIndex: 6,
    is_primary: false,
  },

  // Verdant PropTech (index 7) — 3 contacts
  {
    email: 'hannah.cross@verdantproptech.com',
    first_name: 'Hannah',
    last_name: 'Cross',
    full_name: 'Hannah Cross',
    title: 'Founder & CEO',
    company: 'Verdant PropTech',
    phone: '+44 20 7555 0831',
    linkedin_url: 'https://linkedin.com/in/hannahcross-verdant',
    engagement_level: 'high',
    source: 'meeting',
    companyIndex: 7,
    is_primary: true,
  },
  {
    email: 'oliver.grant@verdantproptech.com',
    first_name: 'Oliver',
    last_name: 'Grant',
    full_name: 'Oliver Grant',
    title: 'Head of Product',
    company: 'Verdant PropTech',
    phone: '+44 20 7555 0852',
    linkedin_url: 'https://linkedin.com/in/olivergrant-product',
    engagement_level: 'medium',
    source: 'enrichment',
    companyIndex: 7,
    is_primary: false,
  },
  {
    email: 'sophie.adams@verdantproptech.com',
    first_name: 'Sophie',
    last_name: 'Adams',
    full_name: 'Sophie Adams',
    title: 'Customer Success Lead',
    company: 'Verdant PropTech',
    phone: '+44 20 7555 0874',
    linkedin_url: 'https://linkedin.com/in/sophieadams-cs',
    engagement_level: 'low',
    source: 'manual',
    companyIndex: 7,
    is_primary: false,
  },

  // Orion Enterprise Software (index 8) — 4 contacts
  {
    email: 'richard.stern@orionenterprise.com',
    first_name: 'Richard',
    last_name: 'Stern',
    full_name: 'Richard Stern',
    title: 'SVP of Enterprise Sales',
    company: 'Orion Enterprise Software',
    phone: '+1 312 555 0921',
    linkedin_url: 'https://linkedin.com/in/richardstern-orion',
    engagement_level: 'high',
    source: 'meeting',
    companyIndex: 8,
    is_primary: true,
  },
  {
    email: 'karen.hill@orionenterprise.com',
    first_name: 'Karen',
    last_name: 'Hill',
    full_name: 'Karen Hill',
    title: 'VP of Cloud Transformation',
    company: 'Orion Enterprise Software',
    phone: '+1 312 555 0943',
    linkedin_url: 'https://linkedin.com/in/karenhill-cloud',
    engagement_level: 'medium',
    source: 'meeting',
    companyIndex: 8,
    is_primary: false,
  },
  {
    email: 'peter.lam@orionenterprise.com',
    first_name: 'Peter',
    last_name: 'Lam',
    full_name: 'Peter Lam',
    title: 'Head of Partner Ecosystems',
    company: 'Orion Enterprise Software',
    phone: '+1 312 555 0967',
    linkedin_url: 'https://linkedin.com/in/peterlam-partnerships',
    engagement_level: 'medium',
    source: 'enrichment',
    companyIndex: 8,
    is_primary: false,
  },
  {
    email: 'natalie.fox@orionenterprise.com',
    first_name: 'Natalie',
    last_name: 'Fox',
    full_name: 'Natalie Fox',
    title: 'Director of Finance',
    company: 'Orion Enterprise Software',
    phone: '+1 312 555 0982',
    linkedin_url: 'https://linkedin.com/in/nataliefox-finance',
    engagement_level: 'low',
    source: 'manual',
    companyIndex: 8,
    is_primary: false,
  },

  // BrightPath EdTech (index 9) — 3 contacts
  {
    email: 'jessica.yang@brightpathedtech.com',
    first_name: 'Jessica',
    last_name: 'Yang',
    full_name: 'Jessica Yang',
    title: 'CEO & Co-Founder',
    company: 'BrightPath EdTech',
    phone: '+1 415 555 1032',
    linkedin_url: 'https://linkedin.com/in/jessicayang-brightpath',
    engagement_level: 'high',
    source: 'meeting',
    companyIndex: 9,
    is_primary: true,
  },
  {
    email: 'ryan.black@brightpathedtech.com',
    first_name: 'Ryan',
    last_name: 'Black',
    full_name: 'Ryan Black',
    title: 'VP of Sales & Partnerships',
    company: 'BrightPath EdTech',
    phone: '+1 415 555 1054',
    linkedin_url: 'https://linkedin.com/in/ryanblack-sales',
    engagement_level: 'medium',
    source: 'meeting',
    companyIndex: 9,
    is_primary: false,
  },
  {
    email: 'chloe.martin@brightpathedtech.com',
    first_name: 'Chloe',
    last_name: 'Martin',
    full_name: 'Chloe Martin',
    title: 'Head of Customer Success',
    company: 'BrightPath EdTech',
    phone: '+1 415 555 1076',
    linkedin_url: 'https://linkedin.com/in/chloemartincs',
    engagement_level: 'low',
    source: 'enrichment',
    companyIndex: 9,
    is_primary: false,
  },
];

// ---------------------------------------------------------------------------
// Pipeline Stages
// ---------------------------------------------------------------------------

export interface SeedStage {
  name: string;
  position: number;
}

export const STAGES: SeedStage[] = [
  { name: 'Lead', position: 0 },
  { name: 'Qualified', position: 1 },
  { name: 'Proposal', position: 2 },
  { name: 'Negotiation', position: 3 },
  { name: 'Closed Won', position: 4 },
];

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

export interface SeedDeal {
  name: string;
  value: number;
  one_off_revenue: number;
  monthly_mrr: number;
  stageIndex: number; // references STAGES array
  companyIndex: number; // references COMPANIES array
  status: 'active' | 'won' | 'lost';
  probability: number;
  health_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  closeDateOffsetDays: number; // negative = past, positive = future
  description: string;
  next_steps: string;
}

export const DEALS: SeedDeal[] = [
  {
    name: 'Meridian Analytics — Revenue Intelligence Platform',
    value: 48000,
    one_off_revenue: 12000,
    monthly_mrr: 3000,
    stageIndex: 3, // Negotiation
    companyIndex: 0,
    status: 'active',
    probability: 75,
    health_score: 80,
    risk_level: 'low',
    closeDateOffsetDays: 14,
    description: 'Full platform rollout across 3 sales teams. Champion is Sarah Chen (VP Sales). Budget signed off by CRO.',
    next_steps: 'Final contract review — legal redlines expected by Friday. Schedule executive sign-off call.',
  },
  {
    name: 'ClearPath Finance — API Integration & Onboarding',
    value: 22500,
    one_off_revenue: 7500,
    monthly_mrr: 1250,
    stageIndex: 2, // Proposal
    companyIndex: 1,
    status: 'active',
    probability: 55,
    health_score: 65,
    risk_level: 'medium',
    closeDateOffsetDays: 30,
    description: 'Partnership integration for embedded lending product. Tom Bradshaw is the key sponsor. Competing against one other vendor.',
    next_steps: 'Send revised proposal with volume-based pricing. Follow up on pilot results from sandbox environment.',
  },
  {
    name: 'Vantage Health Systems — Clinical Workflow Suite',
    value: 135000,
    one_off_revenue: 75000,
    monthly_mrr: 5000,
    stageIndex: 3, // Negotiation
    companyIndex: 2,
    status: 'active',
    probability: 60,
    health_score: 55,
    risk_level: 'high',
    closeDateOffsetDays: 45,
    description: 'Enterprise rollout across 12 hospital sites. Procurement cycle is complex; IT and CMO both influencing decision. Budget is confirmed.',
    next_steps: 'Respond to legal\'s data processing agreement comments. Schedule final demo for IT Director Nina Torres.',
  },
  {
    name: 'Forge Manufacturing — ERP Connector',
    value: 18000,
    one_off_revenue: 6000,
    monthly_mrr: 1000,
    stageIndex: 1, // Qualified
    companyIndex: 3,
    status: 'active',
    probability: 40,
    health_score: 60,
    risk_level: 'medium',
    closeDateOffsetDays: 60,
    description: 'Integration between their legacy ERP and our platform. David Kowalski is evaluating for Q3 go-live target.',
    next_steps: 'Deliver technical scoping document. Arrange call with their IT team to validate data model assumptions.',
  },
  {
    name: 'ShipStream Logistics — Carrier Network Access',
    value: 36000,
    one_off_revenue: 0,
    monthly_mrr: 3000,
    stageIndex: 4, // Closed Won
    companyIndex: 4,
    status: 'won',
    probability: 100,
    health_score: 90,
    risk_level: 'low',
    closeDateOffsetDays: -15,
    description: 'Annual carrier partnership deal. Closed ahead of schedule. Claire Dubois signed off in final negotiation session.',
    next_steps: 'Kick-off onboarding call booked for next week. Assign customer success manager.',
  },
  {
    name: 'Amplify Creative — Content & ABM Retainer',
    value: 28800,
    one_off_revenue: 4800,
    monthly_mrr: 2000,
    stageIndex: 2, // Proposal
    companyIndex: 5,
    status: 'active',
    probability: 50,
    health_score: 70,
    risk_level: 'medium',
    closeDateOffsetDays: 21,
    description: 'Annual retainer for B2B demand gen services. Ben Harvey is the decision-maker. Zoe Miller involved in scoping.',
    next_steps: 'Revise scope to match reduced Q2 budget. Send final statement of work by end of week.',
  },
  {
    name: 'Nexus Cybersecurity — Endpoint Protection Pilot',
    value: 15000,
    one_off_revenue: 3000,
    monthly_mrr: 1000,
    stageIndex: 1, // Qualified
    companyIndex: 6,
    status: 'active',
    probability: 45,
    health_score: 75,
    risk_level: 'low',
    closeDateOffsetDays: 35,
    description: '90-day paid pilot covering 50 endpoints. Alex Ford is evaluating ahead of Series A fundraise. Strong technical fit confirmed.',
    next_steps: 'Set up pilot environment. Schedule weekly check-in cadence with Mia Johnson.',
  },
  {
    name: 'Verdant PropTech — Property Management Platform',
    value: 24000,
    one_off_revenue: 0,
    monthly_mrr: 2000,
    stageIndex: 0, // Lead
    companyIndex: 7,
    status: 'active',
    probability: 25,
    health_score: 45,
    risk_level: 'high',
    closeDateOffsetDays: 90,
    description: 'Inbound lead from LinkedIn. Hannah Cross reached out after a product post. Early stage — no budget discussion yet.',
    next_steps: 'Book discovery call. Qualify budget, timeline, and current pain with legacy system.',
  },
  {
    name: 'Orion Enterprise — Cloud Migration Partnership',
    value: 150000,
    one_off_revenue: 50000,
    monthly_mrr: 8333,
    stageIndex: 2, // Proposal
    companyIndex: 8,
    status: 'active',
    probability: 35,
    health_score: 50,
    risk_level: 'critical',
    closeDateOffsetDays: 120,
    description: 'Strategic partnership for joint go-to-market on cloud transformation. Richard Stern is our sponsor but deal needs C-suite buy-in. Long cycle expected.',
    next_steps: 'Prepare executive business case deck. Request meeting with CTO via Richard.',
  },
  {
    name: 'BrightPath EdTech — Sales Team Upskilling',
    value: 12000,
    one_off_revenue: 0,
    monthly_mrr: 1000,
    stageIndex: 1, // Qualified
    companyIndex: 9,
    status: 'active',
    probability: 60,
    health_score: 80,
    risk_level: 'low',
    closeDateOffsetDays: 20,
    description: 'Annual subscription for 25-seat sales upskilling programme. Jessica Yang is the champion, fast mover.',
    next_steps: 'Send agreement for e-signature. Confirm billing contact with Ryan Black.',
  },
  {
    name: 'Forge Manufacturing — Quality Control Module',
    value: 9500,
    one_off_revenue: 9500,
    monthly_mrr: 0,
    stageIndex: 4, // Closed Won
    companyIndex: 3,
    status: 'won',
    probability: 100,
    health_score: 95,
    risk_level: 'low',
    closeDateOffsetDays: -30,
    description: 'One-off project for quality control reporting module. Delivered on time and on budget. Strong reference potential.',
    next_steps: 'Request case study from David Kowalski. Book QBR for 90 days post-launch.',
  },
  {
    name: 'ClearPath Finance — Series B Data Room Prep',
    value: 7500,
    one_off_revenue: 7500,
    monthly_mrr: 0,
    stageIndex: 0, // Lead
    companyIndex: 1,
    status: 'lost',
    probability: 0,
    health_score: 20,
    risk_level: 'critical',
    closeDateOffsetDays: -60,
    description: 'One-off engagement to support Series B fundraise data room. Lost to incumbent advisor. Tom Bradshaw cited timing as the issue.',
    next_steps: 'Mark as lost. Add to nurture sequence. Re-engage in 6 months post-fundraise.',
  },
];

// ---------------------------------------------------------------------------
// Meeting Schedule Templates
// ---------------------------------------------------------------------------

export type MeetingType = 'discovery' | 'demo' | 'negotiation' | 'follow_up' | 'closing' | 'general';

export interface SeedMeetingTemplate {
  companyIndex: number;
  contactIndices: number[]; // indices into CONTACTS array
  meetingType: MeetingType;
  transcriptIndex: number; // 0-5, which transcript template to use
  daysAgo: number;
  durationMinutes: number;
}

export const MEETING_TEMPLATES: SeedMeetingTemplate[] = [
  // Meridian Analytics — full sales cycle
  {
    companyIndex: 0,
    contactIndices: [0],
    meetingType: 'discovery',
    transcriptIndex: 0,
    daysAgo: 85,
    durationMinutes: 45,
  },
  {
    companyIndex: 0,
    contactIndices: [0, 1],
    meetingType: 'demo',
    transcriptIndex: 1,
    daysAgo: 70,
    durationMinutes: 60,
  },
  {
    companyIndex: 0,
    contactIndices: [0, 1, 2],
    meetingType: 'follow_up',
    transcriptIndex: 2,
    daysAgo: 55,
    durationMinutes: 30,
  },
  {
    companyIndex: 0,
    contactIndices: [0, 1],
    meetingType: 'negotiation',
    transcriptIndex: 3,
    daysAgo: 14,
    durationMinutes: 45,
  },

  // ClearPath Finance
  {
    companyIndex: 1,
    contactIndices: [3],
    meetingType: 'discovery',
    transcriptIndex: 0,
    daysAgo: 60,
    durationMinutes: 30,
  },
  {
    companyIndex: 1,
    contactIndices: [3, 4],
    meetingType: 'demo',
    transcriptIndex: 1,
    daysAgo: 40,
    durationMinutes: 60,
  },
  {
    companyIndex: 1,
    contactIndices: [3, 5],
    meetingType: 'follow_up',
    transcriptIndex: 2,
    daysAgo: 10,
    durationMinutes: 30,
  },

  // Vantage Health Systems
  {
    companyIndex: 2,
    contactIndices: [6],
    meetingType: 'discovery',
    transcriptIndex: 0,
    daysAgo: 75,
    durationMinutes: 60,
  },
  {
    companyIndex: 2,
    contactIndices: [6, 7, 8],
    meetingType: 'demo',
    transcriptIndex: 1,
    daysAgo: 50,
    durationMinutes: 90,
  },
  {
    companyIndex: 2,
    contactIndices: [6, 7],
    meetingType: 'negotiation',
    transcriptIndex: 3,
    daysAgo: 20,
    durationMinutes: 60,
  },

  // Forge Manufacturing
  {
    companyIndex: 3,
    contactIndices: [12],
    meetingType: 'discovery',
    transcriptIndex: 0,
    daysAgo: 45,
    durationMinutes: 45,
  },
  {
    companyIndex: 3,
    contactIndices: [12, 13],
    meetingType: 'demo',
    transcriptIndex: 1,
    daysAgo: 25,
    durationMinutes: 60,
  },

  // ShipStream Logistics — won deal, retrospective meeting
  {
    companyIndex: 4,
    contactIndices: [15],
    meetingType: 'closing',
    transcriptIndex: 4,
    daysAgo: 18,
    durationMinutes: 30,
  },
  {
    companyIndex: 4,
    contactIndices: [15, 16],
    meetingType: 'follow_up',
    transcriptIndex: 5,
    daysAgo: 5,
    durationMinutes: 30,
  },

  // Amplify Creative
  {
    companyIndex: 5,
    contactIndices: [18],
    meetingType: 'discovery',
    transcriptIndex: 0,
    daysAgo: 35,
    durationMinutes: 45,
  },
  {
    companyIndex: 5,
    contactIndices: [18, 19],
    meetingType: 'demo',
    transcriptIndex: 1,
    daysAgo: 15,
    durationMinutes: 60,
  },

  // Nexus Cybersecurity
  {
    companyIndex: 6,
    contactIndices: [21],
    meetingType: 'discovery',
    transcriptIndex: 0,
    daysAgo: 28,
    durationMinutes: 45,
  },
  {
    companyIndex: 6,
    contactIndices: [21, 22],
    meetingType: 'demo',
    transcriptIndex: 1,
    daysAgo: 12,
    durationMinutes: 60,
  },

  // BrightPath EdTech — fast-moving deal
  {
    companyIndex: 9,
    contactIndices: [30],
    meetingType: 'discovery',
    transcriptIndex: 0,
    daysAgo: 20,
    durationMinutes: 30,
  },
  {
    companyIndex: 9,
    contactIndices: [30, 31],
    meetingType: 'general',
    transcriptIndex: 5,
    daysAgo: 7,
    durationMinutes: 45,
  },
];
