/**
 * Win/Loss Analysis Types — PRD-117
 */

export type WinLossPeriod = '30d' | '90d' | '180d' | '365d';

export type LossReasonCode =
  | 'price'
  | 'timing'
  | 'competitor_won'
  | 'no_decision'
  | 'feature_gap'
  | 'champion_left'
  | 'budget_cut'
  | 'other';

export interface DealOutcome {
  id: string;
  org_id: string;
  deal_id: string;
  outcome: 'won' | 'lost';
  reason_code: LossReasonCode | null;
  competitor_id: string | null;
  notes: string | null;
  recorded_by: string | null;
  recorded_at: string;
}

export interface WinRateByDimension {
  /** stage / rep_name / size_bucket / month label */
  label: string;
  won: number;
  lost: number;
  total: number;
  win_rate: number;
}

export interface WinRateByRep extends WinRateByDimension {
  rep_id: string;
  rep_name: string;
}

export interface LossReasonBucket {
  reason_code: LossReasonCode;
  count: number;
  deals: Array<{
    deal_id: string;
    deal_name: string;
    value: number | null;
    stage: string | null;
  }>;
}

export interface CompetitorMatrixRow {
  competitor_name: string;
  deals_faced: number;
  won: number;
  lost: number;
  win_rate: number | null;
}

export interface MonthlyWinRate {
  month: string;  // 'YYYY-MM'
  won: number;
  lost: number;
  total: number;
  win_rate: number;
}

export interface WinLossAnalytics {
  win_rate: number;
  total: number;
  won: number;
  lost: number;
  by_stage: Array<{ stage: string; won: number; lost: number; total: number; win_rate: number }>;
  by_rep: Array<{ rep_id: string; rep_name: string; won: number; lost: number; total: number; win_rate: number }>;
  by_size: Array<{ size_bucket: string; won: number; lost: number; total: number; win_rate: number }>;
  by_period: MonthlyWinRate[];
  loss_reasons: LossReasonBucket[];
}

export interface WinLossInsight {
  id: string;
  text: string;
  type: 'positive' | 'warning' | 'info';
}
