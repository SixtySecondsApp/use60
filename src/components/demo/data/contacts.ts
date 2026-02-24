// 12 fictional contacts across deals with engagement patterns and graph data

export interface DemoContact {
  id: string;
  name: string;
  title: string;
  company: string;
  email: string;
  linkedinUrl: string;
  avatar: string;
  role: 'decision_maker' | 'champion' | 'influencer' | 'end_user' | 'blocker';
  dealId: string;
  engagementPattern: {
    avgResponseTimeHours: number;
    currentResponseTimeHours: number;
    responseTrend: 'faster' | 'stable' | 'slower';
    bestEmailDay: string;
    bestEmailHour: number;
    meetingCount: number;
    lastInteraction: string;
  };
  companyHistory?: Array<{
    company: string;
    title: string;
    startYear: number;
    endYear: number | null;
    isCurrent: boolean;
  }>;
}

export const contacts: DemoContact[] = [
  // DataFlow Inc contacts
  {
    id: 'contact-1',
    name: 'Jake Torres',
    title: 'VP Engineering',
    company: 'DataFlow Inc',
    email: 'jake@dataflow.io',
    linkedinUrl: 'linkedin.com/in/jaketorres',
    avatar: 'JT',
    role: 'decision_maker',
    dealId: 'deal-1',
    engagementPattern: {
      avgResponseTimeHours: 4.2,
      currentResponseTimeHours: 3.1,
      responseTrend: 'faster',
      bestEmailDay: 'Tuesday',
      bestEmailHour: 9,
      meetingCount: 4,
      lastInteraction: 'Today — demo call',
    },
    companyHistory: [
      { company: 'DataFlow Inc', title: 'VP Engineering', startYear: 2024, endYear: null, isCurrent: true },
      { company: 'Zendesk', title: 'Sr. Engineering Manager', startYear: 2020, endYear: 2024, isCurrent: false },
      { company: 'Stripe', title: 'Engineering Lead', startYear: 2017, endYear: 2020, isCurrent: false },
    ],
  },
  {
    id: 'contact-2',
    name: 'Lisa Park',
    title: 'Head of Customer Experience',
    company: 'DataFlow Inc',
    email: 'lisa@dataflow.io',
    linkedinUrl: 'linkedin.com/in/lisapark',
    avatar: 'LP',
    role: 'champion',
    dealId: 'deal-1',
    engagementPattern: {
      avgResponseTimeHours: 2.8,
      currentResponseTimeHours: 1.5,
      responseTrend: 'faster',
      bestEmailDay: 'Wednesday',
      bestEmailHour: 10,
      meetingCount: 6,
      lastInteraction: 'Today — demo call',
    },
    companyHistory: [
      { company: 'DataFlow Inc', title: 'Head of CX', startYear: 2023, endYear: null, isCurrent: true },
      { company: 'Zendesk', title: 'CX Manager', startYear: 2019, endYear: 2023, isCurrent: false },
      { company: 'Shopify', title: 'Support Team Lead', startYear: 2016, endYear: 2019, isCurrent: false },
    ],
  },
  // CloudBase contacts
  {
    id: 'contact-3',
    name: 'Maria Chen',
    title: 'Director of Operations',
    company: 'CloudBase Technologies',
    email: 'maria@cloudbase.tech',
    linkedinUrl: 'linkedin.com/in/mariachen',
    avatar: 'MC',
    role: 'champion',
    dealId: 'deal-2',
    engagementPattern: {
      avgResponseTimeHours: 3.2,
      currentResponseTimeHours: 72,
      responseTrend: 'slower',
      bestEmailDay: 'Thursday',
      bestEmailHour: 11,
      meetingCount: 3,
      lastInteraction: '14 days ago — email opened but no reply',
    },
  },
  // Meridian Group contacts
  {
    id: 'contact-4',
    name: 'Tom Richards',
    title: 'CTO',
    company: 'Meridian Group',
    email: 'tom@meridiangroup.co.uk',
    linkedinUrl: 'linkedin.com/in/tomrichards',
    avatar: 'TR',
    role: 'decision_maker',
    dealId: 'deal-3',
    engagementPattern: {
      avgResponseTimeHours: 8.5,
      currentResponseTimeHours: 24,
      responseTrend: 'slower',
      bestEmailDay: 'Monday',
      bestEmailHour: 8,
      meetingCount: 2,
      lastInteraction: '18 days ago — proposal sent',
    },
  },
  {
    id: 'contact-5',
    name: 'Emma Wallace',
    title: 'Head of Support',
    company: 'Meridian Group',
    email: 'emma@meridiangroup.co.uk',
    linkedinUrl: 'linkedin.com/in/emmawallace',
    avatar: 'EW',
    role: 'influencer',
    dealId: 'deal-3',
    engagementPattern: {
      avgResponseTimeHours: 5.0,
      currentResponseTimeHours: 12,
      responseTrend: 'slower',
      bestEmailDay: 'Tuesday',
      bestEmailHour: 14,
      meetingCount: 1,
      lastInteraction: '22 days ago — intro call',
    },
  },
  // Pinnacle Partners contacts
  {
    id: 'contact-6',
    name: 'David Kim',
    title: 'VP Customer Success',
    company: 'Pinnacle Partners',
    email: 'david@pinnacle.com',
    linkedinUrl: 'linkedin.com/in/davidkim',
    avatar: 'DK',
    role: 'champion',
    dealId: 'deal-4',
    engagementPattern: {
      avgResponseTimeHours: 6.0,
      currentResponseTimeHours: 168,
      responseTrend: 'slower',
      bestEmailDay: 'Wednesday',
      bestEmailHour: 10,
      meetingCount: 5,
      lastInteraction: '32 days ago — closed lost',
    },
    companyHistory: [
      { company: 'Pinnacle Partners', title: 'VP Customer Success', startYear: 2023, endYear: null, isCurrent: true },
      { company: 'Salesforce', title: 'CS Director', startYear: 2019, endYear: 2023, isCurrent: false },
    ],
  },
  // TechVault contacts
  {
    id: 'contact-7',
    name: 'Rachel Adams',
    title: 'CEO',
    company: 'TechVault',
    email: 'rachel@techvault.io',
    linkedinUrl: 'linkedin.com/in/racheladams',
    avatar: 'RA',
    role: 'decision_maker',
    dealId: 'deal-5',
    engagementPattern: {
      avgResponseTimeHours: 2.0,
      currentResponseTimeHours: 1.5,
      responseTrend: 'faster',
      bestEmailDay: 'Monday',
      bestEmailHour: 9,
      meetingCount: 1,
      lastInteraction: '2 days ago — discovery call',
    },
  },
  {
    id: 'contact-8',
    name: 'Ben Foster',
    title: 'Head of Engineering',
    company: 'TechVault',
    email: 'ben@techvault.io',
    linkedinUrl: 'linkedin.com/in/benfoster',
    avatar: 'BF',
    role: 'influencer',
    dealId: 'deal-5',
    engagementPattern: {
      avgResponseTimeHours: 12.0,
      currentResponseTimeHours: 8.0,
      responseTrend: 'faster',
      bestEmailDay: 'Thursday',
      bestEmailHour: 15,
      meetingCount: 1,
      lastInteraction: '2 days ago — discovery call',
    },
  },
  // Additional contacts for relationship graph richness
  {
    id: 'contact-9',
    name: 'Sophie Wright',
    title: 'Product Manager',
    company: 'DataFlow Inc',
    email: 'sophie@dataflow.io',
    linkedinUrl: 'linkedin.com/in/sophiewright',
    avatar: 'SW',
    role: 'end_user',
    dealId: 'deal-1',
    engagementPattern: {
      avgResponseTimeHours: 6.0,
      currentResponseTimeHours: 4.0,
      responseTrend: 'stable',
      bestEmailDay: 'Friday',
      bestEmailHour: 11,
      meetingCount: 1,
      lastInteraction: 'Today — demo call (attendee)',
    },
  },
  {
    id: 'contact-10',
    name: 'Alex Nguyen',
    title: 'CFO',
    company: 'CloudBase Technologies',
    email: 'alex@cloudbase.tech',
    linkedinUrl: 'linkedin.com/in/alexnguyen',
    avatar: 'AN',
    role: 'blocker',
    dealId: 'deal-2',
    engagementPattern: {
      avgResponseTimeHours: 24.0,
      currentResponseTimeHours: 48.0,
      responseTrend: 'slower',
      bestEmailDay: 'Monday',
      bestEmailHour: 8,
      meetingCount: 0,
      lastInteraction: 'Never met — CC\'d on proposal email',
    },
  },
  {
    id: 'contact-11',
    name: 'James Wright',
    title: 'VP Engineering',
    company: 'Nexus Corp',
    email: 'james@nexuscorp.com',
    linkedinUrl: 'linkedin.com/in/jameswright',
    avatar: 'JW',
    role: 'decision_maker',
    dealId: '',
    engagementPattern: {
      avgResponseTimeHours: 5.5,
      currentResponseTimeHours: 5.0,
      responseTrend: 'stable',
      bestEmailDay: 'Wednesday',
      bestEmailHour: 14,
      meetingCount: 2,
      lastInteraction: '5 days ago — intro meeting',
    },
    companyHistory: [
      { company: 'Nexus Corp', title: 'VP Engineering', startYear: 2025, endYear: null, isCurrent: true },
      { company: 'Meridian Group', title: 'Engineering Director', startYear: 2020, endYear: 2025, isCurrent: false },
    ],
  },
  {
    id: 'contact-12',
    name: 'Priya Sharma',
    title: 'Head of Partnerships',
    company: 'FinanceFirst',
    email: 'priya@financefirst.com',
    linkedinUrl: 'linkedin.com/in/priyasharma',
    avatar: 'PS',
    role: 'influencer',
    dealId: '',
    engagementPattern: {
      avgResponseTimeHours: 3.0,
      currentResponseTimeHours: 2.5,
      responseTrend: 'faster',
      bestEmailDay: 'Tuesday',
      bestEmailHour: 10,
      meetingCount: 1,
      lastInteraction: '8 days ago — intro call',
    },
    companyHistory: [
      { company: 'FinanceFirst', title: 'Head of Partnerships', startYear: 2025, endYear: null, isCurrent: true },
      { company: 'DataFlow Inc', title: 'Partnerships Manager', startYear: 2022, endYear: 2025, isCurrent: false },
    ],
  },
];
