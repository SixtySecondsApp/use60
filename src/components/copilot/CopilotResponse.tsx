/**
 * Copilot Response Router Component
 * Routes structured responses to the appropriate component based on type
 */

import React from 'react';
import { PipelineResponse } from './responses/PipelineResponse';
import { EmailResponse } from './responses/EmailResponse';
import { CalendarResponse } from './responses/CalendarResponse';
import { ActivityResponse } from './responses/ActivityResponse';
import { LeadResponse } from './responses/LeadResponse';
import { TaskResponse } from './responses/TaskResponse';
import { ContactResponse } from './responses/ContactResponse';
import { RoadmapResponse } from './responses/RoadmapResponse';
import { SalesCoachResponse } from './responses/SalesCoachResponse';
import { GoalTrackingResponse } from './responses/GoalTrackingResponse';
import { TrendAnalysisResponse } from './responses/TrendAnalysisResponse';
import { ForecastResponse } from './responses/ForecastResponse';
import { TeamComparisonResponse } from './responses/TeamComparisonResponse';
import { MetricFocusResponse } from './responses/MetricFocusResponse';
import { InsightsResponse } from './responses/InsightsResponse';
import { StageAnalysisResponse } from './responses/StageAnalysisResponse';
import { ActivityBreakdownResponse } from './responses/ActivityBreakdownResponse';
import { DealHealthResponse } from './responses/DealHealthResponse';
import { ContactRelationshipResponse } from './responses/ContactRelationshipResponse';
import { CommunicationHistoryResponse } from './responses/CommunicationHistoryResponse';
import { MeetingPrepResponse } from './responses/MeetingPrepResponse';
import { MeetingPrepPanel } from '@/components/assistant/panels/MeetingPrepPanel';
import { DataQualityResponse } from './responses/DataQualityResponse';
import { PipelineForecastResponse } from './responses/PipelineForecastResponse';
import { ActivityPlanningResponse } from './responses/ActivityPlanningResponse';
import { CompanyIntelligenceResponse } from './responses/CompanyIntelligenceResponse';
import { WorkflowProcessResponse } from './responses/WorkflowProcessResponse';
import { SearchDiscoveryResponse } from './responses/SearchDiscoveryResponse';
import { ContactSelectionResponse } from './responses/ContactSelectionResponse';
import { ActivityCreationResponse } from './responses/ActivityCreationResponse';
import { TaskCreationResponse } from './responses/TaskCreationResponse';
import { ProposalSelectionResponse } from './responses/ProposalSelectionResponse';
import { ActionSummaryResponse } from './responses/ActionSummaryResponse';
import { PipelineFocusTasksResponse } from './responses/PipelineFocusTasksResponse';
import { DealRescuePackResponse } from './responses/DealRescuePackResponse';
import { NextMeetingCommandCenterResponse } from './responses/NextMeetingCommandCenterResponse';
import { PostMeetingFollowUpPackResponse } from './responses/PostMeetingFollowUpPackResponse';
import { DealMapBuilderResponse } from './responses/DealMapBuilderResponse';
import { DailyFocusPlanResponse } from './responses/DailyFocusPlanResponse';
import { FollowupZeroInboxResponse } from './responses/FollowupZeroInboxResponse';
import { DealSlippageGuardrailsResponse } from './responses/DealSlippageGuardrailsResponse';
import { DailyBriefResponse } from './responses/DailyBriefResponse';
import { MeetingCountResponse } from './responses/MeetingCountResponse';
import { MeetingBriefingResponse } from './responses/MeetingBriefingResponse';
import { MeetingListResponse } from './responses/MeetingListResponse';
import { TimeBreakdownResponse } from './responses/TimeBreakdownResponse';
import { DynamicTableResponse } from './responses/DynamicTableResponse';
import type { DynamicTableResponseData } from './responses/DynamicTableResponse';
import type {
  CopilotResponse as CopilotResponseType,
  PipelineResponse as PipelineResponseType,
  EmailResponse as EmailResponseType,
  CalendarResponse as CalendarResponseType,
  ActivityResponse as ActivityResponseType,
  LeadResponse as LeadResponseType,
  TaskResponse as TaskResponseType,
  ContactResponse as ContactResponseType,
  RoadmapResponse as RoadmapResponseType,
  SalesCoachResponse as SalesCoachResponseType,
  GoalTrackingResponse as GoalTrackingResponseType,
  TrendAnalysisResponse as TrendAnalysisResponseType,
  ForecastResponse as ForecastResponseType,
  TeamComparisonResponse as TeamComparisonResponseType,
  MetricFocusResponse as MetricFocusResponseType,
  InsightsResponse as InsightsResponseType,
  StageAnalysisResponse as StageAnalysisResponseType,
  ActivityBreakdownResponse as ActivityBreakdownResponseType,
  DealHealthResponse as DealHealthResponseType,
  ContactRelationshipResponse as ContactRelationshipResponseType,
  CommunicationHistoryResponse as CommunicationHistoryResponseType,
  MeetingPrepResponse as MeetingPrepResponseType,
  DataQualityResponse as DataQualityResponseType,
  PipelineForecastResponse as PipelineForecastResponseType,
  ActivityPlanningResponse as ActivityPlanningResponseType,
  CompanyIntelligenceResponse as CompanyIntelligenceResponseType,
  WorkflowProcessResponse as WorkflowProcessResponseType,
  SearchDiscoveryResponse as SearchDiscoveryResponseType,
  ContactSelectionResponse as ContactSelectionResponseType,
  ActivityCreationResponse as ActivityCreationResponseType,
  TaskCreationResponse as TaskCreationResponseType,
  ProposalSelectionResponse as ProposalSelectionResponseType,
  ActionSummaryResponse as ActionSummaryResponseType,
  PipelineFocusTasksResponse as PipelineFocusTasksResponseType,
  DealRescuePackResponse as DealRescuePackResponseType,
  NextMeetingCommandCenterResponse as NextMeetingCommandCenterResponseType,
  PostMeetingFollowUpPackResponse as PostMeetingFollowUpPackResponseType,
  DealMapBuilderResponse as DealMapBuilderResponseType,
  DailyFocusPlanResponse as DailyFocusPlanResponseType,
  FollowupZeroInboxResponse as FollowupZeroInboxResponseType,
  DealSlippageGuardrailsResponse as DealSlippageGuardrailsResponseType,
  DailyBriefResponse as DailyBriefResponseType,
  MeetingCountResponseData,
  MeetingBriefingResponseData,
  MeetingListResponseData,
  TimeBreakdownResponseData,
} from './types';

interface CopilotResponseProps {
  response: CopilotResponseType;
  onActionClick?: (action: any) => void;
}

/**
 * Main router component that renders the appropriate response component
 * based on the response type
 */
export const CopilotResponse: React.FC<CopilotResponseProps> = ({ response, onActionClick }) => {
  switch (response.type) {
    case 'pipeline':
      return <PipelineResponse data={response as PipelineResponseType} onActionClick={onActionClick} />;

    case 'email':
      return <EmailResponse data={response as EmailResponseType} onActionClick={onActionClick} />;

    case 'calendar':
    case 'meeting':
      return <CalendarResponse data={response as CalendarResponseType} onActionClick={onActionClick} />;

    case 'activity':
      return <ActivityResponse data={response as ActivityResponseType} onActionClick={onActionClick} />;

    case 'lead':
      return <LeadResponse data={response as LeadResponseType} onActionClick={onActionClick} />;

    case 'task':
      return <TaskResponse data={response as TaskResponseType} onActionClick={onActionClick} />;

    case 'contact':
      return <ContactResponse data={response as ContactResponseType} onActionClick={onActionClick} />;

    case 'roadmap':
      return <RoadmapResponse data={response as RoadmapResponseType} onActionClick={onActionClick} />;

    case 'sales_coach':
      return <SalesCoachResponse data={response as SalesCoachResponseType} onActionClick={onActionClick} />;

    case 'goal_tracking':
      return <GoalTrackingResponse data={response as GoalTrackingResponseType} onActionClick={onActionClick} />;

    case 'trend_analysis':
      return <TrendAnalysisResponse data={response as TrendAnalysisResponseType} onActionClick={onActionClick} />;

    case 'forecast':
      return <ForecastResponse data={response as ForecastResponseType} onActionClick={onActionClick} />;

    case 'team_comparison':
      return <TeamComparisonResponse data={response as TeamComparisonResponseType} onActionClick={onActionClick} />;

    case 'metric_focus':
      return <MetricFocusResponse data={response as MetricFocusResponseType} onActionClick={onActionClick} />;

    case 'insights':
      return <InsightsResponse data={response as InsightsResponseType} onActionClick={onActionClick} />;

    case 'stage_analysis':
      return <StageAnalysisResponse data={response as StageAnalysisResponseType} onActionClick={onActionClick} />;

    case 'activity_breakdown':
      return <ActivityBreakdownResponse data={response as ActivityBreakdownResponseType} onActionClick={onActionClick} />;

    case 'deal_health':
      return <DealHealthResponse data={response as DealHealthResponseType} onActionClick={onActionClick} />;

    case 'contact_relationship':
      return <ContactRelationshipResponse data={response as ContactRelationshipResponseType} onActionClick={onActionClick} />;

    case 'communication_history':
      return <CommunicationHistoryResponse data={response as CommunicationHistoryResponseType} onActionClick={onActionClick} />;

    case 'meeting_prep':
      return <MeetingPrepPanel data={response as MeetingPrepResponseType} onActionClick={onActionClick} />;

    case 'data_quality':
      return <DataQualityResponse data={response as DataQualityResponseType} onActionClick={onActionClick} />;

    case 'pipeline_forecast':
      return <PipelineForecastResponse data={response as PipelineForecastResponseType} onActionClick={onActionClick} />;

    case 'activity_planning':
      return <ActivityPlanningResponse data={response as ActivityPlanningResponseType} onActionClick={onActionClick} />;

    case 'company_intelligence':
      return <CompanyIntelligenceResponse data={response as CompanyIntelligenceResponseType} onActionClick={onActionClick} />;

    case 'workflow_process':
      return <WorkflowProcessResponse data={response as WorkflowProcessResponseType} onActionClick={onActionClick} />;

    case 'search_discovery':
      return <SearchDiscoveryResponse data={response as SearchDiscoveryResponseType} onActionClick={onActionClick} />;

    case 'contact_selection':
      return <ContactSelectionResponse data={response as ContactSelectionResponseType} onActionClick={onActionClick} />;

    case 'activity_creation':
      return <ActivityCreationResponse data={response as ActivityCreationResponseType} onActionClick={onActionClick} />;

    case 'task_creation':
      return <TaskCreationResponse data={response as TaskCreationResponseType} onActionClick={onActionClick} />;

    case 'proposal_selection':
      return <ProposalSelectionResponse data={response as ProposalSelectionResponseType} onActionClick={onActionClick} />;
    
    case 'action_summary':
      return <ActionSummaryResponse data={response as ActionSummaryResponseType} onActionClick={onActionClick} />;

    case 'pipeline_focus_tasks':
      return <PipelineFocusTasksResponse data={response as PipelineFocusTasksResponseType} onActionClick={onActionClick} />;

    case 'deal_rescue_pack':
      return <DealRescuePackResponse data={response as DealRescuePackResponseType} onActionClick={onActionClick} />;

    case 'next_meeting_command_center':
      return <NextMeetingCommandCenterResponse data={response as NextMeetingCommandCenterResponseType} onActionClick={onActionClick} />;

    case 'post_meeting_followup_pack':
      return <PostMeetingFollowUpPackResponse data={response as PostMeetingFollowUpPackResponseType} onActionClick={onActionClick} />;

    case 'deal_map_builder':
      return <DealMapBuilderResponse data={response as DealMapBuilderResponseType} onActionClick={onActionClick} />;

    case 'daily_focus_plan':
      return <DailyFocusPlanResponse data={response as DailyFocusPlanResponseType} onActionClick={onActionClick} />;

    case 'followup_zero_inbox':
      return <FollowupZeroInboxResponse data={response as FollowupZeroInboxResponseType} onActionClick={onActionClick} />;

    case 'deal_slippage_guardrails':
      return <DealSlippageGuardrailsResponse data={response as DealSlippageGuardrailsResponseType} onActionClick={onActionClick} />;

    case 'daily_brief':
      return <DailyBriefResponse data={response as DailyBriefResponseType} onActionClick={onActionClick} />;

    case 'meeting_count':
      return <MeetingCountResponse data={(response as any).data as MeetingCountResponseData} onActionClick={onActionClick} />;

    case 'meeting_briefing':
      return <MeetingBriefingResponse data={(response as any).data as MeetingBriefingResponseData} onActionClick={onActionClick} />;

    case 'meeting_list':
      return <MeetingListResponse data={(response as any).data as MeetingListResponseData} onActionClick={onActionClick} />;

    case 'time_breakdown':
      return <TimeBreakdownResponse data={(response as any).data as TimeBreakdownResponseData} onActionClick={onActionClick} />;

    case 'dynamic_table':
      return <DynamicTableResponse data={(response as any).data as DynamicTableResponseData} onActionClick={onActionClick} />;

    default:
      // Fallback to text response if type is unknown
      return (
        <div className="space-y-4">
          <p className="text-sm text-gray-900 dark:text-gray-300">{response.summary}</p>
        </div>
      );
  }
};

export default CopilotResponse;

