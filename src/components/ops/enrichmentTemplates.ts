import {
  Newspaper,
  Cpu,
  Swords,
  AlertTriangle,
  TrendingUp,
  Users,
  Rocket,
  Code,
  MapPin,
  UserCheck,
  Building2,
  Target,
  Shield,
  UserCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface EnrichmentTemplate {
  name: string;
  prompt: string;
  icon: LucideIcon;
  description: string;
}

/** Generic AI enrichment templates (OpenRouter / Anthropic) */
export const GENERIC_TEMPLATES: EnrichmentTemplate[] = [
  {
    name: 'Recent News',
    prompt: 'Find recent news about @company_name',
    icon: Newspaper,
    description: 'Latest news articles and press releases',
  },
  {
    name: 'Tech Stack',
    prompt: "Identify @company_name's tech stack from their website",
    icon: Cpu,
    description: 'Technologies, frameworks, and tools used',
  },
  {
    name: 'Competitors',
    prompt: 'List main competitors for @company_name',
    icon: Swords,
    description: 'Key competitors and market alternatives',
  },
  {
    name: 'Pain Points',
    prompt: 'Based on @title role at @company_name, identify likely pain points',
    icon: AlertTriangle,
    description: 'Role-specific challenges and pain points',
  },
];

/** Exa-optimized enrichment templates with web search context */
export const EXA_TEMPLATES: EnrichmentTemplate[] = [
  {
    name: 'Funding Signals',
    prompt: 'What recent funding rounds, investments, or financial events has @company_name been involved in?',
    icon: TrendingUp,
    description: 'Funding rounds, investments, financial events',
  },
  {
    name: 'Hiring Intent',
    prompt: 'What positions is @company_name currently hiring for and what does their hiring activity indicate about growth?',
    icon: Users,
    description: 'Open roles, hiring velocity, growth signals',
  },
  {
    name: 'Product Launches',
    prompt: 'What new products, features, or services has @company_name launched or announced recently?',
    icon: Rocket,
    description: 'New products, feature releases, announcements',
  },
  {
    name: 'Competitor Analysis',
    prompt: 'Who are @company_name\'s main competitors and how do they differentiate in the market?',
    icon: Swords,
    description: 'Competitive landscape, market positioning',
  },
  {
    name: 'Tech Stack',
    prompt: 'What technologies, frameworks, and tools does @company_name use based on their website, job postings, and public information?',
    icon: Code,
    description: 'Languages, frameworks, infrastructure',
  },
  {
    name: 'Market Expansion',
    prompt: 'Has @company_name expanded into new markets, regions, or verticals recently?',
    icon: MapPin,
    description: 'Geographic expansion, new verticals',
  },
  {
    name: 'Leadership Changes',
    prompt: 'Have there been any recent executive hires, departures, or leadership changes at @company_name?',
    icon: UserCheck,
    description: 'C-suite changes, key hires, departures',
  },
  {
    name: 'Company Overview',
    prompt: 'Provide a comprehensive overview of @company_name including what they do, their target market, and recent news',
    icon: Building2,
    description: 'Full company profile with citations',
  },
];

/** Deal-specific AI enrichment templates for Deals standard table */
export const DEAL_ENRICHMENT_TEMPLATES: EnrichmentTemplate[] = [
  {
    name: 'Close Probability Reasoning',
    prompt: 'Analyze the deal health data for @deal_name: Health Score={health_score}, Sentiment Trend={sentiment_trend}, Days in Stage={days_in_current_stage}, Last Meeting={days_since_last_meeting} days ago. Explain the close probability based on these signals and recent activity patterns.',
    icon: Target,
    description: 'AI analyzes deal health and velocity to explain close probability',
  },
  {
    name: 'Risk Mitigation Suggestion',
    prompt: 'Given the risk factors for @deal_name: Risk Level={risk_level}, Risk Factors={risk_factors}, Health Status={health_status}. Generate 3 specific actionable risk mitigation tactics to address these issues and improve deal health.',
    icon: Shield,
    description: 'AI generates specific risk mitigation actions based on signals',
  },
  {
    name: 'Competitive Intelligence',
    prompt: 'Research the competitive landscape for @company_name in the @deal_stage stage. Identify main competitors, their strengths/weaknesses, and how to position our solution against them.',
    icon: Swords,
    description: 'AI researches and summarizes competitive landscape for the deal',
  },
  {
    name: 'Stakeholder Analysis',
    prompt: 'Analyze the stakeholders involved in @deal_name at @company_name. Based on roles, seniority, and engagement patterns (meeting count, responsiveness), assess each stakeholder\'s influence level and alignment with the deal. Provide recommendations for engagement strategy.',
    icon: UserCircle,
    description: 'AI analyzes contacts and their roles/influence in the deal',
  },
];
