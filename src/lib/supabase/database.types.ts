export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      action_items: {
        Row: {
          assignee_id: string | null
          completed: boolean | null
          contact_id: string | null
          created_at: string | null
          deal_id: string | null
          due_date: string | null
          id: string
          meeting_id: string | null
          metadata: Json | null
          priority: string | null
          text: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assignee_id?: string | null
          completed?: boolean | null
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          due_date?: string | null
          id?: string
          meeting_id?: string | null
          metadata?: Json | null
          priority?: string | null
          text: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assignee_id?: string | null
          completed?: boolean | null
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          due_date?: string | null
          id?: string
          meeting_id?: string | null
          metadata?: Json | null
          priority?: string | null
          text?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_items_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_items_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_items_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      activities: {
        Row: {
          amount: number | null
          auto_matched: boolean | null
          avatar_url: string | null
          clerk_org_id: string | null
          client_name: string
          company_id: string | null
          contact_id: string | null
          contact_identifier: string | null
          contact_identifier_type: string | null
          created_at: string | null
          date: string
          deal_id: string | null
          details: string | null
          execution_order: number | null
          id: string
          is_processed: boolean | null
          is_rebooking: boolean | null
          is_self_generated: boolean | null
          is_split: boolean | null
          meeting_id: string | null
          next_actions_count: number | null
          next_actions_generated_at: string | null
          original_activity_id: string | null
          outbound_type: string | null
          owner_id: string | null
          priority: string
          proposal_date: string | null
          quantity: number
          sale_date: string | null
          sales_rep: string
          savvycal_booking_id: string | null
          savvycal_link_id: string | null
          split_percentage: number | null
          status: string
          subject: string | null
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount?: number | null
          auto_matched?: boolean | null
          avatar_url?: string | null
          clerk_org_id?: string | null
          client_name: string
          company_id?: string | null
          contact_id?: string | null
          contact_identifier?: string | null
          contact_identifier_type?: string | null
          created_at?: string | null
          date?: string
          deal_id?: string | null
          details?: string | null
          execution_order?: number | null
          id?: string
          is_processed?: boolean | null
          is_rebooking?: boolean | null
          is_self_generated?: boolean | null
          is_split?: boolean | null
          meeting_id?: string | null
          next_actions_count?: number | null
          next_actions_generated_at?: string | null
          original_activity_id?: string | null
          outbound_type?: string | null
          owner_id?: string | null
          priority?: string
          proposal_date?: string | null
          quantity?: number
          sale_date?: string | null
          sales_rep: string
          savvycal_booking_id?: string | null
          savvycal_link_id?: string | null
          split_percentage?: number | null
          status?: string
          subject?: string | null
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number | null
          auto_matched?: boolean | null
          avatar_url?: string | null
          clerk_org_id?: string | null
          client_name?: string
          company_id?: string | null
          contact_id?: string | null
          contact_identifier?: string | null
          contact_identifier_type?: string | null
          created_at?: string | null
          date?: string
          deal_id?: string | null
          details?: string | null
          execution_order?: number | null
          id?: string
          is_processed?: boolean | null
          is_rebooking?: boolean | null
          is_self_generated?: boolean | null
          is_split?: boolean | null
          meeting_id?: string | null
          next_actions_count?: number | null
          next_actions_generated_at?: string | null
          original_activity_id?: string | null
          outbound_type?: string | null
          owner_id?: string | null
          priority?: string
          proposal_date?: string | null
          quantity?: number
          sale_date?: string | null
          sales_rep?: string
          savvycal_booking_id?: string | null
          savvycal_link_id?: string | null
          split_percentage?: number | null
          status?: string
          subject?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_original_activity_id_fkey"
            columns: ["original_activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_original_activity_id_fkey"
            columns: ["original_activity_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activities_company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activities_contact_id"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_sync_rules: {
        Row: {
          activity_type: string
          auto_create_deal: boolean | null
          created_at: string | null
          id: string
          is_active: boolean | null
          min_priority: string | null
          owner_id: string
          target_stage_name: string | null
          updated_at: string | null
        }
        Insert: {
          activity_type: string
          auto_create_deal?: boolean | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          min_priority?: string | null
          owner_id: string
          target_stage_name?: string | null
          updated_at?: string | null
        }
        Update: {
          activity_type?: string
          auto_create_deal?: boolean | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          min_priority?: string | null
          owner_id?: string
          target_stage_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_sync_rules_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "activity_sync_rules_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "activity_sync_rules_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "activity_sync_rules_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_sync_rules_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      ai_cost_events: {
        Row: {
          created_at: string | null
          estimated_cost: number
          feature: string | null
          id: string
          input_tokens: number
          metadata: Json | null
          model: string
          org_id: string | null
          output_tokens: number
          provider: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          estimated_cost: number
          feature?: string | null
          id?: string
          input_tokens: number
          metadata?: Json | null
          model: string
          org_id?: string | null
          output_tokens: number
          provider: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          estimated_cost?: number
          feature?: string | null
          id?: string
          input_tokens?: number
          metadata?: Json | null
          model?: string
          org_id?: string | null
          output_tokens?: number
          provider?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_cost_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_feedback: {
        Row: {
          action: string
          action_type: string
          confidence_at_generation: number
          context_quality_at_generation: number | null
          created_at: string | null
          edit_delta: Json | null
          edited_content: string | null
          id: string
          org_id: string
          original_content: string | null
          outcome_measured: boolean | null
          outcome_positive: boolean | null
          outcome_type: string | null
          suggestion_id: string
          time_to_decision_seconds: number | null
          user_id: string
        }
        Insert: {
          action: string
          action_type: string
          confidence_at_generation: number
          context_quality_at_generation?: number | null
          created_at?: string | null
          edit_delta?: Json | null
          edited_content?: string | null
          id?: string
          org_id: string
          original_content?: string | null
          outcome_measured?: boolean | null
          outcome_positive?: boolean | null
          outcome_type?: string | null
          suggestion_id: string
          time_to_decision_seconds?: number | null
          user_id: string
        }
        Update: {
          action?: string
          action_type?: string
          confidence_at_generation?: number
          context_quality_at_generation?: number | null
          created_at?: string | null
          edit_delta?: Json | null
          edited_content?: string | null
          id?: string
          org_id?: string
          original_content?: string | null
          outcome_measured?: boolean | null
          outcome_positive?: boolean | null
          outcome_type?: string | null
          suggestion_id?: string
          time_to_decision_seconds?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_insights: {
        Row: {
          contact_id: string | null
          created_at: string | null
          deal_id: string | null
          expires_at: string | null
          id: string
          insight_text: string
          insight_type: string
          metadata: Json | null
          priority: string
          suggested_actions: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          expires_at?: string | null
          id?: string
          insight_text: string
          insight_type: string
          metadata?: Json | null
          priority?: string
          suggested_actions?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          expires_at?: string | null
          id?: string
          insight_text?: string
          insight_type?: string
          metadata?: Json | null
          priority?: string
          suggested_actions?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_insights_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insights_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompt_template_history: {
        Row: {
          change_reason: string | null
          created_at: string | null
          created_by: string | null
          id: string
          max_tokens: number | null
          model: string | null
          system_prompt: string | null
          temperature: number | null
          template_id: string | null
          user_prompt: string | null
          version: number
        }
        Insert: {
          change_reason?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          max_tokens?: number | null
          model?: string | null
          system_prompt?: string | null
          temperature?: number | null
          template_id?: string | null
          user_prompt?: string | null
          version: number
        }
        Update: {
          change_reason?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          max_tokens?: number | null
          model?: string | null
          system_prompt?: string | null
          temperature?: number | null
          template_id?: string | null
          user_prompt?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompt_template_history_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "ai_prompt_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompt_templates: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean | null
          is_public: boolean | null
          max_tokens: number | null
          model: string | null
          name: string
          organization_id: string | null
          system_prompt: string | null
          temperature: number | null
          updated_at: string | null
          user_id: string | null
          user_prompt: string | null
          version: number | null
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_public?: boolean | null
          max_tokens?: number | null
          model?: string | null
          name: string
          organization_id?: string | null
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string | null
          user_id?: string | null
          user_prompt?: string | null
          version?: number | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_public?: boolean | null
          max_tokens?: number | null
          model?: string | null
          name?: string
          organization_id?: string | null
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string | null
          user_id?: string | null
          user_prompt?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompt_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_logs: {
        Row: {
          completion_tokens: number | null
          cost_estimate: number | null
          created_at: string | null
          id: string
          model: string | null
          prompt_tokens: number | null
          provider: string | null
          total_tokens: number | null
          user_id: string
          workflow_id: string | null
        }
        Insert: {
          completion_tokens?: number | null
          cost_estimate?: number | null
          created_at?: string | null
          id?: string
          model?: string | null
          prompt_tokens?: number | null
          provider?: string | null
          total_tokens?: number | null
          user_id: string
          workflow_id?: string | null
        }
        Update: {
          completion_tokens?: number | null
          cost_estimate?: number | null
          created_at?: string | null
          id?: string
          model?: string | null
          prompt_tokens?: number | null
          provider?: string | null
          total_tokens?: number | null
          user_id?: string
          workflow_id?: string | null
        }
        Relationships: []
      }
      api_key_usage: {
        Row: {
          api_key_id: string
          created_at: string | null
          endpoint: string
          id: string
          ip_address: unknown
          user_agent: string | null
        }
        Insert: {
          api_key_id: string
          created_at?: string | null
          endpoint: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
        }
        Update: {
          api_key_id?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_key_usage_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          key_hash: string
          key_preview: string | null
          last_used: string | null
          last_used_at: string | null
          name: string
          permissions: Json
          rate_limit: number
          updated_at: string | null
          usage_count: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          key_preview?: string | null
          last_used?: string | null
          last_used_at?: string | null
          name: string
          permissions?: Json
          rate_limit?: number
          updated_at?: string | null
          usage_count?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          key_preview?: string | null
          last_used?: string | null
          last_used_at?: string | null
          name?: string
          permissions?: Json
          rate_limit?: number
          updated_at?: string | null
          usage_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      api_monitor_improvements: {
        Row: {
          actual_delta_error_rate: number | null
          actual_delta_requests_per_day: number | null
          actual_delta_requests_per_user_per_day: number | null
          after_window_end: string | null
          after_window_start: string | null
          before_window_end: string | null
          before_window_start: string | null
          code_changes: Json | null
          created_at: string
          description: string
          expected_delta_error_rate: number | null
          expected_delta_requests_per_day: number | null
          id: string
          shipped_at: string
          title: string
          updated_at: string
        }
        Insert: {
          actual_delta_error_rate?: number | null
          actual_delta_requests_per_day?: number | null
          actual_delta_requests_per_user_per_day?: number | null
          after_window_end?: string | null
          after_window_start?: string | null
          before_window_end?: string | null
          before_window_start?: string | null
          code_changes?: Json | null
          created_at?: string
          description: string
          expected_delta_error_rate?: number | null
          expected_delta_requests_per_day?: number | null
          id?: string
          shipped_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          actual_delta_error_rate?: number | null
          actual_delta_requests_per_day?: number | null
          actual_delta_requests_per_user_per_day?: number | null
          after_window_end?: string | null
          after_window_start?: string | null
          before_window_end?: string | null
          before_window_start?: string | null
          code_changes?: Json | null
          created_at?: string
          description?: string
          expected_delta_error_rate?: number | null
          expected_delta_requests_per_day?: number | null
          id?: string
          shipped_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      api_monitor_rollups_daily: {
        Row: {
          created_at: string
          date: string
          error_breakdown: Json
          error_rate: number
          id: string
          top_endpoints: Json
          total_errors: number
          total_requests: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          date: string
          error_breakdown?: Json
          error_rate?: number
          id?: string
          top_endpoints?: Json
          total_errors?: number
          total_requests?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          error_breakdown?: Json
          error_rate?: number
          id?: string
          top_endpoints?: Json
          total_errors?: number
          total_requests?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_monitor_rollups_daily_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "api_monitor_rollups_daily_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "api_monitor_rollups_daily_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "api_monitor_rollups_daily_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_monitor_rollups_daily_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      api_monitor_snapshots: {
        Row: {
          bucket_type: string
          created_at: string
          error_rate: number
          id: string
          metadata: Json | null
          snapshot_time: string
          source: string
          suspected_bursts: Json
          time_bucket_end: string
          time_bucket_start: string
          top_callers: Json
          top_endpoints: Json
          top_errors: Json
          total_errors: number
          total_requests: number
        }
        Insert: {
          bucket_type: string
          created_at?: string
          error_rate?: number
          id?: string
          metadata?: Json | null
          snapshot_time?: string
          source: string
          suspected_bursts?: Json
          time_bucket_end: string
          time_bucket_start: string
          top_callers?: Json
          top_endpoints?: Json
          top_errors?: Json
          total_errors?: number
          total_requests?: number
        }
        Update: {
          bucket_type?: string
          created_at?: string
          error_rate?: number
          id?: string
          metadata?: Json | null
          snapshot_time?: string
          source?: string
          suspected_bursts?: Json
          time_bucket_end?: string
          time_bucket_start?: string
          top_callers?: Json
          top_endpoints?: Json
          top_errors?: Json
          total_errors?: number
          total_requests?: number
        }
        Relationships: []
      }
      api_requests: {
        Row: {
          api_key_id: string | null
          created_at: string | null
          endpoint: string
          id: string
          method: string
          response_time_ms: number | null
          status_code: number | null
          user_id: string | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string | null
          endpoint: string
          id?: string
          method: string
          response_time_ms?: number | null
          status_code?: number | null
          user_id?: string | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string | null
          endpoint?: string
          id?: string
          method?: string
          response_time_ms?: number | null
          status_code?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_requests_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          changed_at: string | null
          changed_fields: string[] | null
          id: string
          ip_address: unknown
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changed_at?: string | null
          changed_fields?: string[] | null
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changed_at?: string | null
          changed_fields?: string[] | null
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      automation_executions: {
        Row: {
          activity_id: string | null
          deal_id: string | null
          error_message: string | null
          executed_at: string | null
          executed_by: string | null
          execution_result: Json | null
          execution_time_ms: number | null
          id: string
          is_test_run: boolean | null
          nodes_executed: number | null
          nodes_total: number | null
          rule_id: string | null
          status: string
          task_id: string | null
          test_scenario_id: string | null
          trigger_data: Json
        }
        Insert: {
          activity_id?: string | null
          deal_id?: string | null
          error_message?: string | null
          executed_at?: string | null
          executed_by?: string | null
          execution_result?: Json | null
          execution_time_ms?: number | null
          id?: string
          is_test_run?: boolean | null
          nodes_executed?: number | null
          nodes_total?: number | null
          rule_id?: string | null
          status?: string
          task_id?: string | null
          test_scenario_id?: string | null
          trigger_data: Json
        }
        Update: {
          activity_id?: string | null
          deal_id?: string | null
          error_message?: string | null
          executed_at?: string | null
          executed_by?: string | null
          execution_result?: Json | null
          execution_time_ms?: number | null
          id?: string
          is_test_run?: boolean | null
          nodes_executed?: number | null
          nodes_total?: number | null
          rule_id?: string | null
          status?: string
          task_id?: string | null
          test_scenario_id?: string | null
          trigger_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "automation_executions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_executions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_executions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_executions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_event_log: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          metadata: Json | null
          occurred_at: string
          org_id: string | null
          payload: Json
          processed_at: string | null
          processing_error: string | null
          provider: string
          provider_event_id: string
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          occurred_at?: string
          org_id?: string | null
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          provider: string
          provider_event_id: string
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          occurred_at?: string
          org_id?: string | null
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          provider?: string
          provider_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_event_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_history: {
        Row: {
          amount: number
          created_at: string | null
          currency: string
          description: string | null
          event_type: string
          hosted_invoice_url: string | null
          id: string
          metadata: Json | null
          org_id: string
          pdf_url: string | null
          period_end: string | null
          period_start: string | null
          receipt_url: string | null
          status: string
          stripe_charge_id: string | null
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          stripe_refund_id: string | null
          subscription_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string
          description?: string | null
          event_type: string
          hosted_invoice_url?: string | null
          id?: string
          metadata?: Json | null
          org_id: string
          pdf_url?: string | null
          period_end?: string | null
          period_start?: string | null
          receipt_url?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          subscription_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string
          description?: string | null
          event_type?: string
          hosted_invoice_url?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string
          pdf_url?: string | null
          period_end?: string | null
          period_start?: string | null
          receipt_url?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_history_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "organization_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_history_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscription_facts_view"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_sources: {
        Row: {
          api_name: string
          category: string | null
          color: string | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          api_name: string
          category?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          api_name?: string
          category?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bot_deployments: {
        Row: {
          actual_join_time: string | null
          bot_id: string
          bot_image_url: string | null
          bot_name: string | null
          created_at: string | null
          entry_message: string | null
          error_code: string | null
          error_message: string | null
          id: string
          leave_time: string | null
          meeting_url: string
          org_id: string
          recording_id: string | null
          scheduled_join_time: string | null
          status: string | null
          status_history: Json | null
          updated_at: string | null
        }
        Insert: {
          actual_join_time?: string | null
          bot_id: string
          bot_image_url?: string | null
          bot_name?: string | null
          created_at?: string | null
          entry_message?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          leave_time?: string | null
          meeting_url: string
          org_id: string
          recording_id?: string | null
          scheduled_join_time?: string | null
          status?: string | null
          status_history?: Json | null
          updated_at?: string | null
        }
        Update: {
          actual_join_time?: string | null
          bot_id?: string
          bot_image_url?: string | null
          bot_name?: string | null
          created_at?: string | null
          entry_message?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          leave_time?: string | null
          meeting_url?: string
          org_id?: string
          recording_id?: string | null
          scheduled_join_time?: string | null
          status?: string | null
          status_history?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_deployments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_deployments_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      branding_settings: {
        Row: {
          created_at: string | null
          created_by: string | null
          icon_url: string | null
          id: string
          logo_dark_url: string | null
          logo_light_url: string | null
          org_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          icon_url?: string | null
          id?: string
          logo_dark_url?: string | null
          logo_light_url?: string | null
          org_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          icon_url?: string | null
          id?: string
          logo_dark_url?: string | null
          logo_light_url?: string | null
          org_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branding_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_attendees: {
        Row: {
          comment: string | null
          created_at: string | null
          email: string
          event_id: string
          id: string
          is_organizer: boolean | null
          is_required: boolean | null
          name: string | null
          responded_at: string | null
          response_status: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          email: string
          event_id: string
          id?: string
          is_organizer?: boolean | null
          is_required?: boolean | null
          name?: string | null
          responded_at?: string | null
          response_status?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          email?: string
          event_id?: string
          id?: string
          is_organizer?: boolean | null
          is_required?: boolean | null
          name?: string | null
          responded_at?: string | null
          response_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events_with_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_calendars: {
        Row: {
          clerk_org_id: string | null
          color: string | null
          created_at: string | null
          description: string | null
          external_id: string | null
          historical_sync_completed: boolean | null
          historical_sync_start_date: string | null
          id: string
          is_primary: boolean | null
          is_public: boolean | null
          is_visible: boolean | null
          last_sync_token: string | null
          last_synced_at: string | null
          name: string
          org_id: string
          settings: Json | null
          sync_enabled: boolean | null
          sync_frequency_minutes: number | null
          timezone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          clerk_org_id?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          historical_sync_completed?: boolean | null
          historical_sync_start_date?: string | null
          id?: string
          is_primary?: boolean | null
          is_public?: boolean | null
          is_visible?: boolean | null
          last_sync_token?: string | null
          last_synced_at?: string | null
          name: string
          org_id: string
          settings?: Json | null
          sync_enabled?: boolean | null
          sync_frequency_minutes?: number | null
          timezone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          clerk_org_id?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          historical_sync_completed?: boolean | null
          historical_sync_start_date?: string | null
          id?: string
          is_primary?: boolean | null
          is_public?: boolean | null
          is_visible?: boolean | null
          last_sync_token?: string | null
          last_synced_at?: string | null
          name?: string
          org_id?: string
          settings?: Json | null
          sync_enabled?: boolean | null
          sync_frequency_minutes?: number | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_calendars_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          ai_generated: boolean | null
          ai_suggested_time: boolean | null
          all_day: boolean | null
          attendees: Json | null
          attendees_count: number | null
          busy_status: string | null
          calendar_id: string
          clerk_org_id: string | null
          color: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          creator_email: string | null
          deal_id: string | null
          description: string | null
          end_time: string
          etag: string | null
          external_id: string | null
          external_updated_at: string | null
          hangout_link: string | null
          html_link: string | null
          id: string
          location: string | null
          mcp_connection_id: string | null
          meeting_id: string | null
          meeting_prep: Json | null
          meeting_provider: string | null
          meeting_url: string | null
          org_id: string | null
          organizer_email: string | null
          original_start_time: string | null
          raw_data: Json | null
          recurrence_id: string | null
          recurrence_rule: string | null
          reminders: Json | null
          response_status: string | null
          start_time: string
          status: string | null
          sync_error: string | null
          sync_status: string | null
          synced_at: string | null
          title: string
          transparency: string | null
          updated_at: string | null
          user_id: string
          visibility: string | null
          workflow_id: string | null
        }
        Insert: {
          ai_generated?: boolean | null
          ai_suggested_time?: boolean | null
          all_day?: boolean | null
          attendees?: Json | null
          attendees_count?: number | null
          busy_status?: string | null
          calendar_id: string
          clerk_org_id?: string | null
          color?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          creator_email?: string | null
          deal_id?: string | null
          description?: string | null
          end_time: string
          etag?: string | null
          external_id?: string | null
          external_updated_at?: string | null
          hangout_link?: string | null
          html_link?: string | null
          id?: string
          location?: string | null
          mcp_connection_id?: string | null
          meeting_id?: string | null
          meeting_prep?: Json | null
          meeting_provider?: string | null
          meeting_url?: string | null
          org_id?: string | null
          organizer_email?: string | null
          original_start_time?: string | null
          raw_data?: Json | null
          recurrence_id?: string | null
          recurrence_rule?: string | null
          reminders?: Json | null
          response_status?: string | null
          start_time: string
          status?: string | null
          sync_error?: string | null
          sync_status?: string | null
          synced_at?: string | null
          title: string
          transparency?: string | null
          updated_at?: string | null
          user_id: string
          visibility?: string | null
          workflow_id?: string | null
        }
        Update: {
          ai_generated?: boolean | null
          ai_suggested_time?: boolean | null
          all_day?: boolean | null
          attendees?: Json | null
          attendees_count?: number | null
          busy_status?: string | null
          calendar_id?: string
          clerk_org_id?: string | null
          color?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          creator_email?: string | null
          deal_id?: string | null
          description?: string | null
          end_time?: string
          etag?: string | null
          external_id?: string | null
          external_updated_at?: string | null
          hangout_link?: string | null
          html_link?: string | null
          id?: string
          location?: string | null
          mcp_connection_id?: string | null
          meeting_id?: string | null
          meeting_prep?: Json | null
          meeting_provider?: string | null
          meeting_url?: string | null
          org_id?: string | null
          organizer_email?: string | null
          original_start_time?: string | null
          raw_data?: Json | null
          recurrence_id?: string | null
          recurrence_rule?: string | null
          reminders?: Json | null
          response_status?: string | null
          start_time?: string
          status?: string | null
          sync_error?: string | null
          sync_status?: string | null
          synced_at?: string | null
          title?: string
          transparency?: string | null
          updated_at?: string | null
          user_id?: string
          visibility?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "calendar_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_mcp_connection_id_fkey"
            columns: ["mcp_connection_id"]
            isOneToOne: false
            referencedRelation: "mcp_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_reminders: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          is_sent: boolean | null
          minutes_before: number
          sent_at: string | null
          type: string | null
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          is_sent?: boolean | null
          minutes_before: number
          sent_at?: string | null
          type?: string | null
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          is_sent?: boolean | null
          minutes_before?: number
          sent_at?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_reminders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_reminders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events_with_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_sync_logs: {
        Row: {
          calendar_id: string | null
          completed_at: string | null
          error_message: string | null
          events_created: number | null
          events_deleted: number | null
          events_skipped: number | null
          events_updated: number | null
          id: string
          metadata: Json | null
          started_at: string | null
          sync_status: string
          sync_token_after: string | null
          sync_token_before: string | null
          sync_type: string
          user_id: string
        }
        Insert: {
          calendar_id?: string | null
          completed_at?: string | null
          error_message?: string | null
          events_created?: number | null
          events_deleted?: number | null
          events_skipped?: number | null
          events_updated?: number | null
          id?: string
          metadata?: Json | null
          started_at?: string | null
          sync_status: string
          sync_token_after?: string | null
          sync_token_before?: string | null
          sync_type: string
          user_id: string
        }
        Update: {
          calendar_id?: string | null
          completed_at?: string | null
          error_message?: string | null
          events_created?: number | null
          events_deleted?: number | null
          events_skipped?: number | null
          events_updated?: number | null
          id?: string
          metadata?: Json | null
          started_at?: string | null
          sync_status?: string
          sync_token_after?: string | null
          sync_token_before?: string | null
          sync_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_sync_logs_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "calendar_calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      call_action_items: {
        Row: {
          ai_generated: boolean
          assignee_email: string | null
          assignee_name: string | null
          call_id: string
          category: string | null
          completed: boolean
          completed_at: string | null
          confidence_score: number | null
          created_at: string | null
          deadline_at: string | null
          description: string | null
          id: string
          importance: string | null
          linked_task_id: string | null
          org_id: string
          playback_url: string | null
          priority: string | null
          sync_error: string | null
          sync_status: string
          synced_at: string | null
          synced_to_task: boolean
          timestamp_seconds: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          ai_generated?: boolean
          assignee_email?: string | null
          assignee_name?: string | null
          call_id: string
          category?: string | null
          completed?: boolean
          completed_at?: string | null
          confidence_score?: number | null
          created_at?: string | null
          deadline_at?: string | null
          description?: string | null
          id?: string
          importance?: string | null
          linked_task_id?: string | null
          org_id: string
          playback_url?: string | null
          priority?: string | null
          sync_error?: string | null
          sync_status?: string
          synced_at?: string | null
          synced_to_task?: boolean
          timestamp_seconds?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          ai_generated?: boolean
          assignee_email?: string | null
          assignee_name?: string | null
          call_id?: string
          category?: string | null
          completed?: boolean
          completed_at?: string | null
          confidence_score?: number | null
          created_at?: string | null
          deadline_at?: string | null
          description?: string | null
          id?: string
          importance?: string | null
          linked_task_id?: string | null
          org_id?: string
          playback_url?: string | null
          priority?: string | null
          sync_error?: string | null
          sync_status?: string
          synced_at?: string | null
          synced_to_task?: boolean
          timestamp_seconds?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_action_items_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_action_items_linked_task_id_fkey"
            columns: ["linked_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_action_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_file_search_index: {
        Row: {
          call_id: string
          content_hash: string | null
          error_message: string | null
          file_name: string | null
          id: string
          indexed_at: string | null
          metadata: Json
          org_id: string
          owner_user_id: string | null
          status: string
          store_name: string
        }
        Insert: {
          call_id: string
          content_hash?: string | null
          error_message?: string | null
          file_name?: string | null
          id?: string
          indexed_at?: string | null
          metadata?: Json
          org_id: string
          owner_user_id?: string | null
          status?: string
          store_name: string
        }
        Update: {
          call_id?: string
          content_hash?: string | null
          error_message?: string | null
          file_name?: string | null
          id?: string
          indexed_at?: string | null
          metadata?: Json
          org_id?: string
          owner_user_id?: string | null
          status?: string
          store_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_file_search_index_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_file_search_index_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_index_queue: {
        Row: {
          attempts: number
          call_id: string
          created_at: string | null
          error_message: string | null
          id: string
          last_attempt_at: string | null
          max_attempts: number
          org_id: string
          owner_user_id: string | null
          priority: number
        }
        Insert: {
          attempts?: number
          call_id: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          org_id: string
          owner_user_id?: string | null
          priority?: number
        }
        Update: {
          attempts?: number
          call_id?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          org_id?: string
          owner_user_id?: string | null
          priority?: number
        }
        Relationships: [
          {
            foreignKeyName: "call_index_queue_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_index_queue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_transcript_queue: {
        Row: {
          attempts: number
          call_id: string
          created_at: string | null
          error_message: string | null
          id: string
          last_attempt_at: string | null
          max_attempts: number
          org_id: string
          priority: number
        }
        Insert: {
          attempts?: number
          call_id: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          org_id: string
          priority?: number
        }
        Update: {
          attempts?: number
          call_id?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          org_id?: string
          priority?: number
        }
        Relationships: [
          {
            foreignKeyName: "call_transcript_queue_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_transcript_queue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          agent_email: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          deal_id: string | null
          direction: string
          duration_seconds: number | null
          ended_at: string | null
          external_id: string
          from_number: string | null
          has_recording: boolean
          id: string
          justcall_agent_id: string | null
          last_synced_at: string | null
          last_transcript_fetch_at: string | null
          org_id: string
          owner_email: string | null
          owner_user_id: string | null
          provider: string
          recording_mime: string | null
          recording_url: string | null
          sentiment_reasoning: string | null
          sentiment_score: number | null
          started_at: string | null
          status: string | null
          summary: string | null
          to_number: string | null
          transcript_fetch_attempts: number
          transcript_json: Json | null
          transcript_status: string
          transcript_text: string | null
          updated_at: string | null
        }
        Insert: {
          agent_email?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          external_id: string
          from_number?: string | null
          has_recording?: boolean
          id?: string
          justcall_agent_id?: string | null
          last_synced_at?: string | null
          last_transcript_fetch_at?: string | null
          org_id: string
          owner_email?: string | null
          owner_user_id?: string | null
          provider?: string
          recording_mime?: string | null
          recording_url?: string | null
          sentiment_reasoning?: string | null
          sentiment_score?: number | null
          started_at?: string | null
          status?: string | null
          summary?: string | null
          to_number?: string | null
          transcript_fetch_attempts?: number
          transcript_json?: Json | null
          transcript_status?: string
          transcript_text?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_email?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          external_id?: string
          from_number?: string | null
          has_recording?: boolean
          id?: string
          justcall_agent_id?: string | null
          last_synced_at?: string | null
          last_transcript_fetch_at?: string | null
          org_id?: string
          owner_email?: string | null
          owner_user_id?: string | null
          provider?: string
          recording_mime?: string | null
          recording_url?: string | null
          sentiment_reasoning?: string | null
          sentiment_score?: number | null
          started_at?: string | null
          status?: string | null
          summary?: string | null
          to_number?: string | null
          transcript_fetch_attempts?: number
          transcript_json?: Json | null
          transcript_status?: string
          transcript_text?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_features: {
        Row: {
          challenge_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          order_index: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          challenge_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          order_index?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          challenge_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          order_index?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "challenge_features_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          order_index: number | null
          subtext: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          order_index?: number | null
          subtext?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          order_index?: number | null
          subtext?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      clerk_sync_log: {
        Row: {
          clerk_id: string
          error_message: string | null
          event_data: Json | null
          event_type: string
          id: string
          success: boolean | null
          synced_at: string | null
        }
        Insert: {
          clerk_id: string
          error_message?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          success?: boolean | null
          synced_at?: string | null
        }
        Update: {
          clerk_id?: string
          error_message?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          success?: boolean | null
          synced_at?: string | null
        }
        Relationships: []
      }
      clerk_user_mappings: {
        Row: {
          clerk_user_id: string
          created_at: string | null
          email: string
          supabase_user_id: string
          updated_at: string | null
        }
        Insert: {
          clerk_user_id: string
          created_at?: string | null
          email: string
          supabase_user_id: string
          updated_at?: string | null
        }
        Update: {
          clerk_user_id?: string
          created_at?: string | null
          email?: string
          supabase_user_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          churn_date: string | null
          churn_reason: string | null
          clerk_org_id: string | null
          company_name: string
          contact_email: string | null
          contact_name: string | null
          created_at: string | null
          deal_id: string | null
          final_billing_date: string | null
          id: string
          notice_given_date: string | null
          owner_id: string
          status: Database["public"]["Enums"]["client_status"]
          subscription_amount: number | null
          subscription_start_date: string | null
          updated_at: string | null
        }
        Insert: {
          churn_date?: string | null
          churn_reason?: string | null
          clerk_org_id?: string | null
          company_name: string
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string | null
          deal_id?: string | null
          final_billing_date?: string | null
          id?: string
          notice_given_date?: string | null
          owner_id: string
          status?: Database["public"]["Enums"]["client_status"]
          subscription_amount?: number | null
          subscription_start_date?: string | null
          updated_at?: string | null
        }
        Update: {
          churn_date?: string | null
          churn_reason?: string | null
          clerk_org_id?: string | null
          company_name?: string
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string | null
          deal_id?: string | null
          final_billing_date?: string | null
          id?: string
          notice_given_date?: string | null
          owner_id?: string
          status?: Database["public"]["Enums"]["client_status"]
          subscription_amount?: number | null
          subscription_start_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "clients_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clients_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "clients_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      coaching_scorecard_templates: {
        Row: {
          call_type_id: string | null
          checklist_items: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          excellence_score: number | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          meeting_type: string
          metrics: Json
          name: string
          org_id: string
          passing_score: number | null
          script_flow: Json | null
          updated_at: string | null
        }
        Insert: {
          call_type_id?: string | null
          checklist_items?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          excellence_score?: number | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          meeting_type: string
          metrics?: Json
          name: string
          org_id: string
          passing_score?: number | null
          script_flow?: Json | null
          updated_at?: string | null
        }
        Update: {
          call_type_id?: string | null
          checklist_items?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          excellence_score?: number | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          meeting_type?: string
          metrics?: Json
          name?: string
          org_id?: string
          passing_score?: number | null
          script_flow?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coaching_scorecard_templates_call_type_id_fkey"
            columns: ["call_type_id"]
            isOneToOne: false
            referencedRelation: "org_call_types"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_events: {
        Row: {
          action_items: Json | null
          ai_analyzed: boolean | null
          ai_model: string | null
          body: string | null
          click_count: number | null
          communication_date: string
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          deal_id: string | null
          direction: string
          email_body_preview: string | null
          email_subject: string | null
          email_thread_id: string | null
          event_timestamp: string
          event_type: string
          external_id: string | null
          external_source: string | null
          id: string
          is_thread_start: boolean | null
          key_topics: Json | null
          metadata: Json | null
          open_count: number | null
          previous_event_id: string | null
          response_required: boolean | null
          response_time_hours: number | null
          sentiment_label: string | null
          sentiment_score: number | null
          snippet: string | null
          subject: string | null
          sync_source: string | null
          thread_id: string | null
          thread_position: number | null
          tone: string | null
          urgency: string | null
          user_id: string
          was_clicked: boolean | null
          was_opened: boolean | null
          was_replied: boolean | null
        }
        Insert: {
          action_items?: Json | null
          ai_analyzed?: boolean | null
          ai_model?: string | null
          body?: string | null
          click_count?: number | null
          communication_date?: string
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          direction: string
          email_body_preview?: string | null
          email_subject?: string | null
          email_thread_id?: string | null
          event_timestamp: string
          event_type: string
          external_id?: string | null
          external_source?: string | null
          id?: string
          is_thread_start?: boolean | null
          key_topics?: Json | null
          metadata?: Json | null
          open_count?: number | null
          previous_event_id?: string | null
          response_required?: boolean | null
          response_time_hours?: number | null
          sentiment_label?: string | null
          sentiment_score?: number | null
          snippet?: string | null
          subject?: string | null
          sync_source?: string | null
          thread_id?: string | null
          thread_position?: number | null
          tone?: string | null
          urgency?: string | null
          user_id: string
          was_clicked?: boolean | null
          was_opened?: boolean | null
          was_replied?: boolean | null
        }
        Update: {
          action_items?: Json | null
          ai_analyzed?: boolean | null
          ai_model?: string | null
          body?: string | null
          click_count?: number | null
          communication_date?: string
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          direction?: string
          email_body_preview?: string | null
          email_subject?: string | null
          email_thread_id?: string | null
          event_timestamp?: string
          event_type?: string
          external_id?: string | null
          external_source?: string | null
          id?: string
          is_thread_start?: boolean | null
          key_topics?: Json | null
          metadata?: Json | null
          open_count?: number | null
          previous_event_id?: string | null
          response_required?: boolean | null
          response_time_hours?: number | null
          sentiment_label?: string | null
          sentiment_score?: number | null
          snippet?: string | null
          subject?: string | null
          sync_source?: string | null
          thread_id?: string | null
          thread_position?: number | null
          tone?: string | null
          urgency?: string | null
          user_id?: string
          was_clicked?: boolean | null
          was_opened?: boolean | null
          was_replied?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_events_previous_event_id_fkey"
            columns: ["previous_event_id"]
            isOneToOne: false
            referencedRelation: "communication_events"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          clerk_org_id: string | null
          created_at: string | null
          description: string | null
          domain: string | null
          first_seen_at: string | null
          id: string
          industry: string | null
          linkedin_url: string | null
          name: string
          owner_id: string
          phone: string | null
          size: string | null
          source: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          clerk_org_id?: string | null
          created_at?: string | null
          description?: string | null
          domain?: string | null
          first_seen_at?: string | null
          id?: string
          industry?: string | null
          linkedin_url?: string | null
          name: string
          owner_id: string
          phone?: string | null
          size?: string | null
          source?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          clerk_org_id?: string | null
          created_at?: string | null
          description?: string | null
          domain?: string | null
          first_seen_at?: string | null
          id?: string
          industry?: string | null
          linkedin_url?: string | null
          name?: string
          owner_id?: string
          phone?: string | null
          size?: string | null
          source?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "companies_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "companies_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "companies_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      company_meeting_insights: {
        Row: {
          avg_sentiment_score: number | null
          buying_committee_size: number | null
          company_id: string
          competitors_mentioned: string[] | null
          created_at: string | null
          deal_probability: number | null
          decision_makers: string[] | null
          decision_timeline_days: number | null
          engagement_score: number | null
          id: string
          inferred_deal_stage: string | null
          insights_summary: string | null
          key_topics: string[] | null
          last_meeting_date: string | null
          last_updated_at: string | null
          meeting_frequency_days: number | null
          pain_points: string[] | null
          sentiment_trend: string | null
          total_contacts_met: number | null
          total_meetings: number | null
        }
        Insert: {
          avg_sentiment_score?: number | null
          buying_committee_size?: number | null
          company_id: string
          competitors_mentioned?: string[] | null
          created_at?: string | null
          deal_probability?: number | null
          decision_makers?: string[] | null
          decision_timeline_days?: number | null
          engagement_score?: number | null
          id?: string
          inferred_deal_stage?: string | null
          insights_summary?: string | null
          key_topics?: string[] | null
          last_meeting_date?: string | null
          last_updated_at?: string | null
          meeting_frequency_days?: number | null
          pain_points?: string[] | null
          sentiment_trend?: string | null
          total_contacts_met?: number | null
          total_meetings?: number | null
        }
        Update: {
          avg_sentiment_score?: number | null
          buying_committee_size?: number | null
          company_id?: string
          competitors_mentioned?: string[] | null
          created_at?: string | null
          deal_probability?: number | null
          decision_makers?: string[] | null
          decision_timeline_days?: number | null
          engagement_score?: number | null
          id?: string
          inferred_deal_stage?: string | null
          insights_summary?: string | null
          key_topics?: string[] | null
          last_meeting_date?: string | null
          last_updated_at?: string | null
          meeting_frequency_days?: number | null
          pain_points?: string[] | null
          sentiment_trend?: string | null
          total_contacts_met?: number | null
          total_meetings?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "company_meeting_insights_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_meeting_insights: {
        Row: {
          avg_sentiment_score: number | null
          avg_talk_time_customer_pct: number | null
          competitors_mentioned: string[] | null
          contact_id: string
          created_at: string | null
          decision_criteria: string[] | null
          engagement_score: number | null
          id: string
          insights_summary: string | null
          key_topics: string[] | null
          last_meeting_date: string | null
          last_updated_at: string | null
          next_suggested_followup: string | null
          objections: string[] | null
          pain_points: string[] | null
          response_rate: number | null
          sentiment_trend: string | null
          total_meetings: number | null
        }
        Insert: {
          avg_sentiment_score?: number | null
          avg_talk_time_customer_pct?: number | null
          competitors_mentioned?: string[] | null
          contact_id: string
          created_at?: string | null
          decision_criteria?: string[] | null
          engagement_score?: number | null
          id?: string
          insights_summary?: string | null
          key_topics?: string[] | null
          last_meeting_date?: string | null
          last_updated_at?: string | null
          next_suggested_followup?: string | null
          objections?: string[] | null
          pain_points?: string[] | null
          response_rate?: number | null
          sentiment_trend?: string | null
          total_meetings?: number | null
        }
        Update: {
          avg_sentiment_score?: number | null
          avg_talk_time_customer_pct?: number | null
          competitors_mentioned?: string[] | null
          contact_id?: string
          created_at?: string | null
          decision_criteria?: string[] | null
          engagement_score?: number | null
          id?: string
          insights_summary?: string | null
          key_topics?: string[] | null
          last_meeting_date?: string | null
          last_updated_at?: string | null
          next_suggested_followup?: string | null
          objections?: string[] | null
          pain_points?: string[] | null
          response_rate?: number | null
          sentiment_trend?: string | null
          total_meetings?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_meeting_insights_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_notes: {
        Row: {
          clerk_org_id: string | null
          contact_id: string
          content: string
          created_at: string | null
          created_by: string
          id: string
          is_pinned: boolean | null
          tags: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          clerk_org_id?: string | null
          contact_id: string
          content: string
          created_at?: string | null
          created_by: string
          id?: string
          is_pinned?: boolean | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          clerk_org_id?: string | null
          contact_id?: string
          content?: string
          created_at?: string | null
          created_by?: string
          id?: string
          is_pinned?: boolean | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          clerk_org_id: string | null
          company: string | null
          company_id: string | null
          created_at: string | null
          email: string
          engagement_level: string | null
          first_name: string | null
          first_seen_at: string | null
          full_name: string | null
          health_score: number | null
          id: string
          is_primary: boolean | null
          last_ai_analysis: string | null
          last_interaction_at: string | null
          last_name: string | null
          linkedin_url: string | null
          owner_id: string | null
          phone: string | null
          source: string | null
          title: string | null
          total_meetings_count: number | null
          updated_at: string | null
        }
        Insert: {
          clerk_org_id?: string | null
          company?: string | null
          company_id?: string | null
          created_at?: string | null
          email: string
          engagement_level?: string | null
          first_name?: string | null
          first_seen_at?: string | null
          full_name?: string | null
          health_score?: number | null
          id?: string
          is_primary?: boolean | null
          last_ai_analysis?: string | null
          last_interaction_at?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          owner_id?: string | null
          phone?: string | null
          source?: string | null
          title?: string | null
          total_meetings_count?: number | null
          updated_at?: string | null
        }
        Update: {
          clerk_org_id?: string | null
          company?: string | null
          company_id?: string | null
          created_at?: string | null
          email?: string
          engagement_level?: string | null
          first_name?: string | null
          first_seen_at?: string | null
          full_name?: string | null
          health_score?: number | null
          id?: string
          is_primary?: boolean | null
          last_ai_analysis?: string | null
          last_interaction_at?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          owner_id?: string | null
          phone?: string | null
          source?: string | null
          title?: string | null
          total_meetings_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_contacts_company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      content: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          duration: number | null
          id: string
          is_active: boolean | null
          thumbnail: string | null
          title: string
          type: string
          updated_at: string | null
          url: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          duration?: number | null
          id?: string
          is_active?: boolean | null
          thumbnail?: string | null
          title: string
          type: string
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          duration?: number | null
          id?: string
          is_active?: boolean | null
          thumbnail?: string | null
          title?: string
          type?: string
          updated_at?: string | null
          url?: string | null
        }
        Relationships: []
      }
      content_topic_links: {
        Row: {
          content_id: string
          created_at: string
          topic_index: number
        }
        Insert: {
          content_id: string
          created_at?: string
          topic_index: number
        }
        Update: {
          content_id?: string
          created_at?: string
          topic_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_topic_links_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "meeting_generated_content"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_analytics: {
        Row: {
          claude_api_time_ms: number | null
          context_type: string | null
          conversation_id: string | null
          created_at: string | null
          error_message: string | null
          error_type: string | null
          estimated_cost_cents: number | null
          has_context: boolean | null
          id: string
          input_tokens: number | null
          message_length: number | null
          output_tokens: number | null
          request_type: string
          response_length: number | null
          response_time_ms: number | null
          status: string
          tool_execution_time_ms: number | null
          tool_iterations: number | null
          tools_error_count: number | null
          tools_success_count: number | null
          tools_used: Json | null
          user_id: string
        }
        Insert: {
          claude_api_time_ms?: number | null
          context_type?: string | null
          conversation_id?: string | null
          created_at?: string | null
          error_message?: string | null
          error_type?: string | null
          estimated_cost_cents?: number | null
          has_context?: boolean | null
          id?: string
          input_tokens?: number | null
          message_length?: number | null
          output_tokens?: number | null
          request_type: string
          response_length?: number | null
          response_time_ms?: number | null
          status?: string
          tool_execution_time_ms?: number | null
          tool_iterations?: number | null
          tools_error_count?: number | null
          tools_success_count?: number | null
          tools_used?: Json | null
          user_id: string
        }
        Update: {
          claude_api_time_ms?: number | null
          context_type?: string | null
          conversation_id?: string | null
          created_at?: string | null
          error_message?: string | null
          error_type?: string | null
          estimated_cost_cents?: number | null
          has_context?: boolean | null
          id?: string
          input_tokens?: number | null
          message_length?: number | null
          output_tokens?: number | null
          request_type?: string
          response_length?: number | null
          response_time_ms?: number | null
          status?: string
          tool_execution_time_ms?: number | null
          tool_iterations?: number | null
          tools_error_count?: number | null
          tools_success_count?: number | null
          tools_used?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_analytics_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "copilot_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_conversations: {
        Row: {
          created_at: string | null
          id: string
          org_id: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          org_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          org_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "copilot_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_rates: {
        Row: {
          created_at: string | null
          effective_from: string | null
          effective_to: string | null
          id: string
          input_cost_per_million: number
          model: string
          output_cost_per_million: number
          provider: string
        }
        Insert: {
          created_at?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          input_cost_per_million: number
          model: string
          output_cost_per_million: number
          provider: string
        }
        Update: {
          created_at?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          input_cost_per_million?: number
          model?: string
          output_cost_per_million?: number
          provider?: string
        }
        Relationships: []
      }
      cron_job_logs: {
        Row: {
          created_at: string | null
          error_details: string | null
          id: string
          job_name: string
          message: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          error_details?: string | null
          id?: string
          job_name: string
          message?: string | null
          status: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          error_details?: string | null
          id?: string
          job_name?: string
          message?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      cron_job_settings: {
        Row: {
          alert_after_consecutive_failures: number | null
          alert_on_failure: boolean
          category: string | null
          created_at: string
          description: string | null
          display_name: string | null
          id: string
          is_monitored: boolean
          job_name: string
          max_runtime_seconds: number | null
          updated_at: string
        }
        Insert: {
          alert_after_consecutive_failures?: number | null
          alert_on_failure?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          display_name?: string | null
          id?: string
          is_monitored?: boolean
          job_name: string
          max_runtime_seconds?: number | null
          updated_at?: string
        }
        Update: {
          alert_after_consecutive_failures?: number | null
          alert_on_failure?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          display_name?: string | null
          id?: string
          is_monitored?: boolean
          job_name?: string
          max_runtime_seconds?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      cron_notification_subscribers: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
          is_active: boolean
          name: string | null
          notify_on_failure: boolean
          notify_on_success: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          is_active?: boolean
          name?: string | null
          notify_on_failure?: boolean
          notify_on_success?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          is_active?: boolean
          name?: string | null
          notify_on_failure?: boolean
          notify_on_success?: boolean
        }
        Relationships: []
      }
      cron_notifications_log: {
        Row: {
          created_at: string
          error_details: string | null
          id: string
          job_id: number | null
          job_name: string
          message: string | null
          notification_type: string
          recipients: string[]
          run_id: number | null
          sent_at: string | null
          status: string
          subject: string | null
        }
        Insert: {
          created_at?: string
          error_details?: string | null
          id?: string
          job_id?: number | null
          job_name: string
          message?: string | null
          notification_type: string
          recipients: string[]
          run_id?: number | null
          sent_at?: string | null
          status: string
          subject?: string | null
        }
        Update: {
          created_at?: string
          error_details?: string | null
          id?: string
          job_id?: number | null
          job_name?: string
          message?: string | null
          notification_type?: string
          recipients?: string[]
          run_id?: number | null
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: []
      }
      csv_mapping_templates: {
        Row: {
          column_mappings: Json
          created_at: string | null
          description: string | null
          id: string
          last_used_at: string | null
          name: string
          source_hint: string | null
          updated_at: string | null
          usage_count: number | null
          user_id: string
        }
        Insert: {
          column_mappings?: Json
          created_at?: string | null
          description?: string | null
          id?: string
          last_used_at?: string | null
          name: string
          source_hint?: string | null
          updated_at?: string | null
          usage_count?: number | null
          user_id: string
        }
        Update: {
          column_mappings?: Json
          created_at?: string | null
          description?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          source_hint?: string | null
          updated_at?: string | null
          usage_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      deal_activities: {
        Row: {
          activity_id: string | null
          activity_type: string
          completed: boolean | null
          contact_email: string | null
          created_at: string | null
          deal_id: string | null
          due_date: string | null
          id: string
          is_matched: boolean | null
          notes: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          activity_id?: string | null
          activity_type: string
          completed?: boolean | null
          contact_email?: string | null
          created_at?: string | null
          deal_id?: string | null
          due_date?: string | null
          id?: string
          is_matched?: boolean | null
          notes?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          activity_id?: string | null
          activity_type?: string
          completed?: boolean | null
          contact_email?: string | null
          created_at?: string | null
          deal_id?: string | null
          due_date?: string | null
          id?: string
          is_matched?: boolean | null
          notes?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_activities_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_activities_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_clarity_scores: {
        Row: {
          champion_score: number | null
          clarity_score: number | null
          close_plan_completed: number | null
          close_plan_overdue: number | null
          close_plan_total: number | null
          created_at: string | null
          deal_id: string
          economic_buyer_score: number | null
          id: string
          last_calculated_at: string | null
          momentum_score: number | null
          next_step_score: number | null
          org_id: string
          risks_score: number | null
          success_metric_score: number | null
          updated_at: string | null
        }
        Insert: {
          champion_score?: number | null
          clarity_score?: number | null
          close_plan_completed?: number | null
          close_plan_overdue?: number | null
          close_plan_total?: number | null
          created_at?: string | null
          deal_id: string
          economic_buyer_score?: number | null
          id?: string
          last_calculated_at?: string | null
          momentum_score?: number | null
          next_step_score?: number | null
          org_id: string
          risks_score?: number | null
          success_metric_score?: number | null
          updated_at?: string | null
        }
        Update: {
          champion_score?: number | null
          clarity_score?: number | null
          close_plan_completed?: number | null
          close_plan_overdue?: number | null
          close_plan_total?: number | null
          created_at?: string | null
          deal_id?: string
          economic_buyer_score?: number | null
          id?: string
          last_calculated_at?: string | null
          momentum_score?: number | null
          next_step_score?: number | null
          org_id?: string
          risks_score?: number | null
          success_metric_score?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_clarity_scores_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_clarity_scores_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_close_plan_items: {
        Row: {
          blocker_note: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          deal_id: string
          due_date: string | null
          id: string
          linked_task_id: string | null
          milestone_key: string
          notes: string | null
          org_id: string
          owner_id: string | null
          sort_order: number | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          blocker_note?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          deal_id: string
          due_date?: string | null
          id?: string
          linked_task_id?: string | null
          milestone_key: string
          notes?: string | null
          org_id: string
          owner_id?: string | null
          sort_order?: number | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          blocker_note?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          deal_id?: string
          due_date?: string | null
          id?: string
          linked_task_id?: string | null
          milestone_key?: string
          notes?: string | null
          org_id?: string
          owner_id?: string | null
          sort_order?: number | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_close_plan_items_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "deal_close_plan_items_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "deal_close_plan_items_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "deal_close_plan_items_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_close_plan_items_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "deal_close_plan_items_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_close_plan_items_linked_task_id_fkey"
            columns: ["linked_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_close_plan_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_close_plan_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "deal_close_plan_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "deal_close_plan_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "deal_close_plan_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_close_plan_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      deal_health_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          action_priority: string | null
          alert_type: string
          created_at: string | null
          deal_id: string
          dismissed_at: string | null
          health_score_id: string | null
          id: string
          message: string
          metadata: Json | null
          notification_id: string | null
          notification_sent: boolean | null
          notification_sent_at: string | null
          resolved_at: string | null
          severity: string | null
          status: string | null
          suggested_actions: string[] | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          action_priority?: string | null
          alert_type: string
          created_at?: string | null
          deal_id: string
          dismissed_at?: string | null
          health_score_id?: string | null
          id?: string
          message: string
          metadata?: Json | null
          notification_id?: string | null
          notification_sent?: boolean | null
          notification_sent_at?: string | null
          resolved_at?: string | null
          severity?: string | null
          status?: string | null
          suggested_actions?: string[] | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          action_priority?: string | null
          alert_type?: string
          created_at?: string | null
          deal_id?: string
          dismissed_at?: string | null
          health_score_id?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          notification_id?: string | null
          notification_sent?: boolean | null
          notification_sent_at?: string | null
          resolved_at?: string | null
          severity?: string | null
          status?: string | null
          suggested_actions?: string[] | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_health_alerts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_health_alerts_health_score_id_fkey"
            columns: ["health_score_id"]
            isOneToOne: false
            referencedRelation: "deal_health_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_health_history: {
        Row: {
          activity_score: number | null
          created_at: string | null
          deal_id: string
          engagement_score: number | null
          id: string
          overall_health_score: number | null
          sentiment_score: number | null
          snapshot_at: string | null
          stage_velocity_score: number | null
        }
        Insert: {
          activity_score?: number | null
          created_at?: string | null
          deal_id: string
          engagement_score?: number | null
          id?: string
          overall_health_score?: number | null
          sentiment_score?: number | null
          snapshot_at?: string | null
          stage_velocity_score?: number | null
        }
        Update: {
          activity_score?: number | null
          created_at?: string | null
          deal_id?: string
          engagement_score?: number | null
          id?: string
          overall_health_score?: number | null
          sentiment_score?: number | null
          snapshot_at?: string | null
          stage_velocity_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_health_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_health_rules: {
        Row: {
          alert_message_template: string | null
          alert_severity: string | null
          conditions: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_system_rule: boolean | null
          rule_name: string
          rule_type: string
          suggested_action_template: string | null
          threshold_operator: string | null
          threshold_unit: string | null
          threshold_value: number
          updated_at: string | null
        }
        Insert: {
          alert_message_template?: string | null
          alert_severity?: string | null
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system_rule?: boolean | null
          rule_name: string
          rule_type: string
          suggested_action_template?: string | null
          threshold_operator?: string | null
          threshold_unit?: string | null
          threshold_value: number
          updated_at?: string | null
        }
        Update: {
          alert_message_template?: string | null
          alert_severity?: string | null
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system_rule?: boolean | null
          rule_name?: string
          rule_type?: string
          suggested_action_template?: string | null
          threshold_operator?: string | null
          threshold_unit?: string | null
          threshold_value?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      deal_health_scores: {
        Row: {
          activity_count_last_30_days: number | null
          activity_score: number | null
          avg_response_time_hours: number | null
          avg_sentiment_last_3_meetings: number | null
          created_at: string | null
          days_in_current_stage: number | null
          days_since_last_activity: number | null
          days_since_last_meeting: number | null
          deal_id: string
          engagement_score: number | null
          health_status: string | null
          id: string
          last_calculated_at: string | null
          meeting_count_last_30_days: number | null
          overall_health_score: number | null
          predicted_close_probability: number | null
          predicted_days_to_close: number | null
          response_time_score: number | null
          risk_factors: string[] | null
          risk_level: string | null
          sentiment_score: number | null
          sentiment_trend: string | null
          stage_velocity_score: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          activity_count_last_30_days?: number | null
          activity_score?: number | null
          avg_response_time_hours?: number | null
          avg_sentiment_last_3_meetings?: number | null
          created_at?: string | null
          days_in_current_stage?: number | null
          days_since_last_activity?: number | null
          days_since_last_meeting?: number | null
          deal_id: string
          engagement_score?: number | null
          health_status?: string | null
          id?: string
          last_calculated_at?: string | null
          meeting_count_last_30_days?: number | null
          overall_health_score?: number | null
          predicted_close_probability?: number | null
          predicted_days_to_close?: number | null
          response_time_score?: number | null
          risk_factors?: string[] | null
          risk_level?: string | null
          sentiment_score?: number | null
          sentiment_trend?: string | null
          stage_velocity_score?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          activity_count_last_30_days?: number | null
          activity_score?: number | null
          avg_response_time_hours?: number | null
          avg_sentiment_last_3_meetings?: number | null
          created_at?: string | null
          days_in_current_stage?: number | null
          days_since_last_activity?: number | null
          days_since_last_meeting?: number | null
          deal_id?: string
          engagement_score?: number | null
          health_status?: string | null
          id?: string
          last_calculated_at?: string | null
          meeting_count_last_30_days?: number | null
          overall_health_score?: number | null
          predicted_close_probability?: number | null
          predicted_days_to_close?: number | null
          response_time_score?: number | null
          risk_factors?: string[] | null
          risk_level?: string | null
          sentiment_score?: number | null
          sentiment_trend?: string | null
          stage_velocity_score?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_health_scores_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_migration_reviews: {
        Row: {
          created_at: string | null
          deal_id: string
          id: string
          original_company: string | null
          original_contact_email: string | null
          original_contact_name: string | null
          reason: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
          suggested_company_id: string | null
          suggested_contact_id: string | null
        }
        Insert: {
          created_at?: string | null
          deal_id: string
          id?: string
          original_company?: string | null
          original_contact_email?: string | null
          original_contact_name?: string | null
          reason: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          suggested_company_id?: string | null
          suggested_contact_id?: string | null
        }
        Update: {
          created_at?: string | null
          deal_id?: string
          id?: string
          original_company?: string | null
          original_contact_email?: string | null
          original_contact_name?: string | null
          reason?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          suggested_company_id?: string | null
          suggested_contact_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_migration_reviews_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_migration_reviews_suggested_company_id_fkey"
            columns: ["suggested_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_migration_reviews_suggested_contact_id_fkey"
            columns: ["suggested_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_notes: {
        Row: {
          clerk_org_id: string | null
          content: string
          created_at: string | null
          created_by: string
          deal_id: string
          id: string
          is_pinned: boolean | null
          tags: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          clerk_org_id?: string | null
          content: string
          created_at?: string | null
          created_by: string
          deal_id: string
          id?: string
          is_pinned?: boolean | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          clerk_org_id?: string | null
          content?: string
          created_at?: string | null
          created_by?: string
          deal_id?: string
          id?: string
          is_pinned?: boolean | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_notes_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_risk_aggregates: {
        Row: {
          active_signals_count: number | null
          avg_sentiment_last_3_meetings: number | null
          created_at: string | null
          critical_signals_count: number | null
          days_since_champion_contact: number | null
          days_since_last_meeting: number | null
          days_without_forward_movement: number | null
          deal_id: string | null
          high_signals_count: number | null
          id: string
          last_calculated_at: string | null
          last_forward_movement_at: string | null
          low_signals_count: number | null
          medium_signals_count: number | null
          meeting_frequency_trend: string | null
          org_id: string
          overall_risk_level: string | null
          recommended_actions: Json | null
          risk_score: number | null
          risk_summary: string | null
          sentiment_change_pct: number | null
          sentiment_trend: string | null
          signal_breakdown: Json | null
          updated_at: string | null
        }
        Insert: {
          active_signals_count?: number | null
          avg_sentiment_last_3_meetings?: number | null
          created_at?: string | null
          critical_signals_count?: number | null
          days_since_champion_contact?: number | null
          days_since_last_meeting?: number | null
          days_without_forward_movement?: number | null
          deal_id?: string | null
          high_signals_count?: number | null
          id?: string
          last_calculated_at?: string | null
          last_forward_movement_at?: string | null
          low_signals_count?: number | null
          medium_signals_count?: number | null
          meeting_frequency_trend?: string | null
          org_id: string
          overall_risk_level?: string | null
          recommended_actions?: Json | null
          risk_score?: number | null
          risk_summary?: string | null
          sentiment_change_pct?: number | null
          sentiment_trend?: string | null
          signal_breakdown?: Json | null
          updated_at?: string | null
        }
        Update: {
          active_signals_count?: number | null
          avg_sentiment_last_3_meetings?: number | null
          created_at?: string | null
          critical_signals_count?: number | null
          days_since_champion_contact?: number | null
          days_since_last_meeting?: number | null
          days_without_forward_movement?: number | null
          deal_id?: string | null
          high_signals_count?: number | null
          id?: string
          last_calculated_at?: string | null
          last_forward_movement_at?: string | null
          low_signals_count?: number | null
          medium_signals_count?: number | null
          meeting_frequency_trend?: string | null
          org_id?: string
          overall_risk_level?: string | null
          recommended_actions?: Json | null
          risk_score?: number | null
          risk_summary?: string | null
          sentiment_change_pct?: number | null
          sentiment_trend?: string | null
          signal_breakdown?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_risk_aggregates_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_risk_signals: {
        Row: {
          auto_dismissed: boolean | null
          confidence_score: number | null
          created_at: string | null
          deal_id: string | null
          description: string
          detected_at: string | null
          dismissed_reason: string | null
          evidence: Json | null
          id: string
          is_resolved: boolean | null
          org_id: string
          resolution_action: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          signal_type: string
          source_meeting_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          auto_dismissed?: boolean | null
          confidence_score?: number | null
          created_at?: string | null
          deal_id?: string | null
          description: string
          detected_at?: string | null
          dismissed_reason?: string | null
          evidence?: Json | null
          id?: string
          is_resolved?: boolean | null
          org_id: string
          resolution_action?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          signal_type: string
          source_meeting_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          auto_dismissed?: boolean | null
          confidence_score?: number | null
          created_at?: string | null
          deal_id?: string | null
          description?: string
          detected_at?: string | null
          dismissed_reason?: string | null
          evidence?: Json | null
          id?: string
          is_resolved?: boolean | null
          org_id?: string
          resolution_action?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          signal_type?: string
          source_meeting_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_risk_signals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_risk_signals_source_meeting_id_fkey"
            columns: ["source_meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_splits: {
        Row: {
          amount: number
          clerk_org_id: string | null
          created_at: string | null
          deal_id: string
          id: string
          notes: string | null
          percentage: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          clerk_org_id?: string | null
          created_at?: string | null
          deal_id: string
          id?: string
          notes?: string | null
          percentage: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          clerk_org_id?: string | null
          created_at?: string | null
          deal_id?: string
          id?: string
          notes?: string | null
          percentage?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_splits_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_splits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "deal_splits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "deal_splits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "deal_splits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_splits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      deal_stage_history: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          deal_id: string
          duration_seconds: number | null
          entered_at: string | null
          exited_at: string | null
          id: string
          new_stage_id: string | null
          previous_stage_id: string | null
          stage_id: string
          user_id: string
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          deal_id: string
          duration_seconds?: number | null
          entered_at?: string | null
          exited_at?: string | null
          id?: string
          new_stage_id?: string | null
          previous_stage_id?: string | null
          stage_id: string
          user_id: string
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          deal_id?: string
          duration_seconds?: number | null
          entered_at?: string | null
          exited_at?: string | null
          id?: string
          new_stage_id?: string | null
          previous_stage_id?: string | null
          stage_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_stage_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_history_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "deal_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_stages: {
        Row: {
          color: string
          created_at: string | null
          default_probability: number
          description: string | null
          id: string
          is_final: boolean | null
          name: string
          order_position: number
          updated_at: string | null
        }
        Insert: {
          color: string
          created_at?: string | null
          default_probability: number
          description?: string | null
          id?: string
          is_final?: boolean | null
          name: string
          order_position: number
          updated_at?: string | null
        }
        Update: {
          color?: string
          created_at?: string | null
          default_probability?: number
          description?: string | null
          id?: string
          is_final?: boolean | null
          name?: string
          order_position?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      deal_truth_fields: {
        Row: {
          champion_strength: string | null
          confidence: number | null
          contact_id: string | null
          created_at: string | null
          deal_id: string
          field_key: string
          id: string
          last_updated_at: string | null
          next_step_date: string | null
          org_id: string
          source: string | null
          source_id: string | null
          value: string | null
        }
        Insert: {
          champion_strength?: string | null
          confidence?: number | null
          contact_id?: string | null
          created_at?: string | null
          deal_id: string
          field_key: string
          id?: string
          last_updated_at?: string | null
          next_step_date?: string | null
          org_id: string
          source?: string | null
          source_id?: string | null
          value?: string | null
        }
        Update: {
          champion_strength?: string | null
          confidence?: number | null
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string
          field_key?: string
          id?: string
          last_updated_at?: string | null
          next_step_date?: string | null
          org_id?: string
          source?: string | null
          source_id?: string | null
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_truth_fields_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_truth_fields_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_truth_fields_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          annual_value: number | null
          clerk_org_id: string | null
          close_date: string | null
          closed_lost_date: string | null
          closed_won_date: string | null
          company: string
          company_id: string | null
          contact_email: string | null
          contact_identifier: string | null
          contact_identifier_type: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          deal_size: string | null
          description: string | null
          expected_close_date: string | null
          first_meeting_date: string | null
          health_score: number | null
          id: string
          lead_source_channel: string | null
          lead_source_type: string | null
          momentum_score: number | null
          monthly_mrr: number | null
          name: string
          next_steps: string | null
          notes: string | null
          one_off_revenue: number | null
          opportunity_date: string | null
          owner_id: string
          primary_contact_id: string | null
          priority: string | null
          probability: number | null
          risk_level: string | null
          savvycal_booking_id: string | null
          savvycal_link_id: string | null
          sql_date: string | null
          stage_changed_at: string | null
          stage_id: string
          stage_migration_notes: string | null
          status: string | null
          updated_at: string | null
          value: number
          verbal_date: string | null
        }
        Insert: {
          annual_value?: number | null
          clerk_org_id?: string | null
          close_date?: string | null
          closed_lost_date?: string | null
          closed_won_date?: string | null
          company: string
          company_id?: string | null
          contact_email?: string | null
          contact_identifier?: string | null
          contact_identifier_type?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          deal_size?: string | null
          description?: string | null
          expected_close_date?: string | null
          first_meeting_date?: string | null
          health_score?: number | null
          id?: string
          lead_source_channel?: string | null
          lead_source_type?: string | null
          momentum_score?: number | null
          monthly_mrr?: number | null
          name: string
          next_steps?: string | null
          notes?: string | null
          one_off_revenue?: number | null
          opportunity_date?: string | null
          owner_id: string
          primary_contact_id?: string | null
          priority?: string | null
          probability?: number | null
          risk_level?: string | null
          savvycal_booking_id?: string | null
          savvycal_link_id?: string | null
          sql_date?: string | null
          stage_changed_at?: string | null
          stage_id: string
          stage_migration_notes?: string | null
          status?: string | null
          updated_at?: string | null
          value: number
          verbal_date?: string | null
        }
        Update: {
          annual_value?: number | null
          clerk_org_id?: string | null
          close_date?: string | null
          closed_lost_date?: string | null
          closed_won_date?: string | null
          company?: string
          company_id?: string | null
          contact_email?: string | null
          contact_identifier?: string | null
          contact_identifier_type?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          deal_size?: string | null
          description?: string | null
          expected_close_date?: string | null
          first_meeting_date?: string | null
          health_score?: number | null
          id?: string
          lead_source_channel?: string | null
          lead_source_type?: string | null
          momentum_score?: number | null
          monthly_mrr?: number | null
          name?: string
          next_steps?: string | null
          notes?: string | null
          one_off_revenue?: number | null
          opportunity_date?: string | null
          owner_id?: string
          primary_contact_id?: string | null
          priority?: string | null
          probability?: number | null
          risk_level?: string | null
          savvycal_booking_id?: string | null
          savvycal_link_id?: string | null
          sql_date?: string | null
          stage_changed_at?: string | null
          stage_id?: string
          stage_migration_notes?: string | null
          status?: string | null
          updated_at?: string | null
          value?: number
          verbal_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "deal_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_deals_company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_attachments: {
        Row: {
          content_id: string | null
          created_at: string | null
          email_id: string
          filename: string
          id: string
          is_inline: boolean | null
          mime_type: string
          size_bytes: number
          storage_url: string | null
        }
        Insert: {
          content_id?: string | null
          created_at?: string | null
          email_id: string
          filename: string
          id?: string
          is_inline?: boolean | null
          mime_type: string
          size_bytes: number
          storage_url?: string | null
        }
        Update: {
          content_id?: string | null
          created_at?: string | null
          email_id?: string
          filename?: string
          id?: string
          is_inline?: boolean | null
          mime_type?: string
          size_bytes?: number
          storage_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_attachments_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
        ]
      }
      email_categorizations: {
        Row: {
          category: string
          category_confidence: number | null
          communication_event_id: string | null
          created_at: string | null
          direction: string
          external_id: string
          gmail_label_applied: boolean | null
          gmail_label_applied_at: string | null
          id: string
          org_id: string | null
          processed_at: string | null
          received_at: string | null
          signals: Json | null
          source: string
          thread_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category: string
          category_confidence?: number | null
          communication_event_id?: string | null
          created_at?: string | null
          direction: string
          external_id: string
          gmail_label_applied?: boolean | null
          gmail_label_applied_at?: string | null
          id?: string
          org_id?: string | null
          processed_at?: string | null
          received_at?: string | null
          signals?: Json | null
          source: string
          thread_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category?: string
          category_confidence?: number | null
          communication_event_id?: string | null
          created_at?: string | null
          direction?: string
          external_id?: string
          gmail_label_applied?: boolean | null
          gmail_label_applied_at?: string | null
          id?: string
          org_id?: string | null
          processed_at?: string | null
          received_at?: string | null
          signals?: Json | null
          source?: string
          thread_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_categorizations_communication_event_id_fkey"
            columns: ["communication_event_id"]
            isOneToOne: false
            referencedRelation: "communication_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_categorizations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_journeys: {
        Row: {
          conditions: Json | null
          created_at: string | null
          delay_minutes: number | null
          email_template_id: string | null
          email_type: string
          id: string
          is_active: boolean | null
          journey_name: string
          trigger_event: string
          updated_at: string | null
        }
        Insert: {
          conditions?: Json | null
          created_at?: string | null
          delay_minutes?: number | null
          email_template_id?: string | null
          email_type: string
          id?: string
          is_active?: boolean | null
          journey_name: string
          trigger_event: string
          updated_at?: string | null
        }
        Update: {
          conditions?: Json | null
          created_at?: string | null
          delay_minutes?: number | null
          email_template_id?: string | null
          email_type?: string
          id?: string
          is_active?: boolean | null
          journey_name?: string
          trigger_event?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      email_label_map: {
        Row: {
          created_at: string | null
          email_id: string
          label_id: string
        }
        Insert: {
          created_at?: string | null
          email_id: string
          label_id: string
        }
        Update: {
          created_at?: string | null
          email_id?: string
          label_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_label_map_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_label_map_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "email_labels"
            referencedColumns: ["id"]
          },
        ]
      }
      email_labels: {
        Row: {
          color: string | null
          created_at: string | null
          icon: string | null
          id: string
          name: string
          position: number | null
          type: string | null
          user_id: string
          visibility: boolean | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          name: string
          position?: number | null
          type?: string | null
          user_id: string
          visibility?: boolean | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          name?: string
          position?: number | null
          type?: string | null
          user_id?: string
          visibility?: boolean | null
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          created_at: string | null
          email_type: string
          error: string | null
          id: string
          metadata: Json | null
          sent_via: string | null
          status: string
          to_email: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email_type: string
          error?: string | null
          id?: string
          metadata?: Json | null
          sent_via?: string | null
          status?: string
          to_email: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email_type?: string
          error?: string | null
          id?: string
          metadata?: Json | null
          sent_via?: string | null
          status?: string
          to_email?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      email_sends: {
        Row: {
          clicked_at: string | null
          email_type: string
          encharge_message_id: string | null
          id: string
          journey_id: string | null
          metadata: Json | null
          opened_at: string | null
          sent_at: string | null
          status: string | null
          to_email: string
          user_id: string | null
        }
        Insert: {
          clicked_at?: string | null
          email_type: string
          encharge_message_id?: string | null
          id?: string
          journey_id?: string | null
          metadata?: Json | null
          opened_at?: string | null
          sent_at?: string | null
          status?: string | null
          to_email: string
          user_id?: string | null
        }
        Update: {
          clicked_at?: string | null
          email_type?: string
          encharge_message_id?: string | null
          id?: string
          journey_id?: string | null
          metadata?: Json | null
          opened_at?: string | null
          sent_at?: string | null
          status?: string | null
          to_email?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_sends_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "email_journeys"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: string
          body_text: string | null
          category: string | null
          created_at: string | null
          id: string
          is_public: boolean | null
          name: string
          subject: string
          updated_at: string | null
          usage_count: number | null
          user_id: string
          variables: Json | null
        }
        Insert: {
          body_html: string
          body_text?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          subject: string
          updated_at?: string | null
          usage_count?: number | null
          user_id: string
          variables?: Json | null
        }
        Update: {
          body_html?: string
          body_text?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          subject?: string
          updated_at?: string | null
          usage_count?: number | null
          user_id?: string
          variables?: Json | null
        }
        Relationships: []
      }
      email_threads: {
        Row: {
          created_at: string | null
          id: string
          is_archived: boolean | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          last_message_at: string
          message_count: number | null
          participants: Json
          subject: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          last_message_at?: string
          message_count?: number | null
          participants?: Json
          subject: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          last_message_at?: string
          message_count?: number | null
          participants?: Json
          subject?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      emails: {
        Row: {
          ai_action_required: boolean | null
          ai_category: string | null
          ai_priority: number | null
          ai_sentiment: string | null
          ai_summary: string | null
          attachments_count: number | null
          bcc_emails: Json | null
          body_html: string | null
          body_text: string | null
          cc_emails: Json | null
          created_at: string | null
          external_id: string | null
          from_email: string
          from_name: string | null
          headers: Json | null
          id: string
          is_archived: boolean | null
          is_draft: boolean | null
          is_read: boolean | null
          is_sent: boolean | null
          is_starred: boolean | null
          is_trash: boolean | null
          labels: Json | null
          mcp_connection_id: string | null
          received_at: string | null
          sent_at: string | null
          subject: string | null
          thread_id: string | null
          to_emails: Json
          updated_at: string | null
          user_id: string
          workflow_metadata: Json | null
        }
        Insert: {
          ai_action_required?: boolean | null
          ai_category?: string | null
          ai_priority?: number | null
          ai_sentiment?: string | null
          ai_summary?: string | null
          attachments_count?: number | null
          bcc_emails?: Json | null
          body_html?: string | null
          body_text?: string | null
          cc_emails?: Json | null
          created_at?: string | null
          external_id?: string | null
          from_email: string
          from_name?: string | null
          headers?: Json | null
          id?: string
          is_archived?: boolean | null
          is_draft?: boolean | null
          is_read?: boolean | null
          is_sent?: boolean | null
          is_starred?: boolean | null
          is_trash?: boolean | null
          labels?: Json | null
          mcp_connection_id?: string | null
          received_at?: string | null
          sent_at?: string | null
          subject?: string | null
          thread_id?: string | null
          to_emails?: Json
          updated_at?: string | null
          user_id: string
          workflow_metadata?: Json | null
        }
        Update: {
          ai_action_required?: boolean | null
          ai_category?: string | null
          ai_priority?: number | null
          ai_sentiment?: string | null
          ai_summary?: string | null
          attachments_count?: number | null
          bcc_emails?: Json | null
          body_html?: string | null
          body_text?: string | null
          cc_emails?: Json | null
          created_at?: string | null
          external_id?: string | null
          from_email?: string
          from_name?: string | null
          headers?: Json | null
          id?: string
          is_archived?: boolean | null
          is_draft?: boolean | null
          is_read?: boolean | null
          is_sent?: boolean | null
          is_starred?: boolean | null
          is_trash?: boolean | null
          labels?: Json | null
          mcp_connection_id?: string | null
          received_at?: string | null
          sent_at?: string | null
          subject?: string | null
          thread_id?: string | null
          to_emails?: Json
          updated_at?: string | null
          user_id?: string
          workflow_metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "emails_mcp_connection_id_fkey"
            columns: ["mcp_connection_id"]
            isOneToOne: false
            referencedRelation: "mcp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      encharge_email_templates: {
        Row: {
          created_at: string | null
          html_body: string
          id: string
          is_active: boolean | null
          subject_line: string
          template_name: string
          template_type: string
          text_body: string | null
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          created_at?: string | null
          html_body: string
          id?: string
          is_active?: boolean | null
          subject_line: string
          template_name: string
          template_type: string
          text_body?: string | null
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          created_at?: string | null
          html_body?: string
          id?: string
          is_active?: boolean | null
          subject_line?: string
          template_name?: string
          template_type?: string
          text_body?: string | null
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: []
      }
      execution_checkpoints: {
        Row: {
          can_resume: boolean | null
          checkpoint_name: string
          created_at: string | null
          execution_id: string
          id: string
          node_id: string
          node_outputs: Json | null
          state: Json
          variables: Json | null
          workflow_id: string
        }
        Insert: {
          can_resume?: boolean | null
          checkpoint_name: string
          created_at?: string | null
          execution_id: string
          id?: string
          node_id: string
          node_outputs?: Json | null
          state?: Json
          variables?: Json | null
          workflow_id: string
        }
        Update: {
          can_resume?: boolean | null
          checkpoint_name?: string
          created_at?: string | null
          execution_id?: string
          id?: string
          node_id?: string
          node_outputs?: Json | null
          state?: Json
          variables?: Json | null
          workflow_id?: string
        }
        Relationships: []
      }
      execution_snapshots: {
        Row: {
          cpu_time: number | null
          error_details: Json | null
          execution_id: string
          http_requests: Json | null
          id: string
          memory_usage: number | null
          node_id: string
          node_outputs: Json | null
          sequence_number: number
          snapshot_type: string | null
          state: Json
          timestamp: string | null
          variables: Json | null
          workflow_id: string
        }
        Insert: {
          cpu_time?: number | null
          error_details?: Json | null
          execution_id: string
          http_requests?: Json | null
          id?: string
          memory_usage?: number | null
          node_id: string
          node_outputs?: Json | null
          sequence_number: number
          snapshot_type?: string | null
          state?: Json
          timestamp?: string | null
          variables?: Json | null
          workflow_id: string
        }
        Update: {
          cpu_time?: number | null
          error_details?: Json | null
          execution_id?: string
          http_requests?: Json | null
          id?: string
          memory_usage?: number | null
          node_id?: string
          node_outputs?: Json | null
          sequence_number?: number
          snapshot_type?: string | null
          state?: Json
          timestamp?: string | null
          variables?: Json | null
          workflow_id?: string
        }
        Relationships: []
      }
      fathom_integrations: {
        Row: {
          access_token: string
          created_at: string | null
          fathom_user_email: string | null
          fathom_user_id: string | null
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          refresh_token: string
          scopes: string[] | null
          token_expires_at: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string | null
          fathom_user_email?: string | null
          fathom_user_id?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          refresh_token: string
          scopes?: string[] | null
          token_expires_at: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string | null
          fathom_user_email?: string | null
          fathom_user_id?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          refresh_token?: string
          scopes?: string[] | null
          token_expires_at?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      fathom_oauth_states: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          org_id: string | null
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          org_id?: string | null
          state: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          org_id?: string | null
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fathom_oauth_states_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fathom_org_credentials: {
        Row: {
          access_token: string
          org_id: string
          refresh_token: string
          token_expires_at: string
          updated_at: string | null
        }
        Insert: {
          access_token: string
          org_id: string
          refresh_token: string
          token_expires_at: string
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          org_id?: string
          refresh_token?: string
          token_expires_at?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fathom_org_credentials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fathom_org_integrations: {
        Row: {
          connected_by_user_id: string | null
          created_at: string | null
          fathom_user_email: string | null
          fathom_user_id: string | null
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          org_id: string
          scopes: string[] | null
          updated_at: string | null
        }
        Insert: {
          connected_by_user_id?: string | null
          created_at?: string | null
          fathom_user_email?: string | null
          fathom_user_id?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          org_id: string
          scopes?: string[] | null
          updated_at?: string | null
        }
        Update: {
          connected_by_user_id?: string | null
          created_at?: string | null
          fathom_user_email?: string | null
          fathom_user_id?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          org_id?: string
          scopes?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fathom_org_integrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fathom_org_sync_state: {
        Row: {
          created_at: string | null
          cursor_position: string | null
          error_count: number | null
          error_message: string | null
          id: string
          integration_id: string
          last_error_at: string | null
          last_successful_sync: string | null
          last_sync_completed_at: string | null
          last_sync_started_at: string | null
          meetings_synced: number | null
          org_id: string
          sync_status: string
          total_meetings_found: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          cursor_position?: string | null
          error_count?: number | null
          error_message?: string | null
          id?: string
          integration_id: string
          last_error_at?: string | null
          last_successful_sync?: string | null
          last_sync_completed_at?: string | null
          last_sync_started_at?: string | null
          meetings_synced?: number | null
          org_id: string
          sync_status?: string
          total_meetings_found?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          cursor_position?: string | null
          error_count?: number | null
          error_message?: string | null
          id?: string
          integration_id?: string
          last_error_at?: string | null
          last_successful_sync?: string | null
          last_sync_completed_at?: string | null
          last_sync_started_at?: string | null
          meetings_synced?: number | null
          org_id?: string
          sync_status?: string
          total_meetings_found?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fathom_org_sync_state_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: true
            referencedRelation: "fathom_org_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fathom_org_sync_state_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fathom_sync_state: {
        Row: {
          created_at: string | null
          cursor_position: string | null
          error_count: number | null
          id: string
          integration_id: string
          last_error_at: string | null
          last_successful_sync: string | null
          last_sync_completed_at: string | null
          last_sync_error: string | null
          last_sync_started_at: string | null
          meetings_synced: number | null
          sync_date_range_end: string | null
          sync_date_range_start: string | null
          sync_status: string
          total_meetings_found: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          cursor_position?: string | null
          error_count?: number | null
          id?: string
          integration_id: string
          last_error_at?: string | null
          last_successful_sync?: string | null
          last_sync_completed_at?: string | null
          last_sync_error?: string | null
          last_sync_started_at?: string | null
          meetings_synced?: number | null
          sync_date_range_end?: string | null
          sync_date_range_start?: string | null
          sync_status?: string
          total_meetings_found?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          cursor_position?: string | null
          error_count?: number | null
          id?: string
          integration_id?: string
          last_error_at?: string | null
          last_successful_sync?: string | null
          last_sync_completed_at?: string | null
          last_sync_error?: string | null
          last_sync_started_at?: string | null
          meetings_synced?: number | null
          sync_date_range_end?: string | null
          sync_date_range_start?: string | null
          sync_status?: string
          total_meetings_found?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fathom_sync_state_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: true
            referencedRelation: "fathom_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      fathom_transcript_retry_jobs: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          max_attempts: number
          meeting_id: string
          next_retry_at: string
          recording_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          meeting_id: string
          next_retry_at: string
          recording_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          meeting_id?: string
          next_retry_at?: string
          recording_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fathom_transcript_retry_jobs_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      fathom_user_mappings: {
        Row: {
          created_at: string | null
          fathom_user_email: string
          fathom_user_name: string | null
          id: string
          is_auto_matched: boolean | null
          last_seen_at: string | null
          org_id: string
          sixty_user_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          fathom_user_email: string
          fathom_user_name?: string | null
          id?: string
          is_auto_matched?: boolean | null
          last_seen_at?: string | null
          org_id: string
          sixty_user_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          fathom_user_email?: string
          fathom_user_name?: string | null
          id?: string
          is_auto_matched?: boolean | null
          last_seen_at?: string | null
          org_id?: string
          sixty_user_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fathom_user_mappings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ghost_detection_signals: {
        Row: {
          created_at: string | null
          detected_at: string | null
          id: string
          metadata: Json | null
          relationship_health_id: string
          resolved_at: string | null
          severity: string
          signal_context: string | null
          signal_data: Json | null
          signal_type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          detected_at?: string | null
          id?: string
          metadata?: Json | null
          relationship_health_id: string
          resolved_at?: string | null
          severity: string
          signal_context?: string | null
          signal_data?: Json | null
          signal_type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          detected_at?: string | null
          id?: string
          metadata?: Json | null
          relationship_health_id?: string
          resolved_at?: string | null
          severity?: string
          signal_context?: string | null
          signal_data?: Json | null
          signal_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghost_detection_signals_relationship_health_id_fkey"
            columns: ["relationship_health_id"]
            isOneToOne: false
            referencedRelation: "relationship_health_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      global_topic_sources: {
        Row: {
          company_id: string | null
          contact_id: string | null
          created_at: string
          fathom_url: string | null
          global_topic_id: string
          id: string
          meeting_date: string | null
          meeting_id: string
          similarity_score: number
          timestamp_seconds: number | null
          topic_description: string | null
          topic_index: number
          topic_title: string
        }
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          fathom_url?: string | null
          global_topic_id: string
          id?: string
          meeting_date?: string | null
          meeting_id: string
          similarity_score?: number
          timestamp_seconds?: number | null
          topic_description?: string | null
          topic_index: number
          topic_title: string
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          fathom_url?: string | null
          global_topic_id?: string
          id?: string
          meeting_date?: string | null
          meeting_id?: string
          similarity_score?: number
          timestamp_seconds?: number | null
          topic_description?: string | null
          topic_index?: number
          topic_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_topic_sources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_topic_sources_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_topic_sources_global_topic_id_fkey"
            columns: ["global_topic_id"]
            isOneToOne: false
            referencedRelation: "global_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_topic_sources_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      global_topics: {
        Row: {
          canonical_description: string | null
          canonical_title: string
          created_at: string
          deleted_at: string | null
          first_seen_at: string
          frequency_score: number
          id: string
          is_archived: boolean
          last_seen_at: string
          recency_score: number
          relevance_score: number
          source_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          canonical_description?: string | null
          canonical_title: string
          created_at?: string
          deleted_at?: string | null
          first_seen_at?: string
          frequency_score?: number
          id?: string
          is_archived?: boolean
          last_seen_at?: string
          recency_score?: number
          relevance_score?: number
          source_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          canonical_description?: string | null
          canonical_title?: string
          created_at?: string
          deleted_at?: string | null
          first_seen_at?: string
          frequency_score?: number
          id?: string
          is_archived?: boolean
          last_seen_at?: string
          recency_score?: number
          relevance_score?: number
          source_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gmail_label_mappings: {
        Row: {
          category_key: string
          created_at: string | null
          gmail_label_id: string
          gmail_label_name: string
          id: string
          is_sixty_managed: boolean | null
          org_id: string | null
          sync_direction: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category_key: string
          created_at?: string | null
          gmail_label_id: string
          gmail_label_name: string
          id?: string
          is_sixty_managed?: boolean | null
          org_id?: string | null
          sync_direction: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category_key?: string
          created_at?: string | null
          gmail_label_id?: string
          gmail_label_name?: string
          id?: string
          is_sixty_managed?: boolean | null
          org_id?: string | null
          sync_direction?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmail_label_mappings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_channels: {
        Row: {
          calendar_id: string
          channel_id: string
          created_at: string
          expiration_time: string
          id: string
          is_active: boolean
          last_message_number: number | null
          last_notification_at: string | null
          notification_count: number
          org_id: string
          resource_id: string
          sync_token: string | null
          updated_at: string
          user_id: string
          webhook_url: string
        }
        Insert: {
          calendar_id?: string
          channel_id: string
          created_at?: string
          expiration_time: string
          id?: string
          is_active?: boolean
          last_message_number?: number | null
          last_notification_at?: string | null
          notification_count?: number
          org_id: string
          resource_id: string
          sync_token?: string | null
          updated_at?: string
          user_id: string
          webhook_url: string
        }
        Update: {
          calendar_id?: string
          channel_id?: string
          created_at?: string
          expiration_time?: string
          id?: string
          is_active?: boolean
          last_message_number?: number | null
          last_notification_at?: string | null
          notification_count?: number
          org_id?: string
          resource_id?: string
          sync_token?: string | null
          updated_at?: string
          user_id?: string
          webhook_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_channels_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendars: {
        Row: {
          access_role: string | null
          calendar_id: string
          color_id: string | null
          created_at: string | null
          description: string | null
          id: string
          integration_id: string
          is_primary: boolean | null
          name: string
          time_zone: string | null
          updated_at: string | null
        }
        Insert: {
          access_role?: string | null
          calendar_id: string
          color_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          integration_id: string
          is_primary?: boolean | null
          name: string
          time_zone?: string | null
          updated_at?: string | null
        }
        Update: {
          access_role?: string | null
          calendar_id?: string
          color_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          integration_id?: string
          is_primary?: boolean | null
          name?: string
          time_zone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_calendars_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "google_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      google_docs_templates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_global: boolean | null
          name: string
          template_content: Json
          template_type: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_global?: boolean | null
          name: string
          template_content: Json
          template_type: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_global?: boolean | null
          name?: string
          template_content?: Json
          template_type?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      google_drive_folders: {
        Row: {
          created_at: string | null
          folder_id: string
          id: string
          integration_id: string
          mime_type: string | null
          name: string
          parent_id: string | null
          path: string | null
          updated_at: string | null
          web_view_link: string | null
        }
        Insert: {
          created_at?: string | null
          folder_id: string
          id?: string
          integration_id: string
          mime_type?: string | null
          name: string
          parent_id?: string | null
          path?: string | null
          updated_at?: string | null
          web_view_link?: string | null
        }
        Update: {
          created_at?: string | null
          folder_id?: string
          id?: string
          integration_id?: string
          mime_type?: string | null
          name?: string
          parent_id?: string | null
          path?: string | null
          updated_at?: string | null
          web_view_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_drive_folders_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "google_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      google_email_labels: {
        Row: {
          created_at: string | null
          id: string
          integration_id: string
          label_id: string
          label_list_visibility: string | null
          message_list_visibility: string | null
          name: string
          type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          integration_id: string
          label_id: string
          label_list_visibility?: string | null
          message_list_visibility?: string | null
          name: string
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          integration_id?: string
          label_id?: string
          label_list_visibility?: string | null
          message_list_visibility?: string | null
          name?: string
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_email_labels_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "google_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      google_integrations: {
        Row: {
          access_token: string
          clerk_org_id: string | null
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          is_active: boolean | null
          last_token_refresh: string | null
          refresh_token: string | null
          scopes: string
          token_status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          clerk_org_id?: string | null
          created_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          last_token_refresh?: string | null
          refresh_token?: string | null
          scopes: string
          token_status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          clerk_org_id?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          last_token_refresh?: string | null
          refresh_token?: string | null
          scopes?: string
          token_status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      google_oauth_states: {
        Row: {
          code_challenge: string
          code_verifier: string
          created_at: string | null
          expires_at: string
          id: string
          redirect_uri: string
          state: string
          user_id: string
        }
        Insert: {
          code_challenge: string
          code_verifier: string
          created_at?: string | null
          expires_at?: string
          id?: string
          redirect_uri: string
          state: string
          user_id: string
        }
        Update: {
          code_challenge?: string
          code_verifier?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          redirect_uri?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      google_service_logs: {
        Row: {
          action: string
          created_at: string | null
          error_message: string | null
          id: string
          integration_id: string | null
          request_data: Json | null
          response_data: Json | null
          service: string
          status: string
        }
        Insert: {
          action: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          integration_id?: string | null
          request_data?: Json | null
          response_data?: Json | null
          service: string
          status: string
        }
        Update: {
          action?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          integration_id?: string | null
          request_data?: Json | null
          response_data?: Json | null
          service?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_service_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "google_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      google_task_lists: {
        Row: {
          created_at: string | null
          etag: string | null
          google_list_id: string
          id: string
          integration_id: string | null
          is_default: boolean | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          etag?: string | null
          google_list_id: string
          id?: string
          integration_id?: string | null
          is_default?: boolean | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          etag?: string | null
          google_list_id?: string
          id?: string
          integration_id?: string | null
          is_default?: boolean | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_task_lists_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "google_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      google_task_mappings: {
        Row: {
          created_at: string | null
          etag: string | null
          google_list_id: string
          google_task_id: string
          id: string
          sync_direction: string | null
          task_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          etag?: string | null
          google_list_id: string
          google_task_id: string
          id?: string
          sync_direction?: string | null
          task_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          etag?: string | null
          google_list_id?: string
          google_task_id?: string
          id?: string
          sync_direction?: string | null
          task_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_task_mappings_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      google_tasks_list_configs: {
        Row: {
          auto_create_in_list: boolean | null
          created_at: string | null
          display_order: number | null
          google_list_id: string
          id: string
          is_primary: boolean | null
          list_title: string
          priority_filter: string[] | null
          status_filter: string[] | null
          sync_direction: string
          sync_enabled: boolean | null
          task_categories: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_create_in_list?: boolean | null
          created_at?: string | null
          display_order?: number | null
          google_list_id: string
          id?: string
          is_primary?: boolean | null
          list_title: string
          priority_filter?: string[] | null
          status_filter?: string[] | null
          sync_direction?: string
          sync_enabled?: boolean | null
          task_categories?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_create_in_list?: boolean | null
          created_at?: string | null
          display_order?: number | null
          google_list_id?: string
          id?: string
          is_primary?: boolean | null
          list_title?: string
          priority_filter?: string[] | null
          status_filter?: string[] | null
          sync_direction?: string
          sync_enabled?: boolean | null
          task_categories?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      google_tasks_sync_conflicts: {
        Row: {
          conflict_type: string
          created_at: string | null
          google_data: Json | null
          google_list_id: string | null
          google_task_id: string | null
          id: string
          local_data: Json | null
          resolution_notes: string | null
          resolved: boolean | null
          resolved_at: string | null
          task_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          conflict_type: string
          created_at?: string | null
          google_data?: Json | null
          google_list_id?: string | null
          google_task_id?: string | null
          id?: string
          local_data?: Json | null
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          task_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          conflict_type?: string
          created_at?: string | null
          google_data?: Json | null
          google_list_id?: string | null
          google_task_id?: string | null
          id?: string
          local_data?: Json | null
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          task_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_tasks_sync_conflicts_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      google_tasks_sync_status: {
        Row: {
          conflicts_count: number | null
          created_at: string | null
          error_message: string | null
          id: string
          last_full_sync_at: string | null
          last_incremental_sync_at: string | null
          selected_list_id: string | null
          selected_list_title: string | null
          sync_state: string | null
          tasks_synced_count: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          conflicts_count?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_full_sync_at?: string | null
          last_incremental_sync_at?: string | null
          selected_list_id?: string | null
          selected_list_title?: string | null
          sync_state?: string | null
          tasks_synced_count?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          conflicts_count?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_full_sync_at?: string | null
          last_incremental_sync_at?: string | null
          selected_list_id?: string | null
          selected_list_title?: string | null
          sync_state?: string | null
          tasks_synced_count?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      hitl_pending_approvals: {
        Row: {
          actioned_at: string | null
          actioned_by: string | null
          callback_metadata: Json | null
          callback_target: string | null
          callback_type: string | null
          created_at: string | null
          created_by: string | null
          edited_content: Json | null
          expires_at: string | null
          id: string
          metadata: Json | null
          org_id: string
          original_content: Json
          resource_id: string
          resource_name: string | null
          resource_type: string
          response: Json | null
          slack_channel_id: string
          slack_message_ts: string
          slack_team_id: string
          slack_thread_ts: string | null
          status: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          actioned_at?: string | null
          actioned_by?: string | null
          callback_metadata?: Json | null
          callback_target?: string | null
          callback_type?: string | null
          created_at?: string | null
          created_by?: string | null
          edited_content?: Json | null
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          org_id: string
          original_content: Json
          resource_id: string
          resource_name?: string | null
          resource_type: string
          response?: Json | null
          slack_channel_id: string
          slack_message_ts: string
          slack_team_id: string
          slack_thread_ts?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          actioned_at?: string | null
          actioned_by?: string | null
          callback_metadata?: Json | null
          callback_target?: string | null
          callback_type?: string | null
          created_at?: string | null
          created_by?: string | null
          edited_content?: Json | null
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string
          original_content?: Json
          resource_id?: string
          resource_name?: string | null
          resource_type?: string
          response?: Json | null
          slack_channel_id?: string
          slack_message_ts?: string
          slack_team_id?: string
          slack_thread_ts?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hitl_pending_approvals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hitl_requests: {
        Row: {
          assigned_to_user_id: string | null
          channels: string[]
          created_at: string | null
          default_value: string | null
          execution_context: Json | null
          execution_id: string
          expires_at: string | null
          id: string
          options: Json | null
          organization_id: string
          prompt: string
          request_type: string
          requested_by_user_id: string
          responded_at: string | null
          responded_by_user_id: string | null
          response_channel: string | null
          response_context: Json | null
          response_value: string | null
          sequence_key: string
          slack_channel_id: string | null
          slack_message_ts: string | null
          status: string
          step_index: number
          timeout_action: string | null
          timeout_minutes: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to_user_id?: string | null
          channels?: string[]
          created_at?: string | null
          default_value?: string | null
          execution_context?: Json | null
          execution_id: string
          expires_at?: string | null
          id?: string
          options?: Json | null
          organization_id: string
          prompt: string
          request_type: string
          requested_by_user_id: string
          responded_at?: string | null
          responded_by_user_id?: string | null
          response_channel?: string | null
          response_context?: Json | null
          response_value?: string | null
          sequence_key: string
          slack_channel_id?: string | null
          slack_message_ts?: string | null
          status?: string
          step_index: number
          timeout_action?: string | null
          timeout_minutes?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to_user_id?: string | null
          channels?: string[]
          created_at?: string | null
          default_value?: string | null
          execution_context?: Json | null
          execution_id?: string
          expires_at?: string | null
          id?: string
          options?: Json | null
          organization_id?: string
          prompt?: string
          request_type?: string
          requested_by_user_id?: string
          responded_at?: string | null
          responded_by_user_id?: string | null
          response_channel?: string | null
          response_context?: Json | null
          response_value?: string | null
          sequence_key?: string
          slack_channel_id?: string | null
          slack_message_ts?: string | null
          status?: string
          step_index?: number
          timeout_action?: string | null
          timeout_minutes?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hitl_requests_assigned_to_user_id_profiles_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "hitl_requests_assigned_to_user_id_profiles_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hitl_requests_assigned_to_user_id_profiles_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "hitl_requests_assigned_to_user_id_profiles_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hitl_requests_assigned_to_user_id_profiles_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hitl_requests_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "sequence_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hitl_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hitl_requests_requested_by_user_id_profiles_fkey"
            columns: ["requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "hitl_requests_requested_by_user_id_profiles_fkey"
            columns: ["requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hitl_requests_requested_by_user_id_profiles_fkey"
            columns: ["requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "hitl_requests_requested_by_user_id_profiles_fkey"
            columns: ["requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hitl_requests_requested_by_user_id_profiles_fkey"
            columns: ["requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hitl_requests_responded_by_user_id_profiles_fkey"
            columns: ["responded_by_user_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "hitl_requests_responded_by_user_id_profiles_fkey"
            columns: ["responded_by_user_id"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hitl_requests_responded_by_user_id_profiles_fkey"
            columns: ["responded_by_user_id"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "hitl_requests_responded_by_user_id_profiles_fkey"
            columns: ["responded_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hitl_requests_responded_by_user_id_profiles_fkey"
            columns: ["responded_by_user_id"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      http_request_recordings: {
        Row: {
          body: Json | null
          error: string | null
          execution_id: string
          headers: Json | null
          id: string
          method: string
          node_id: string
          recorded_at: string | null
          request_sequence: number
          response_body: Json | null
          response_headers: Json | null
          response_status: number | null
          response_time_ms: number | null
          url: string
          workflow_id: string
        }
        Insert: {
          body?: Json | null
          error?: string | null
          execution_id: string
          headers?: Json | null
          id?: string
          method: string
          node_id: string
          recorded_at?: string | null
          request_sequence: number
          response_body?: Json | null
          response_headers?: Json | null
          response_status?: number | null
          response_time_ms?: number | null
          url: string
          workflow_id: string
        }
        Update: {
          body?: Json | null
          error?: string | null
          execution_id?: string
          headers?: Json | null
          id?: string
          method?: string
          node_id?: string
          recorded_at?: string | null
          request_sequence?: number
          response_body?: Json | null
          response_headers?: Json | null
          response_status?: number | null
          response_time_ms?: number | null
          url?: string
          workflow_id?: string
        }
        Relationships: []
      }
      hubspot_oauth_states: {
        Row: {
          clerk_org_id: string | null
          created_at: string | null
          expires_at: string
          id: string
          org_id: string
          redirect_uri: string | null
          state: string
          user_id: string
        }
        Insert: {
          clerk_org_id?: string | null
          created_at?: string | null
          expires_at: string
          id?: string
          org_id: string
          redirect_uri?: string | null
          state: string
          user_id: string
        }
        Update: {
          clerk_org_id?: string | null
          created_at?: string | null
          expires_at?: string
          id?: string
          org_id?: string
          redirect_uri?: string | null
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hubspot_oauth_states_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hubspot_object_mappings: {
        Row: {
          clerk_org_id: string | null
          created_at: string | null
          hubspot_id: string
          id: string
          last_seen_hubspot_modified_at: string | null
          last_synced_at: string | null
          object_type: string
          org_id: string
          sixty_id: string | null
          sixty_key: string | null
          updated_at: string | null
        }
        Insert: {
          clerk_org_id?: string | null
          created_at?: string | null
          hubspot_id: string
          id?: string
          last_seen_hubspot_modified_at?: string | null
          last_synced_at?: string | null
          object_type: string
          org_id: string
          sixty_id?: string | null
          sixty_key?: string | null
          updated_at?: string | null
        }
        Update: {
          clerk_org_id?: string | null
          created_at?: string | null
          hubspot_id?: string
          id?: string
          last_seen_hubspot_modified_at?: string | null
          last_synced_at?: string | null
          object_type?: string
          org_id?: string
          sixty_id?: string | null
          sixty_key?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hubspot_object_mappings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hubspot_org_credentials: {
        Row: {
          access_token: string
          org_id: string
          refresh_token: string
          token_expires_at: string
          updated_at: string | null
        }
        Insert: {
          access_token: string
          org_id: string
          refresh_token: string
          token_expires_at: string
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          org_id?: string
          refresh_token?: string
          token_expires_at?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hubspot_org_credentials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hubspot_org_integrations: {
        Row: {
          clerk_org_id: string | null
          connected_at: string | null
          connected_by_user_id: string | null
          created_at: string | null
          hubspot_account_name: string | null
          hubspot_hub_id: string | null
          hubspot_portal_id: string | null
          hubspot_region: string | null
          id: string
          is_active: boolean
          is_connected: boolean
          last_sync_at: string | null
          org_id: string
          scopes: string[] | null
          updated_at: string | null
          webhook_last_event_id: string | null
          webhook_last_received_at: string | null
          webhook_token: string
        }
        Insert: {
          clerk_org_id?: string | null
          connected_at?: string | null
          connected_by_user_id?: string | null
          created_at?: string | null
          hubspot_account_name?: string | null
          hubspot_hub_id?: string | null
          hubspot_portal_id?: string | null
          hubspot_region?: string | null
          id?: string
          is_active?: boolean
          is_connected?: boolean
          last_sync_at?: string | null
          org_id: string
          scopes?: string[] | null
          updated_at?: string | null
          webhook_last_event_id?: string | null
          webhook_last_received_at?: string | null
          webhook_token: string
        }
        Update: {
          clerk_org_id?: string | null
          connected_at?: string | null
          connected_by_user_id?: string | null
          created_at?: string | null
          hubspot_account_name?: string | null
          hubspot_hub_id?: string | null
          hubspot_portal_id?: string | null
          hubspot_region?: string | null
          id?: string
          is_active?: boolean
          is_connected?: boolean
          last_sync_at?: string | null
          org_id?: string
          scopes?: string[] | null
          updated_at?: string | null
          webhook_last_event_id?: string | null
          webhook_last_received_at?: string | null
          webhook_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "hubspot_org_integrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hubspot_org_sync_state: {
        Row: {
          clerk_org_id: string | null
          created_at: string | null
          cursors: Json
          error_count: number
          error_message: string | null
          id: string
          last_error_at: string | null
          last_successful_sync: string | null
          last_sync_completed_at: string | null
          last_sync_started_at: string | null
          org_id: string
          sync_status: string
          updated_at: string | null
        }
        Insert: {
          clerk_org_id?: string | null
          created_at?: string | null
          cursors?: Json
          error_count?: number
          error_message?: string | null
          id?: string
          last_error_at?: string | null
          last_successful_sync?: string | null
          last_sync_completed_at?: string | null
          last_sync_started_at?: string | null
          org_id: string
          sync_status?: string
          updated_at?: string | null
        }
        Update: {
          clerk_org_id?: string | null
          created_at?: string | null
          cursors?: Json
          error_count?: number
          error_message?: string | null
          id?: string
          last_error_at?: string | null
          last_successful_sync?: string | null
          last_sync_completed_at?: string | null
          last_sync_started_at?: string | null
          org_id?: string
          sync_status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hubspot_org_sync_state_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hubspot_settings: {
        Row: {
          clerk_org_id: string | null
          created_at: string | null
          org_id: string
          settings: Json
          updated_at: string | null
        }
        Insert: {
          clerk_org_id?: string | null
          created_at?: string | null
          org_id: string
          settings?: Json
          updated_at?: string | null
        }
        Update: {
          clerk_org_id?: string | null
          created_at?: string | null
          org_id?: string
          settings?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hubspot_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hubspot_sync_queue: {
        Row: {
          attempts: number
          clerk_org_id: string | null
          created_at: string | null
          dedupe_key: string | null
          id: string
          job_type: string
          last_error: string | null
          max_attempts: number
          org_id: string
          payload: Json
          priority: number
          run_after: string
          updated_at: string | null
        }
        Insert: {
          attempts?: number
          clerk_org_id?: string | null
          created_at?: string | null
          dedupe_key?: string | null
          id?: string
          job_type: string
          last_error?: string | null
          max_attempts?: number
          org_id: string
          payload?: Json
          priority?: number
          run_after?: string
          updated_at?: string | null
        }
        Update: {
          attempts?: number
          clerk_org_id?: string | null
          created_at?: string | null
          dedupe_key?: string | null
          id?: string
          job_type?: string
          last_error?: string | null
          max_attempts?: number
          org_id?: string
          payload?: Json
          priority?: number
          run_after?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hubspot_sync_queue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hubspot_webhook_events: {
        Row: {
          clerk_org_id: string | null
          event_id: string
          event_type: string
          id: string
          occurred_at: string | null
          org_id: string
          payload: Json
          payload_hash: string
          processed_at: string | null
          received_at: string | null
        }
        Insert: {
          clerk_org_id?: string | null
          event_id: string
          event_type: string
          id?: string
          occurred_at?: string | null
          org_id: string
          payload?: Json
          payload_hash: string
          processed_at?: string | null
          received_at?: string | null
        }
        Update: {
          clerk_org_id?: string | null
          event_id?: string
          event_type?: string
          id?: string
          occurred_at?: string | null
          org_id?: string
          payload?: Json
          payload_hash?: string
          processed_at?: string | null
          received_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hubspot_webhook_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_logs: {
        Row: {
          action: string
          admin_email: string
          admin_id: string
          created_at: string | null
          id: string
          metadata: Json | null
          target_user_email: string
          target_user_id: string
        }
        Insert: {
          action: string
          admin_email: string
          admin_id: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          target_user_email: string
          target_user_id: string
        }
        Update: {
          action?: string
          admin_email?: string
          admin_id?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          target_user_email?: string
          target_user_id?: string
        }
        Relationships: []
      }
      integration_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string
          email_notified_at: string | null
          id: string
          integration_name: string
          message: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          slack_notified_at: string | null
          test_result_id: string | null
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          created_at?: string
          email_notified_at?: string | null
          id?: string
          integration_name: string
          message: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          slack_notified_at?: string | null
          test_result_id?: string | null
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string
          email_notified_at?: string | null
          id?: string
          integration_name?: string
          message?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          slack_notified_at?: string | null
          test_result_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_alerts_test_result_id_fkey"
            columns: ["test_result_id"]
            isOneToOne: false
            referencedRelation: "integration_test_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_alerts_test_result_id_fkey"
            columns: ["test_result_id"]
            isOneToOne: false
            referencedRelation: "latest_integration_test_results"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_sync_logs: {
        Row: {
          batch_id: string | null
          created_at: string | null
          direction: string | null
          entity_id: string | null
          entity_name: string | null
          entity_type: string
          error_message: string | null
          id: string
          integration_name: string
          metadata: Json | null
          operation: string
          org_id: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string | null
          direction?: string | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type: string
          error_message?: string | null
          id?: string
          integration_name: string
          metadata?: Json | null
          operation: string
          org_id?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string | null
          direction?: string | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string
          error_message?: string | null
          id?: string
          integration_name?: string
          metadata?: Json | null
          operation?: string
          org_id?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_sync_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_test_results: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_details: Json | null
          id: string
          integration_name: string
          message: string | null
          org_id: string | null
          response_data: Json | null
          status: string
          test_category: string | null
          test_name: string
          triggered_by: string
          triggered_by_user_id: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_details?: Json | null
          id?: string
          integration_name: string
          message?: string | null
          org_id?: string | null
          response_data?: Json | null
          status: string
          test_category?: string | null
          test_name: string
          triggered_by: string
          triggered_by_user_id?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_details?: Json | null
          id?: string
          integration_name?: string
          message?: string | null
          org_id?: string | null
          response_data?: Json | null
          status?: string
          test_category?: string | null
          test_name?: string
          triggered_by?: string
          triggered_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_test_results_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_email_domains: {
        Row: {
          created_at: string | null
          domain: string
          id: string
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          domain: string
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          domain?: string
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      internal_users: {
        Row: {
          added_by: string | null
          created_at: string | null
          email: string
          id: string
          is_active: boolean | null
          name: string | null
          reason: string | null
          updated_at: string | null
        }
        Insert: {
          added_by?: string | null
          created_at?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          name?: string | null
          reason?: string | null
          updated_at?: string | null
        }
        Update: {
          added_by?: string | null
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          name?: string | null
          reason?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      intervention_templates: {
        Row: {
          avg_response_time_hours: number | null
          best_performing_deal_stage: string | null
          best_performing_industry: string | null
          best_performing_persona: string | null
          context_trigger: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_control_variant: boolean | null
          is_system_template: boolean | null
          last_used_at: string | null
          parent_template_id: string | null
          performance_by_segment: Json | null
          personalization_fields: Json | null
          recommended_timing: string | null
          recovery_rate_percent: number | null
          response_rate_percent: number | null
          subject_line: string | null
          tags: string[] | null
          template_body: string
          template_name: string
          template_type: string
          times_clicked: number | null
          times_opened: number | null
          times_recovered: number | null
          times_replied: number | null
          times_sent: number | null
          updated_at: string | null
          usage_notes: string | null
          user_id: string | null
          variant_name: string | null
        }
        Insert: {
          avg_response_time_hours?: number | null
          best_performing_deal_stage?: string | null
          best_performing_industry?: string | null
          best_performing_persona?: string | null
          context_trigger: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_control_variant?: boolean | null
          is_system_template?: boolean | null
          last_used_at?: string | null
          parent_template_id?: string | null
          performance_by_segment?: Json | null
          personalization_fields?: Json | null
          recommended_timing?: string | null
          recovery_rate_percent?: number | null
          response_rate_percent?: number | null
          subject_line?: string | null
          tags?: string[] | null
          template_body: string
          template_name: string
          template_type: string
          times_clicked?: number | null
          times_opened?: number | null
          times_recovered?: number | null
          times_replied?: number | null
          times_sent?: number | null
          updated_at?: string | null
          usage_notes?: string | null
          user_id?: string | null
          variant_name?: string | null
        }
        Update: {
          avg_response_time_hours?: number | null
          best_performing_deal_stage?: string | null
          best_performing_industry?: string | null
          best_performing_persona?: string | null
          context_trigger?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_control_variant?: boolean | null
          is_system_template?: boolean | null
          last_used_at?: string | null
          parent_template_id?: string | null
          performance_by_segment?: Json | null
          personalization_fields?: Json | null
          recommended_timing?: string | null
          recovery_rate_percent?: number | null
          response_rate_percent?: number | null
          subject_line?: string | null
          tags?: string[] | null
          template_body?: string
          template_name?: string
          template_type?: string
          times_clicked?: number | null
          times_opened?: number | null
          times_recovered?: number | null
          times_replied?: number | null
          times_sent?: number | null
          updated_at?: string | null
          usage_notes?: string | null
          user_id?: string | null
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intervention_templates_parent_template_id_fkey"
            columns: ["parent_template_id"]
            isOneToOne: false
            referencedRelation: "intervention_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      interventions: {
        Row: {
          ai_recommendation_score: number | null
          click_count: number | null
          clicked_at: string | null
          company_id: string | null
          contact_id: string | null
          context_trigger: string
          created_at: string | null
          days_since_last_contact: number | null
          deal_id: string | null
          delivered_at: string | null
          first_open_at: string | null
          health_score_at_send: number | null
          id: string
          intervention_body: string
          intervention_channel: string
          metadata: Json | null
          open_count: number | null
          opened_at: string | null
          outcome: string | null
          outcome_notes: string | null
          personalization_data: Json | null
          recovered_at: string | null
          relationship_health_id: string
          replied_at: string | null
          response_text: string | null
          response_type: string | null
          sent_at: string | null
          status: string
          subject_line: string | null
          suggested_reply: string | null
          template_id: string | null
          template_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_recommendation_score?: number | null
          click_count?: number | null
          clicked_at?: string | null
          company_id?: string | null
          contact_id?: string | null
          context_trigger: string
          created_at?: string | null
          days_since_last_contact?: number | null
          deal_id?: string | null
          delivered_at?: string | null
          first_open_at?: string | null
          health_score_at_send?: number | null
          id?: string
          intervention_body: string
          intervention_channel?: string
          metadata?: Json | null
          open_count?: number | null
          opened_at?: string | null
          outcome?: string | null
          outcome_notes?: string | null
          personalization_data?: Json | null
          recovered_at?: string | null
          relationship_health_id: string
          replied_at?: string | null
          response_text?: string | null
          response_type?: string | null
          sent_at?: string | null
          status?: string
          subject_line?: string | null
          suggested_reply?: string | null
          template_id?: string | null
          template_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_recommendation_score?: number | null
          click_count?: number | null
          clicked_at?: string | null
          company_id?: string | null
          contact_id?: string | null
          context_trigger?: string
          created_at?: string | null
          days_since_last_contact?: number | null
          deal_id?: string | null
          delivered_at?: string | null
          first_open_at?: string | null
          health_score_at_send?: number | null
          id?: string
          intervention_body?: string
          intervention_channel?: string
          metadata?: Json | null
          open_count?: number | null
          opened_at?: string | null
          outcome?: string | null
          outcome_notes?: string | null
          personalization_data?: Json | null
          recovered_at?: string | null
          relationship_health_id?: string
          replied_at?: string | null
          response_text?: string | null
          response_type?: string | null
          sent_at?: string | null
          status?: string
          subject_line?: string | null
          suggested_reply?: string | null
          template_id?: string | null
          template_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interventions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_relationship_health_id_fkey"
            columns: ["relationship_health_id"]
            isOneToOne: false
            referencedRelation: "relationship_health_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "intervention_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      justcall_integration_secrets: {
        Row: {
          api_key: string | null
          api_secret: string | null
          created_at: string | null
          integration_id: string
          oauth_access_token: string | null
          oauth_refresh_token: string | null
          org_id: string
          updated_at: string | null
        }
        Insert: {
          api_key?: string | null
          api_secret?: string | null
          created_at?: string | null
          integration_id: string
          oauth_access_token?: string | null
          oauth_refresh_token?: string | null
          org_id: string
          updated_at?: string | null
        }
        Update: {
          api_key?: string | null
          api_secret?: string | null
          created_at?: string | null
          integration_id?: string
          oauth_access_token?: string | null
          oauth_refresh_token?: string | null
          org_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "justcall_integration_secrets_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: true
            referencedRelation: "justcall_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "justcall_integration_secrets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "justcall_integration_secrets_org_matches_parent"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      justcall_integrations: {
        Row: {
          auth_type: string
          connected_by_user_id: string | null
          created_at: string | null
          id: string
          is_active: boolean
          last_sync_at: string | null
          org_id: string
          token_expires_at: string | null
          updated_at: string | null
          webhook_token: string
        }
        Insert: {
          auth_type: string
          connected_by_user_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          org_id: string
          token_expires_at?: string | null
          updated_at?: string | null
          webhook_token: string
        }
        Update: {
          auth_type?: string
          connected_by_user_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          org_id?: string
          token_expires_at?: string | null
          updated_at?: string | null
          webhook_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "justcall_integrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      justcall_oauth_states: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          org_id: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          org_id: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          org_id?: string
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "justcall_oauth_states_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      launch_checklist_items: {
        Row: {
          category: string
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          description: string | null
          effort_hours: string | null
          id: string
          notes: string | null
          order_index: number | null
          status: string
          subtasks: Json | null
          task_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          category: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          description?: string | null
          effort_hours?: string | null
          id?: string
          notes?: string | null
          order_index?: number | null
          status?: string
          subtasks?: Json | null
          task_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          description?: string | null
          effort_hours?: string | null
          id?: string
          notes?: string | null
          order_index?: number | null
          status?: string
          subtasks?: Json | null
          task_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      lead_events: {
        Row: {
          created_at: string | null
          event_type: string
          external_id: string | null
          external_occured_at: string | null
          external_source: string
          id: string
          lead_id: string | null
          payload: Json
          payload_hash: string | null
          received_at: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          external_id?: string | null
          external_occured_at?: string | null
          external_source?: string
          id?: string
          lead_id?: string | null
          payload: Json
          payload_hash?: string | null
          received_at?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          external_id?: string | null
          external_occured_at?: string | null
          external_source?: string
          id?: string
          lead_id?: string | null
          payload?: Json
          payload_hash?: string | null
          received_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_prep_notes: {
        Row: {
          body: string
          clerk_org_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_auto_generated: boolean | null
          is_pinned: boolean | null
          lead_id: string
          metadata: Json | null
          note_type: string
          sort_order: number | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          body: string
          clerk_org_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_auto_generated?: boolean | null
          is_pinned?: boolean | null
          lead_id: string
          metadata?: Json | null
          note_type: string
          sort_order?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          body?: string
          clerk_org_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_auto_generated?: boolean | null
          is_pinned?: boolean | null
          lead_id?: string
          metadata?: Json | null
          note_type?: string
          sort_order?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_prep_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sources: {
        Row: {
          channel: string | null
          created_at: string | null
          default_owner_id: string | null
          description: string | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          name: string
          source_key: string
          updated_at: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          channel?: string | null
          created_at?: string | null
          default_owner_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name: string
          source_key: string
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          channel?: string | null
          created_at?: string | null
          default_owner_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name?: string
          source_key?: string
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_sources_default_owner_id_fkey"
            columns: ["default_owner_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "lead_sources_default_owner_id_fkey"
            columns: ["default_owner_id"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "lead_sources_default_owner_id_fkey"
            columns: ["default_owner_id"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "lead_sources_default_owner_id_fkey"
            columns: ["default_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_sources_default_owner_id_fkey"
            columns: ["default_owner_id"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      leads: {
        Row: {
          attendee_count: number | null
          booking_link_id: string | null
          booking_link_name: string | null
          booking_link_slug: string | null
          booking_scope_slug: string | null
          clerk_org_id: string | null
          company_id: string | null
          conferencing_type: string | null
          conferencing_url: string | null
          contact_email: string | null
          contact_first_name: string | null
          contact_id: string | null
          contact_last_name: string | null
          contact_marketing_opt_in: boolean | null
          contact_name: string | null
          contact_phone: string | null
          contact_timezone: string | null
          converted_deal_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          domain: string | null
          enrichment_provider: string | null
          enrichment_status: string
          external_attendee_emails: string[] | null
          external_id: string | null
          external_occured_at: string | null
          external_source: string
          first_seen_at: string | null
          id: string
          meeting_description: string | null
          meeting_duration_minutes: number | null
          meeting_end: string | null
          meeting_start: string | null
          meeting_timezone: string | null
          meeting_title: string | null
          meeting_url: string | null
          metadata: Json | null
          owner_id: string | null
          prep_status: string
          prep_summary: string | null
          priority: string
          scheduler_email: string | null
          scheduler_name: string | null
          source_campaign: string | null
          source_channel: string | null
          source_id: string | null
          source_medium: string | null
          status: string
          tags: string[] | null
          updated_at: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          attendee_count?: number | null
          booking_link_id?: string | null
          booking_link_name?: string | null
          booking_link_slug?: string | null
          booking_scope_slug?: string | null
          clerk_org_id?: string | null
          company_id?: string | null
          conferencing_type?: string | null
          conferencing_url?: string | null
          contact_email?: string | null
          contact_first_name?: string | null
          contact_id?: string | null
          contact_last_name?: string | null
          contact_marketing_opt_in?: boolean | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_timezone?: string | null
          converted_deal_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          domain?: string | null
          enrichment_provider?: string | null
          enrichment_status?: string
          external_attendee_emails?: string[] | null
          external_id?: string | null
          external_occured_at?: string | null
          external_source?: string
          first_seen_at?: string | null
          id?: string
          meeting_description?: string | null
          meeting_duration_minutes?: number | null
          meeting_end?: string | null
          meeting_start?: string | null
          meeting_timezone?: string | null
          meeting_title?: string | null
          meeting_url?: string | null
          metadata?: Json | null
          owner_id?: string | null
          prep_status?: string
          prep_summary?: string | null
          priority?: string
          scheduler_email?: string | null
          scheduler_name?: string | null
          source_campaign?: string | null
          source_channel?: string | null
          source_id?: string | null
          source_medium?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          attendee_count?: number | null
          booking_link_id?: string | null
          booking_link_name?: string | null
          booking_link_slug?: string | null
          booking_scope_slug?: string | null
          clerk_org_id?: string | null
          company_id?: string | null
          conferencing_type?: string | null
          conferencing_url?: string | null
          contact_email?: string | null
          contact_first_name?: string | null
          contact_id?: string | null
          contact_last_name?: string | null
          contact_marketing_opt_in?: boolean | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_timezone?: string | null
          converted_deal_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          domain?: string | null
          enrichment_provider?: string | null
          enrichment_status?: string
          external_attendee_emails?: string[] | null
          external_id?: string | null
          external_occured_at?: string | null
          external_source?: string
          first_seen_at?: string | null
          id?: string
          meeting_description?: string | null
          meeting_duration_minutes?: number | null
          meeting_end?: string | null
          meeting_start?: string | null
          meeting_timezone?: string | null
          meeting_title?: string | null
          meeting_url?: string | null
          metadata?: Json | null
          owner_id?: string | null
          prep_status?: string
          prep_summary?: string | null
          priority?: string
          scheduler_email?: string | null
          scheduler_name?: string | null
          source_campaign?: string | null
          source_channel?: string | null
          source_id?: string | null
          source_medium?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_deal_id_fkey"
            columns: ["converted_deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leads_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_connections: {
        Row: {
          created_at: string | null
          credentials: Json
          id: string
          is_active: boolean | null
          last_sync: string | null
          service_type: string
          settings: Json | null
          sync_status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          credentials: Json
          id?: string
          is_active?: boolean | null
          last_sync?: string | null
          service_type: string
          settings?: Json | null
          sync_status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          credentials?: Json
          id?: string
          is_active?: boolean | null
          last_sync?: string | null
          service_type?: string
          settings?: Json | null
          sync_status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      meeting_action_items: {
        Row: {
          ai_analyzed_at: string | null
          ai_confidence: number | null
          ai_confidence_score: number | null
          ai_deadline: string | null
          ai_generated: boolean | null
          ai_reasoning: string | null
          ai_task_type: string | null
          assigned_to_email: string | null
          assigned_to_name: string | null
          assignee_email: string | null
          assignee_name: string | null
          category: string | null
          completed: boolean | null
          created_at: string | null
          deadline_at: string | null
          deadline_date: string | null
          id: string
          importance: string | null
          is_sales_rep_task: boolean | null
          linked_task_id: string | null
          meeting_id: string
          needs_review: boolean | null
          playback_url: string | null
          priority: string | null
          sync_error: string | null
          sync_status: string | null
          synced_at: string | null
          synced_to_task: boolean | null
          task_id: string | null
          timestamp_seconds: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          ai_analyzed_at?: string | null
          ai_confidence?: number | null
          ai_confidence_score?: number | null
          ai_deadline?: string | null
          ai_generated?: boolean | null
          ai_reasoning?: string | null
          ai_task_type?: string | null
          assigned_to_email?: string | null
          assigned_to_name?: string | null
          assignee_email?: string | null
          assignee_name?: string | null
          category?: string | null
          completed?: boolean | null
          created_at?: string | null
          deadline_at?: string | null
          deadline_date?: string | null
          id?: string
          importance?: string | null
          is_sales_rep_task?: boolean | null
          linked_task_id?: string | null
          meeting_id: string
          needs_review?: boolean | null
          playback_url?: string | null
          priority?: string | null
          sync_error?: string | null
          sync_status?: string | null
          synced_at?: string | null
          synced_to_task?: boolean | null
          task_id?: string | null
          timestamp_seconds?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          ai_analyzed_at?: string | null
          ai_confidence?: number | null
          ai_confidence_score?: number | null
          ai_deadline?: string | null
          ai_generated?: boolean | null
          ai_reasoning?: string | null
          ai_task_type?: string | null
          assigned_to_email?: string | null
          assigned_to_name?: string | null
          assignee_email?: string | null
          assignee_name?: string | null
          category?: string | null
          completed?: boolean | null
          created_at?: string | null
          deadline_at?: string | null
          deadline_date?: string | null
          id?: string
          importance?: string | null
          is_sales_rep_task?: boolean | null
          linked_task_id?: string | null
          meeting_id?: string
          needs_review?: boolean | null
          playback_url?: string | null
          priority?: string | null
          sync_error?: string | null
          sync_status?: string | null
          synced_at?: string | null
          synced_to_task?: boolean | null
          task_id?: string | null
          timestamp_seconds?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_action_items_linked_task_id_fkey"
            columns: ["linked_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_action_items_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_aggregate_metrics: {
        Row: {
          avg_customer_talk_time: number | null
          avg_discovery_questions: number | null
          avg_rep_talk_time: number | null
          avg_scorecard_score: number | null
          avg_sentiment_score: number | null
          budget_discussion_count: number | null
          competitor_mention_count: number | null
          created_at: string | null
          demo_request_count: number | null
          forward_movement_change_pct: number | null
          forward_movement_count: number | null
          id: string
          last_calculated_at: string | null
          meetings_analyzed: number | null
          meetings_change_pct: number | null
          meetings_with_transcripts: number | null
          negative_outcome_count: number | null
          negative_sentiment_count: number | null
          neutral_outcome_count: number | null
          neutral_sentiment_count: number | null
          next_steps_established_count: number | null
          next_steps_rate: number | null
          objection_count: number | null
          org_id: string
          period_end: string
          period_start: string
          period_type: string
          positive_outcome_count: number | null
          positive_sentiment_count: number | null
          pricing_discussion_count: number | null
          proposal_request_count: number | null
          rep_breakdown: Json | null
          sentiment_change_pct: number | null
          stage_breakdown: Json | null
          timeline_discussion_count: number | null
          top_competitors: Json | null
          top_objections: Json | null
          total_meetings: number | null
        }
        Insert: {
          avg_customer_talk_time?: number | null
          avg_discovery_questions?: number | null
          avg_rep_talk_time?: number | null
          avg_scorecard_score?: number | null
          avg_sentiment_score?: number | null
          budget_discussion_count?: number | null
          competitor_mention_count?: number | null
          created_at?: string | null
          demo_request_count?: number | null
          forward_movement_change_pct?: number | null
          forward_movement_count?: number | null
          id?: string
          last_calculated_at?: string | null
          meetings_analyzed?: number | null
          meetings_change_pct?: number | null
          meetings_with_transcripts?: number | null
          negative_outcome_count?: number | null
          negative_sentiment_count?: number | null
          neutral_outcome_count?: number | null
          neutral_sentiment_count?: number | null
          next_steps_established_count?: number | null
          next_steps_rate?: number | null
          objection_count?: number | null
          org_id: string
          period_end: string
          period_start: string
          period_type: string
          positive_outcome_count?: number | null
          positive_sentiment_count?: number | null
          pricing_discussion_count?: number | null
          proposal_request_count?: number | null
          rep_breakdown?: Json | null
          sentiment_change_pct?: number | null
          stage_breakdown?: Json | null
          timeline_discussion_count?: number | null
          top_competitors?: Json | null
          top_objections?: Json | null
          total_meetings?: number | null
        }
        Update: {
          avg_customer_talk_time?: number | null
          avg_discovery_questions?: number | null
          avg_rep_talk_time?: number | null
          avg_scorecard_score?: number | null
          avg_sentiment_score?: number | null
          budget_discussion_count?: number | null
          competitor_mention_count?: number | null
          created_at?: string | null
          demo_request_count?: number | null
          forward_movement_change_pct?: number | null
          forward_movement_count?: number | null
          id?: string
          last_calculated_at?: string | null
          meetings_analyzed?: number | null
          meetings_change_pct?: number | null
          meetings_with_transcripts?: number | null
          negative_outcome_count?: number | null
          negative_sentiment_count?: number | null
          neutral_outcome_count?: number | null
          neutral_sentiment_count?: number | null
          next_steps_established_count?: number | null
          next_steps_rate?: number | null
          objection_count?: number | null
          org_id?: string
          period_end?: string
          period_start?: string
          period_type?: string
          positive_outcome_count?: number | null
          positive_sentiment_count?: number | null
          pricing_discussion_count?: number | null
          proposal_request_count?: number | null
          rep_breakdown?: Json | null
          sentiment_change_pct?: number | null
          stage_breakdown?: Json | null
          timeline_discussion_count?: number | null
          top_competitors?: Json | null
          top_objections?: Json | null
          total_meetings?: number | null
        }
        Relationships: []
      }
      meeting_attendees: {
        Row: {
          email: string | null
          id: string
          is_external: boolean | null
          meeting_id: string | null
          name: string | null
          role: string | null
        }
        Insert: {
          email?: string | null
          id?: string
          is_external?: boolean | null
          meeting_id?: string | null
          name?: string | null
          role?: string | null
        }
        Update: {
          email?: string | null
          id?: string
          is_external?: boolean | null
          meeting_id?: string | null
          name?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_classifications: {
        Row: {
          competitor_mention_count: number | null
          competitors: Json | null
          created_at: string | null
          detected_stage: string | null
          has_budget_discussion: boolean | null
          has_competitor_mention: boolean | null
          has_decision_maker: boolean | null
          has_demo_request: boolean | null
          has_forward_movement: boolean | null
          has_next_steps: boolean | null
          has_objection: boolean | null
          has_pricing_discussion: boolean | null
          has_proposal_request: boolean | null
          has_timeline_discussion: boolean | null
          id: string
          keywords: Json | null
          meeting_id: string | null
          negative_signal_count: number | null
          objection_count: number | null
          objections: Json | null
          org_id: string
          outcome: string | null
          positive_signal_count: number | null
          topics: Json | null
          updated_at: string | null
        }
        Insert: {
          competitor_mention_count?: number | null
          competitors?: Json | null
          created_at?: string | null
          detected_stage?: string | null
          has_budget_discussion?: boolean | null
          has_competitor_mention?: boolean | null
          has_decision_maker?: boolean | null
          has_demo_request?: boolean | null
          has_forward_movement?: boolean | null
          has_next_steps?: boolean | null
          has_objection?: boolean | null
          has_pricing_discussion?: boolean | null
          has_proposal_request?: boolean | null
          has_timeline_discussion?: boolean | null
          id?: string
          keywords?: Json | null
          meeting_id?: string | null
          negative_signal_count?: number | null
          objection_count?: number | null
          objections?: Json | null
          org_id: string
          outcome?: string | null
          positive_signal_count?: number | null
          topics?: Json | null
          updated_at?: string | null
        }
        Update: {
          competitor_mention_count?: number | null
          competitors?: Json | null
          created_at?: string | null
          detected_stage?: string | null
          has_budget_discussion?: boolean | null
          has_competitor_mention?: boolean | null
          has_decision_maker?: boolean | null
          has_demo_request?: boolean | null
          has_forward_movement?: boolean | null
          has_next_steps?: boolean | null
          has_objection?: boolean | null
          has_pricing_discussion?: boolean | null
          has_proposal_request?: boolean | null
          has_timeline_discussion?: boolean | null
          id?: string
          keywords?: Json | null
          meeting_id?: string | null
          negative_signal_count?: number | null
          objection_count?: number | null
          objections?: Json | null
          org_id?: string
          outcome?: string | null
          positive_signal_count?: number | null
          topics?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_classifications_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_contacts: {
        Row: {
          contact_id: string
          created_at: string | null
          id: string
          is_primary: boolean | null
          meeting_id: string
          role: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          meeting_id: string
          role?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          meeting_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_contacts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_content_topics: {
        Row: {
          cost_cents: number | null
          created_at: string
          created_by: string
          deleted_at: string | null
          extraction_version: number
          id: string
          meeting_id: string
          model_used: string
          tokens_used: number | null
          topics: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          cost_cents?: number | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          extraction_version?: number
          id?: string
          meeting_id: string
          model_used: string
          tokens_used?: number | null
          topics?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          cost_cents?: number | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          extraction_version?: number
          id?: string
          meeting_id?: string
          model_used?: string
          tokens_used?: number | null
          topics?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_content_topics_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_documents: {
        Row: {
          created_at: string | null
          document_id: string
          document_title: string | null
          document_url: string
          id: string
          meeting_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          document_id: string
          document_title?: string | null
          document_url: string
          id?: string
          meeting_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          document_id?: string
          document_title?: string | null
          document_url?: string
          id?: string
          meeting_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      meeting_file_search_index: {
        Row: {
          content_hash: string | null
          error_message: string | null
          file_name: string | null
          id: string
          indexed_at: string | null
          meeting_id: string | null
          meeting_owner_id: string | null
          metadata: Json | null
          org_id: string | null
          status: string | null
          store_name: string
          user_id: string | null
        }
        Insert: {
          content_hash?: string | null
          error_message?: string | null
          file_name?: string | null
          id?: string
          indexed_at?: string | null
          meeting_id?: string | null
          meeting_owner_id?: string | null
          metadata?: Json | null
          org_id?: string | null
          status?: string | null
          store_name: string
          user_id?: string | null
        }
        Update: {
          content_hash?: string | null
          error_message?: string | null
          file_name?: string | null
          id?: string
          indexed_at?: string | null
          meeting_id?: string | null
          meeting_owner_id?: string | null
          metadata?: Json | null
          org_id?: string | null
          status?: string | null
          store_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_file_search_index_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_generated_content: {
        Row: {
          content: string
          content_type: string
          cost_cents: number | null
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          is_latest: boolean
          meeting_id: string
          model_used: string
          parent_id: string | null
          prompt_used: string | null
          title: string | null
          tokens_used: number | null
          updated_at: string
          version: number
        }
        Insert: {
          content: string
          content_type: string
          cost_cents?: number | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          id?: string
          is_latest?: boolean
          meeting_id: string
          model_used: string
          parent_id?: string | null
          prompt_used?: string | null
          title?: string | null
          tokens_used?: number | null
          updated_at?: string
          version?: number
        }
        Update: {
          content?: string
          content_type?: string
          cost_cents?: number | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          is_latest?: boolean
          meeting_id?: string
          model_used?: string
          parent_id?: string | null
          prompt_used?: string | null
          title?: string | null
          tokens_used?: number | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "meeting_generated_content_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_generated_content_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "meeting_generated_content"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_index_queue: {
        Row: {
          attempts: number | null
          created_at: string | null
          error_message: string | null
          id: string
          last_attempt_at: string | null
          last_error: string | null
          max_attempts: number | null
          meeting_id: string | null
          priority: number | null
          processed_at: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          max_attempts?: number | null
          meeting_id?: string | null
          priority?: number | null
          processed_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          max_attempts?: number | null
          meeting_id?: string | null
          priority?: number | null
          processed_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_index_queue_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_intelligence_queries: {
        Row: {
          created_at: string | null
          id: string
          parsed_filters: Json | null
          parsed_semantic_query: string | null
          query_text: string
          response_time_ms: number | null
          results_count: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          parsed_filters?: Json | null
          parsed_semantic_query?: string | null
          query_text: string
          response_time_ms?: number | null
          results_count?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          parsed_filters?: Json | null
          parsed_semantic_query?: string | null
          query_text?: string
          response_time_ms?: number | null
          results_count?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      meeting_metrics: {
        Row: {
          avg_response_latency_ms: number | null
          id: string
          interruption_count: number | null
          meeting_id: string | null
          words_spoken_customer: number | null
          words_spoken_rep: number | null
        }
        Insert: {
          avg_response_latency_ms?: number | null
          id?: string
          interruption_count?: number | null
          meeting_id?: string | null
          words_spoken_customer?: number | null
          words_spoken_rep?: number | null
        }
        Update: {
          avg_response_latency_ms?: number | null
          id?: string
          interruption_count?: number | null
          meeting_id?: string | null
          words_spoken_customer?: number | null
          words_spoken_rep?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_metrics_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_scorecards: {
        Row: {
          ai_model_used: string | null
          areas_for_improvement: Json | null
          checklist_completion_pct: number | null
          checklist_required_completion_pct: number | null
          checklist_results: Json | null
          coaching_tips: Json | null
          created_at: string | null
          detected_meeting_type: string | null
          discovery_questions_count: number | null
          discovery_questions_examples: Json | null
          grade: string | null
          id: string
          key_moments: Json | null
          meeting_id: string | null
          metric_scores: Json | null
          monologue_count: number | null
          monologue_instances: Json | null
          next_steps_details: string | null
          next_steps_established: boolean | null
          org_id: string
          overall_score: number | null
          processing_time_ms: number | null
          rep_user_id: string | null
          script_adherence_score: number | null
          script_flow_analysis: Json | null
          specific_feedback: string | null
          strengths: Json | null
          talk_time_customer_pct: number | null
          talk_time_rep_pct: number | null
          template_id: string | null
          tokens_used: number | null
          updated_at: string | null
          workflow_checklist_results: Json | null
        }
        Insert: {
          ai_model_used?: string | null
          areas_for_improvement?: Json | null
          checklist_completion_pct?: number | null
          checklist_required_completion_pct?: number | null
          checklist_results?: Json | null
          coaching_tips?: Json | null
          created_at?: string | null
          detected_meeting_type?: string | null
          discovery_questions_count?: number | null
          discovery_questions_examples?: Json | null
          grade?: string | null
          id?: string
          key_moments?: Json | null
          meeting_id?: string | null
          metric_scores?: Json | null
          monologue_count?: number | null
          monologue_instances?: Json | null
          next_steps_details?: string | null
          next_steps_established?: boolean | null
          org_id: string
          overall_score?: number | null
          processing_time_ms?: number | null
          rep_user_id?: string | null
          script_adherence_score?: number | null
          script_flow_analysis?: Json | null
          specific_feedback?: string | null
          strengths?: Json | null
          talk_time_customer_pct?: number | null
          talk_time_rep_pct?: number | null
          template_id?: string | null
          tokens_used?: number | null
          updated_at?: string | null
          workflow_checklist_results?: Json | null
        }
        Update: {
          ai_model_used?: string | null
          areas_for_improvement?: Json | null
          checklist_completion_pct?: number | null
          checklist_required_completion_pct?: number | null
          checklist_results?: Json | null
          coaching_tips?: Json | null
          created_at?: string | null
          detected_meeting_type?: string | null
          discovery_questions_count?: number | null
          discovery_questions_examples?: Json | null
          grade?: string | null
          id?: string
          key_moments?: Json | null
          meeting_id?: string | null
          metric_scores?: Json | null
          monologue_count?: number | null
          monologue_instances?: Json | null
          next_steps_details?: string | null
          next_steps_established?: boolean | null
          org_id?: string
          overall_score?: number | null
          processing_time_ms?: number | null
          rep_user_id?: string | null
          script_adherence_score?: number | null
          script_flow_analysis?: Json | null
          specific_feedback?: string | null
          strengths?: Json | null
          talk_time_customer_pct?: number | null
          talk_time_rep_pct?: number | null
          template_id?: string | null
          tokens_used?: number | null
          updated_at?: string | null
          workflow_checklist_results?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_scorecards_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_scorecards_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "coaching_scorecard_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_structured_summaries: {
        Row: {
          ai_model_used: string | null
          competitor_mentions: Json | null
          created_at: string | null
          id: string
          key_decisions: Json | null
          meeting_id: string | null
          objections: Json | null
          org_id: string
          outcome_signals: Json | null
          pricing_discussed: Json | null
          processing_time_ms: number | null
          prospect_commitments: Json | null
          rep_commitments: Json | null
          stage_indicators: Json | null
          stakeholders_mentioned: Json | null
          technical_requirements: Json | null
          tokens_used: number | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          ai_model_used?: string | null
          competitor_mentions?: Json | null
          created_at?: string | null
          id?: string
          key_decisions?: Json | null
          meeting_id?: string | null
          objections?: Json | null
          org_id: string
          outcome_signals?: Json | null
          pricing_discussed?: Json | null
          processing_time_ms?: number | null
          prospect_commitments?: Json | null
          rep_commitments?: Json | null
          stage_indicators?: Json | null
          stakeholders_mentioned?: Json | null
          technical_requirements?: Json | null
          tokens_used?: number | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          ai_model_used?: string | null
          competitor_mentions?: Json | null
          created_at?: string | null
          id?: string
          key_decisions?: Json | null
          meeting_id?: string | null
          objections?: Json | null
          org_id?: string
          outcome_signals?: Json | null
          pricing_discussed?: Json | null
          processing_time_ms?: number | null
          prospect_commitments?: Json | null
          rep_commitments?: Json | null
          stage_indicators?: Json | null
          stakeholders_mentioned?: Json | null
          technical_requirements?: Json | null
          tokens_used?: number | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_structured_summaries_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_topics: {
        Row: {
          id: string
          label: string | null
          meeting_id: string | null
        }
        Insert: {
          id?: string
          label?: string | null
          meeting_id?: string | null
        }
        Update: {
          id?: string
          label?: string | null
          meeting_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_topics_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_workflow_results: {
        Row: {
          call_type_id: string | null
          checklist_results: Json | null
          coverage_score: number | null
          created_at: string | null
          forward_movement_signals: Json | null
          id: string
          meeting_id: string
          missing_required_items: string[] | null
          notifications_scheduled_at: string | null
          notifications_sent: Json | null
          notifications_sent_at: string | null
          org_id: string | null
          pipeline_action_details: Json | null
          pipeline_action_taken: string | null
          required_coverage_score: number | null
          updated_at: string | null
        }
        Insert: {
          call_type_id?: string | null
          checklist_results?: Json | null
          coverage_score?: number | null
          created_at?: string | null
          forward_movement_signals?: Json | null
          id?: string
          meeting_id: string
          missing_required_items?: string[] | null
          notifications_scheduled_at?: string | null
          notifications_sent?: Json | null
          notifications_sent_at?: string | null
          org_id?: string | null
          pipeline_action_details?: Json | null
          pipeline_action_taken?: string | null
          required_coverage_score?: number | null
          updated_at?: string | null
        }
        Update: {
          call_type_id?: string | null
          checklist_results?: Json | null
          coverage_score?: number | null
          created_at?: string | null
          forward_movement_signals?: Json | null
          id?: string
          meeting_id?: string
          missing_required_items?: string[] | null
          notifications_scheduled_at?: string | null
          notifications_sent?: Json | null
          notifications_sent_at?: string | null
          org_id?: string | null
          pipeline_action_details?: Json | null
          pipeline_action_taken?: string | null
          required_coverage_score?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_workflow_results_call_type_id_fkey"
            columns: ["call_type_id"]
            isOneToOne: false
            referencedRelation: "org_call_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_workflow_results_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_workflow_results_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meetingbaas_calendars: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          meetingbaas_calendar_id: string
          name: string | null
          org_id: string | null
          platform: string
          raw_calendar_id: string
          sync_error: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          meetingbaas_calendar_id: string
          name?: string | null
          org_id?: string | null
          platform?: string
          raw_calendar_id?: string
          sync_error?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          meetingbaas_calendar_id?: string
          name?: string | null
          org_id?: string | null
          platform?: string
          raw_calendar_id?: string
          sync_error?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetingbaas_calendars_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          ai_training_metadata: Json | null
          calendar_invitees_type: string | null
          call_type_confidence: number | null
          call_type_id: string | null
          call_type_reasoning: string | null
          calls_url: string | null
          clerk_org_id: string | null
          coach_rating: number | null
          coach_summary: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          duration_minutes: number | null
          fathom_created_at: string | null
          fathom_embed_url: string | null
          fathom_recording_id: string | null
          fathom_user_id: string | null
          id: string
          is_historical_import: boolean | null
          last_synced_at: string | null
          last_transcript_fetch_at: string | null
          meeting_end: string | null
          meeting_start: string | null
          next_actions_count: number | null
          next_actions_generated_at: string | null
          next_steps_oneliner: string | null
          org_id: string | null
          owner_email: string | null
          owner_user_id: string | null
          primary_contact_id: string | null
          sentiment_reasoning: string | null
          sentiment_score: number | null
          share_url: string | null
          source_type: string
          bot_id: string | null
          meeting_platform: string | null
          meeting_url: string | null
          recording_id: string | null
          recording_s3_key: string | null
          recording_s3_url: string | null
          transcript_json: Json | null
          processing_status: string | null
          error_message: string | null
          speakers: Json | null
          start_time: string | null
          summary: string | null
          summary_oneliner: string | null
          summary_status:
            | Database["public"]["Enums"]["meeting_processing_status"]
            | null
          sync_status: string | null
          talk_time_customer_pct: number | null
          talk_time_judgement: string | null
          talk_time_rep_pct: number | null
          team_name: string | null
          thumbnail_status:
            | Database["public"]["Enums"]["meeting_processing_status"]
            | null
          thumbnail_url: string | null
          thumbnail_s3_key: string | null
          title: string | null
          transcript_doc_url: string | null
          transcript_fetch_attempts: number | null
          transcript_language: string | null
          transcript_status:
            | Database["public"]["Enums"]["meeting_processing_status"]
            | null
          transcript_text: string | null
          updated_at: string | null
          voice_recording_id: string | null
        }
        Insert: {
          ai_training_metadata?: Json | null
          calendar_invitees_type?: string | null
          call_type_confidence?: number | null
          call_type_id?: string | null
          call_type_reasoning?: string | null
          calls_url?: string | null
          clerk_org_id?: string | null
          coach_rating?: number | null
          coach_summary?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_minutes?: number | null
          fathom_created_at?: string | null
          fathom_embed_url?: string | null
          fathom_recording_id?: string | null
          fathom_user_id?: string | null
          id?: string
          is_historical_import?: boolean | null
          last_synced_at?: string | null
          last_transcript_fetch_at?: string | null
          meeting_end?: string | null
          meeting_start?: string | null
          next_actions_count?: number | null
          next_actions_generated_at?: string | null
          next_steps_oneliner?: string | null
          org_id?: string | null
          owner_email?: string | null
          owner_user_id?: string | null
          primary_contact_id?: string | null
          sentiment_reasoning?: string | null
          sentiment_score?: number | null
          share_url?: string | null
          source_type?: string
          bot_id?: string | null
          meeting_platform?: string | null
          meeting_url?: string | null
          recording_id?: string | null
          recording_s3_key?: string | null
          recording_s3_url?: string | null
          transcript_json?: Json | null
          processing_status?: string | null
          error_message?: string | null
          speakers?: Json | null
          start_time?: string | null
          summary?: string | null
          summary_oneliner?: string | null
          summary_status?:
            | Database["public"]["Enums"]["meeting_processing_status"]
            | null
          sync_status?: string | null
          talk_time_customer_pct?: number | null
          talk_time_judgement?: string | null
          talk_time_rep_pct?: number | null
          team_name?: string | null
          thumbnail_status?:
            | Database["public"]["Enums"]["meeting_processing_status"]
            | null
          thumbnail_url?: string | null
          thumbnail_s3_key?: string | null
          title?: string | null
          transcript_doc_url?: string | null
          transcript_fetch_attempts?: number | null
          transcript_language?: string | null
          transcript_status?:
            | Database["public"]["Enums"]["meeting_processing_status"]
            | null
          transcript_text?: string | null
          updated_at?: string | null
          voice_recording_id?: string | null
        }
        Update: {
          ai_training_metadata?: Json | null
          calendar_invitees_type?: string | null
          call_type_confidence?: number | null
          call_type_id?: string | null
          call_type_reasoning?: string | null
          calls_url?: string | null
          clerk_org_id?: string | null
          coach_rating?: number | null
          coach_summary?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_minutes?: number | null
          fathom_created_at?: string | null
          fathom_embed_url?: string | null
          fathom_recording_id?: string | null
          fathom_user_id?: string | null
          id?: string
          is_historical_import?: boolean | null
          last_synced_at?: string | null
          last_transcript_fetch_at?: string | null
          meeting_end?: string | null
          meeting_start?: string | null
          next_actions_count?: number | null
          next_actions_generated_at?: string | null
          next_steps_oneliner?: string | null
          org_id?: string | null
          owner_email?: string | null
          owner_user_id?: string | null
          primary_contact_id?: string | null
          sentiment_reasoning?: string | null
          sentiment_score?: number | null
          share_url?: string | null
          source_type?: string
          bot_id?: string | null
          meeting_platform?: string | null
          meeting_url?: string | null
          recording_id?: string | null
          recording_s3_key?: string | null
          recording_s3_url?: string | null
          transcript_json?: Json | null
          processing_status?: string | null
          error_message?: string | null
          speakers?: Json | null
          start_time?: string | null
          summary?: string | null
          summary_oneliner?: string | null
          summary_status?:
            | Database["public"]["Enums"]["meeting_processing_status"]
            | null
          sync_status?: string | null
          talk_time_customer_pct?: number | null
          talk_time_judgement?: string | null
          talk_time_rep_pct?: number | null
          team_name?: string | null
          thumbnail_status?:
            | Database["public"]["Enums"]["meeting_processing_status"]
            | null
          thumbnail_url?: string | null
          thumbnail_s3_key?: string | null
          title?: string | null
          transcript_doc_url?: string | null
          transcript_fetch_attempts?: number | null
          transcript_language?: string | null
          transcript_status?:
            | Database["public"]["Enums"]["meeting_processing_status"]
            | null
          transcript_text?: string | null
          updated_at?: string | null
          voice_recording_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_meetings_company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_meetings_contact_id"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_call_type_id_fkey"
            columns: ["call_type_id"]
            isOneToOne: false
            referencedRelation: "org_call_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_voice_recording_id_fkey"
            columns: ["voice_recording_id"]
            isOneToOne: false
            referencedRelation: "voice_recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings_waitlist: {
        Row: {
          access_granted_by: string | null
          admin_notes: string | null
          company_name: string
          converted_at: string | null
          created_at: string | null
          crm_other: string | null
          crm_tool: string | null
          dialer_other: string | null
          dialer_tool: string | null
          display_rank: number | null
          effective_position: number | null
          email: string
          email_boost_claimed: boolean | null
          email_first_share_at: string | null
          full_name: string
          granted_access_at: string | null
          granted_by: string | null
          id: string
          invitation_accepted_at: string | null
          invitation_expires_at: string | null
          invite_code_used: string | null
          invited_at: string | null
          invited_user_id: string | null
          is_seeded: boolean
          linkedin_boost_claimed: boolean | null
          linkedin_first_share_at: string | null
          linkedin_share_claimed: boolean | null
          magic_link_expires_at: string | null
          magic_link_sent_at: string | null
          meeting_recorder_other: string | null
          meeting_recorder_tool: string | null
          profile_image_url: string | null
          referral_code: string
          referral_count: number | null
          referred_by_code: string | null
          registration_url: string | null
          released_at: string | null
          released_by: string | null
          signup_position: number | null
          signup_source: string | null
          status: Database["public"]["Enums"]["waitlist_status"]
          task_manager_other: string | null
          task_manager_tool: string | null
          total_points: number | null
          twitter_boost_claimed: boolean | null
          twitter_first_share_at: string | null
          updated_at: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          access_granted_by?: string | null
          admin_notes?: string | null
          company_name: string
          converted_at?: string | null
          created_at?: string | null
          crm_other?: string | null
          crm_tool?: string | null
          dialer_other?: string | null
          dialer_tool?: string | null
          display_rank?: number | null
          effective_position?: number | null
          email: string
          email_boost_claimed?: boolean | null
          email_first_share_at?: string | null
          full_name: string
          granted_access_at?: string | null
          granted_by?: string | null
          id?: string
          invitation_accepted_at?: string | null
          invitation_expires_at?: string | null
          invite_code_used?: string | null
          invited_at?: string | null
          invited_user_id?: string | null
          is_seeded?: boolean
          linkedin_boost_claimed?: boolean | null
          linkedin_first_share_at?: string | null
          linkedin_share_claimed?: boolean | null
          magic_link_expires_at?: string | null
          magic_link_sent_at?: string | null
          meeting_recorder_other?: string | null
          meeting_recorder_tool?: string | null
          profile_image_url?: string | null
          referral_code: string
          referral_count?: number | null
          referred_by_code?: string | null
          registration_url?: string | null
          released_at?: string | null
          released_by?: string | null
          signup_position?: number | null
          signup_source?: string | null
          status?: Database["public"]["Enums"]["waitlist_status"]
          task_manager_other?: string | null
          task_manager_tool?: string | null
          total_points?: number | null
          twitter_boost_claimed?: boolean | null
          twitter_first_share_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          access_granted_by?: string | null
          admin_notes?: string | null
          company_name?: string
          converted_at?: string | null
          created_at?: string | null
          crm_other?: string | null
          crm_tool?: string | null
          dialer_other?: string | null
          dialer_tool?: string | null
          display_rank?: number | null
          effective_position?: number | null
          email?: string
          email_boost_claimed?: boolean | null
          email_first_share_at?: string | null
          full_name?: string
          granted_access_at?: string | null
          granted_by?: string | null
          id?: string
          invitation_accepted_at?: string | null
          invitation_expires_at?: string | null
          invite_code_used?: string | null
          invited_at?: string | null
          invited_user_id?: string | null
          is_seeded?: boolean
          linkedin_boost_claimed?: boolean | null
          linkedin_first_share_at?: string | null
          linkedin_share_claimed?: boolean | null
          magic_link_expires_at?: string | null
          magic_link_sent_at?: string | null
          meeting_recorder_other?: string | null
          meeting_recorder_tool?: string | null
          profile_image_url?: string | null
          referral_code?: string
          referral_count?: number | null
          referred_by_code?: string | null
          registration_url?: string | null
          released_at?: string | null
          released_by?: string | null
          signup_position?: number | null
          signup_source?: string | null
          status?: Database["public"]["Enums"]["waitlist_status"]
          task_manager_other?: string | null
          task_manager_tool?: string | null
          total_points?: number | null
          twitter_boost_claimed?: boolean | null
          twitter_first_share_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_waitlist_access_granted_by_fkey"
            columns: ["access_granted_by"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "meetings_waitlist_access_granted_by_fkey"
            columns: ["access_granted_by"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meetings_waitlist_access_granted_by_fkey"
            columns: ["access_granted_by"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "meetings_waitlist_access_granted_by_fkey"
            columns: ["access_granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_waitlist_access_granted_by_fkey"
            columns: ["access_granted_by"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meetings_waitlist_referred_by_code_fkey"
            columns: ["referred_by_code"]
            isOneToOne: false
            referencedRelation: "meetings_waitlist"
            referencedColumns: ["referral_code"]
          },
          {
            foreignKeyName: "meetings_waitlist_referred_by_code_fkey"
            columns: ["referred_by_code"]
            isOneToOne: false
            referencedRelation: "waitlist_with_rank"
            referencedColumns: ["referral_code"]
          },
          {
            foreignKeyName: "meetings_waitlist_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "meetings_waitlist_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meetings_waitlist_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "meetings_waitlist_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_waitlist_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      next_action_suggestions: {
        Row: {
          accepted_at: string | null
          action_type: string
          activity_id: string
          activity_type: string
          ai_model: string | null
          company_id: string | null
          completed_at: string | null
          confidence_score: number | null
          contact_id: string | null
          context_quality: number | null
          created_at: string | null
          created_task_id: string | null
          deal_id: string | null
          dismissed_at: string | null
          id: string
          importance: string | null
          reasoning: string
          recommended_deadline: string | null
          status: string | null
          timestamp_seconds: number | null
          title: string
          urgency: string | null
          user_feedback: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          action_type: string
          activity_id: string
          activity_type: string
          ai_model?: string | null
          company_id?: string | null
          completed_at?: string | null
          confidence_score?: number | null
          contact_id?: string | null
          context_quality?: number | null
          created_at?: string | null
          created_task_id?: string | null
          deal_id?: string | null
          dismissed_at?: string | null
          id?: string
          importance?: string | null
          reasoning: string
          recommended_deadline?: string | null
          status?: string | null
          timestamp_seconds?: number | null
          title: string
          urgency?: string | null
          user_feedback?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          action_type?: string
          activity_id?: string
          activity_type?: string
          ai_model?: string | null
          company_id?: string | null
          completed_at?: string | null
          confidence_score?: number | null
          contact_id?: string | null
          context_quality?: number | null
          created_at?: string | null
          created_task_id?: string | null
          deal_id?: string | null
          dismissed_at?: string | null
          id?: string
          importance?: string | null
          reasoning?: string
          recommended_deadline?: string | null
          status?: string | null
          timestamp_seconds?: number | null
          title?: string
          urgency?: string | null
          user_feedback?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "next_action_suggestions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "next_action_suggestions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "next_action_suggestions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      node_executions: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          execution_id: string
          id: string
          input_data: Json | null
          node_id: string
          node_type: string
          output_data: Json | null
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          execution_id: string
          id?: string
          input_data?: Json | null
          node_id: string
          node_type: string
          output_data?: Json | null
          started_at?: string | null
          status: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          execution_id?: string
          id?: string
          input_data?: Json | null
          node_id?: string
          node_type?: string
          output_data?: Json | null
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      node_fixtures: {
        Row: {
          created_at: string | null
          data: Json
          environment: string | null
          fixture_name: string
          fixture_type: string | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          node_id: string
          updated_at: string | null
          workflow_id: string
        }
        Insert: {
          created_at?: string | null
          data?: Json
          environment?: string | null
          fixture_name: string
          fixture_type?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          node_id: string
          updated_at?: string | null
          workflow_id: string
        }
        Update: {
          created_at?: string | null
          data?: Json
          environment?: string | null
          fixture_name?: string
          fixture_type?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          node_id?: string
          updated_at?: string | null
          workflow_id?: string
        }
        Relationships: []
      }
      notetaker_user_settings: {
        Row: {
          auto_record_external: boolean | null
          auto_record_internal: boolean | null
          created_at: string | null
          id: string
          is_enabled: boolean | null
          notify_before_join: boolean | null
          notify_minutes_before: number | null
          org_id: string
          selected_calendar_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_record_external?: boolean | null
          auto_record_internal?: boolean | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          notify_before_join?: boolean | null
          notify_minutes_before?: number | null
          org_id: string
          selected_calendar_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_record_external?: boolean | null
          auto_record_internal?: boolean | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          notify_before_join?: boolean | null
          notify_minutes_before?: number | null
          org_id?: string
          selected_calendar_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notetaker_user_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_feedback: {
        Row: {
          created_at: string | null
          feedback_source: string
          feedback_type: string
          feedback_value: string
          id: string
          notification_type: string | null
          org_id: string
          triggered_by_notification_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          feedback_source: string
          feedback_type: string
          feedback_value: string
          id?: string
          notification_type?: string | null
          org_id: string
          triggered_by_notification_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          feedback_source?: string
          feedback_type?: string
          feedback_value?: string
          id?: string
          notification_type?: string | null
          org_id?: string
          triggered_by_notification_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_feedback_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_interactions: {
        Row: {
          action_taken: string | null
          clicked_at: string | null
          created_at: string | null
          day_of_week: number | null
          delivered_at: string
          delivered_via: string
          dismissed_at: string | null
          feedback_at: string | null
          feedback_rating: string | null
          hour_of_day: number | null
          id: string
          notification_id: string | null
          notification_type: string
          org_id: string
          seen_at: string | null
          slack_notification_sent_id: string | null
          time_to_interaction_seconds: number | null
          user_id: string
          user_was_active: boolean | null
        }
        Insert: {
          action_taken?: string | null
          clicked_at?: string | null
          created_at?: string | null
          day_of_week?: number | null
          delivered_at?: string
          delivered_via: string
          dismissed_at?: string | null
          feedback_at?: string | null
          feedback_rating?: string | null
          hour_of_day?: number | null
          id?: string
          notification_id?: string | null
          notification_type: string
          org_id: string
          seen_at?: string | null
          slack_notification_sent_id?: string | null
          time_to_interaction_seconds?: number | null
          user_id: string
          user_was_active?: boolean | null
        }
        Update: {
          action_taken?: string | null
          clicked_at?: string | null
          created_at?: string | null
          day_of_week?: number | null
          delivered_at?: string
          delivered_via?: string
          dismissed_at?: string | null
          feedback_at?: string | null
          feedback_rating?: string | null
          hour_of_day?: number | null
          id?: string
          notification_id?: string | null
          notification_type?: string
          org_id?: string
          seen_at?: string | null
          slack_notification_sent_id?: string | null
          time_to_interaction_seconds?: number | null
          user_id?: string
          user_was_active?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_interactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_interactions_slack_notification_sent_id_fkey"
            columns: ["slack_notification_sent_id"]
            isOneToOne: false
            referencedRelation: "slack_notifications_sent"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_queue: {
        Row: {
          attempts: number | null
          batch_id: string | null
          channel: string
          created_at: string
          dedupe_key: string | null
          dedupe_window_minutes: number | null
          error_message: string | null
          id: string
          is_batched: boolean | null
          last_attempt_at: string | null
          metadata: Json | null
          notification_interaction_id: string | null
          notification_type: string
          optimal_send_time: string | null
          optimal_time_confidence: number | null
          org_id: string
          payload: Json
          priority: string
          related_entity_id: string | null
          related_entity_type: string | null
          scheduled_for: string
          send_deadline: string | null
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          attempts?: number | null
          batch_id?: string | null
          channel: string
          created_at?: string
          dedupe_key?: string | null
          dedupe_window_minutes?: number | null
          error_message?: string | null
          id?: string
          is_batched?: boolean | null
          last_attempt_at?: string | null
          metadata?: Json | null
          notification_interaction_id?: string | null
          notification_type: string
          optimal_send_time?: string | null
          optimal_time_confidence?: number | null
          org_id: string
          payload?: Json
          priority?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          scheduled_for: string
          send_deadline?: string | null
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          attempts?: number | null
          batch_id?: string | null
          channel?: string
          created_at?: string
          dedupe_key?: string | null
          dedupe_window_minutes?: number | null
          error_message?: string | null
          id?: string
          is_batched?: boolean | null
          last_attempt_at?: string | null
          metadata?: Json | null
          notification_interaction_id?: string | null
          notification_type?: string
          optimal_send_time?: string | null
          optimal_time_confidence?: number | null
          org_id?: string
          payload?: Json
          priority?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          scheduled_for?: string
          send_deadline?: string | null
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_notification_interaction_id_fkey"
            columns: ["notification_interaction_id"]
            isOneToOne: false
            referencedRelation: "notification_interactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_queue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_rate_limits: {
        Row: {
          created_at: string
          id: string
          notification_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notification_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notification_type?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          category: string | null
          created_at: string | null
          created_by: string | null
          entity_id: string | null
          entity_type: string | null
          expires_at: string | null
          id: string
          message: string
          metadata: Json | null
          read: boolean | null
          read_at: string | null
          title: string
          type: string | null
          user_id: string
          workflow_execution_id: string | null
        }
        Insert: {
          action_url?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          expires_at?: string | null
          id?: string
          message: string
          metadata?: Json | null
          read?: boolean | null
          read_at?: string | null
          title: string
          type?: string | null
          user_id: string
          workflow_execution_id?: string | null
        }
        Update: {
          action_url?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          expires_at?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          read?: boolean | null
          read_at?: string | null
          title?: string
          type?: string | null
          user_id?: string
          workflow_execution_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      org_ai_preferences: {
        Row: {
          blocked_phrases: string[] | null
          brand_voice: string | null
          created_at: string | null
          enable_auto_send: boolean | null
          id: string
          min_confidence_for_auto: number | null
          most_edited_action_types: string[] | null
          org_approval_rate: number | null
          org_id: string
          require_manager_approval_above: number | null
          required_disclaimers: string[] | null
          tone_guidelines: string | null
          total_suggestions: number | null
          updated_at: string | null
        }
        Insert: {
          blocked_phrases?: string[] | null
          brand_voice?: string | null
          created_at?: string | null
          enable_auto_send?: boolean | null
          id?: string
          min_confidence_for_auto?: number | null
          most_edited_action_types?: string[] | null
          org_approval_rate?: number | null
          org_id: string
          require_manager_approval_above?: number | null
          required_disclaimers?: string[] | null
          tone_guidelines?: string | null
          total_suggestions?: number | null
          updated_at?: string | null
        }
        Update: {
          blocked_phrases?: string[] | null
          brand_voice?: string | null
          created_at?: string | null
          enable_auto_send?: boolean | null
          id?: string
          min_confidence_for_auto?: number | null
          most_edited_action_types?: string[] | null
          org_approval_rate?: number | null
          org_id?: string
          require_manager_approval_above?: number | null
          required_disclaimers?: string[] | null
          tone_guidelines?: string | null
          total_suggestions?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_ai_preferences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_call_types: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          enable_coaching: boolean | null
          icon: string | null
          id: string
          is_active: boolean | null
          is_system: boolean | null
          keywords: string[] | null
          name: string
          org_id: string
          updated_at: string | null
          workflow_config: Json | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          enable_coaching?: boolean | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          keywords?: string[] | null
          name: string
          org_id: string
          updated_at?: string | null
          workflow_config?: Json | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          enable_coaching?: boolean | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          keywords?: string[] | null
          name?: string
          org_id?: string
          updated_at?: string | null
          workflow_config?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "org_call_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_email_categorization_settings: {
        Row: {
          archive_non_actionable: boolean | null
          created_at: string | null
          enabled_categories: string[] | null
          id: string
          is_enabled: boolean | null
          label_mode: string
          org_id: string
          updated_at: string | null
          updated_by: string | null
          use_ai_categorization: boolean | null
          use_rules_categorization: boolean | null
        }
        Insert: {
          archive_non_actionable?: boolean | null
          created_at?: string | null
          enabled_categories?: string[] | null
          id?: string
          is_enabled?: boolean | null
          label_mode?: string
          org_id: string
          updated_at?: string | null
          updated_by?: string | null
          use_ai_categorization?: boolean | null
          use_rules_categorization?: boolean | null
        }
        Update: {
          archive_non_actionable?: boolean | null
          created_at?: string | null
          enabled_categories?: string[] | null
          id?: string
          is_enabled?: boolean | null
          label_mode?: string
          org_id?: string
          updated_at?: string | null
          updated_by?: string | null
          use_ai_categorization?: boolean | null
          use_rules_categorization?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "org_email_categorization_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_file_search_stores: {
        Row: {
          created_at: string | null
          display_name: string | null
          error_message: string | null
          id: string
          last_sync_at: string | null
          org_id: string
          status: string | null
          store_name: string
          total_files: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          org_id: string
          status?: string | null
          store_name: string
          total_files?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          org_id?: string
          status?: string | null
          store_name?: string
          total_files?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      org_proposal_workflows: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          display_order: number
          icon: string | null
          id: string
          include_email: boolean
          include_formatted: boolean
          include_goals: boolean
          include_html: boolean
          include_markdown: boolean
          include_sow: boolean
          is_active: boolean
          is_default: boolean
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          include_email?: boolean
          include_formatted?: boolean
          include_goals?: boolean
          include_html?: boolean
          include_markdown?: boolean
          include_sow?: boolean
          is_active?: boolean
          is_default?: boolean
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          include_email?: boolean
          include_formatted?: boolean
          include_goals?: boolean
          include_html?: boolean
          include_markdown?: boolean
          include_sow?: boolean
          is_active?: boolean
          is_default?: boolean
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_proposal_workflows_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_context: {
        Row: {
          confidence: number | null
          context_key: string
          created_at: string | null
          id: string
          organization_id: string
          source: string
          updated_at: string | null
          value: Json
          value_type: string
        }
        Insert: {
          confidence?: number | null
          context_key: string
          created_at?: string | null
          id?: string
          organization_id: string
          source: string
          updated_at?: string | null
          value: Json
          value_type: string
        }
        Update: {
          confidence?: number | null
          context_key?: string
          created_at?: string | null
          id?: string
          organization_id?: string
          source?: string
          updated_at?: string | null
          value?: Json
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_context_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_enrichment: {
        Row: {
          buying_signals: Json | null
          case_studies: Json | null
          company_name: string | null
          competitors: Json | null
          confidence_score: number | null
          created_at: string | null
          customer_logos: Json | null
          description: string | null
          domain: string
          employee_count: string | null
          error_message: string | null
          founded_year: number | null
          funding_stage: string | null
          generated_skills: Json | null
          headquarters: string | null
          id: string
          ideal_customer_profile: Json | null
          industry: string | null
          key_people: Json | null
          logo_url: string | null
          model: string | null
          open_roles: Json | null
          organization_id: string | null
          pain_points: Json | null
          products: Json | null
          raw_scraped_data: Json | null
          recent_hires: Json | null
          recent_news: Json | null
          reviews_summary: Json | null
          sources_used: Json | null
          status: string | null
          tagline: string | null
          target_market: string | null
          tech_stack: Json | null
          updated_at: string | null
          use_cases: Json | null
          value_propositions: Json | null
        }
        Insert: {
          buying_signals?: Json | null
          case_studies?: Json | null
          company_name?: string | null
          competitors?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          customer_logos?: Json | null
          description?: string | null
          domain: string
          employee_count?: string | null
          error_message?: string | null
          founded_year?: number | null
          funding_stage?: string | null
          generated_skills?: Json | null
          headquarters?: string | null
          id?: string
          ideal_customer_profile?: Json | null
          industry?: string | null
          key_people?: Json | null
          logo_url?: string | null
          model?: string | null
          open_roles?: Json | null
          organization_id?: string | null
          pain_points?: Json | null
          products?: Json | null
          raw_scraped_data?: Json | null
          recent_hires?: Json | null
          recent_news?: Json | null
          reviews_summary?: Json | null
          sources_used?: Json | null
          status?: string | null
          tagline?: string | null
          target_market?: string | null
          tech_stack?: Json | null
          updated_at?: string | null
          use_cases?: Json | null
          value_propositions?: Json | null
        }
        Update: {
          buying_signals?: Json | null
          case_studies?: Json | null
          company_name?: string | null
          competitors?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          customer_logos?: Json | null
          description?: string | null
          domain?: string
          employee_count?: string | null
          error_message?: string | null
          founded_year?: number | null
          funding_stage?: string | null
          generated_skills?: Json | null
          headquarters?: string | null
          id?: string
          ideal_customer_profile?: Json | null
          industry?: string | null
          key_people?: Json | null
          logo_url?: string | null
          model?: string | null
          open_roles?: Json | null
          organization_id?: string | null
          pain_points?: Json | null
          products?: Json | null
          raw_scraped_data?: Json | null
          recent_hires?: Json | null
          recent_news?: Json | null
          reviews_summary?: Json | null
          sources_used?: Json | null
          status?: string | null
          tagline?: string | null
          target_market?: string | null
          tech_stack?: Json | null
          updated_at?: string | null
          use_cases?: Json | null
          value_propositions?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_enrichment_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_feature_flags: {
        Row: {
          created_at: string | null
          enabled_at: string | null
          enabled_by: string | null
          expires_at: string | null
          feature_key: string
          id: string
          is_enabled: boolean
          org_id: string
          override_reason: string | null
          updated_at: string | null
          usage_limit: number | null
        }
        Insert: {
          created_at?: string | null
          enabled_at?: string | null
          enabled_by?: string | null
          expires_at?: string | null
          feature_key: string
          id?: string
          is_enabled?: boolean
          org_id: string
          override_reason?: string | null
          updated_at?: string | null
          usage_limit?: number | null
        }
        Update: {
          created_at?: string | null
          enabled_at?: string | null
          enabled_by?: string | null
          expires_at?: string | null
          feature_key?: string
          id?: string
          is_enabled?: boolean
          org_id?: string
          override_reason?: string | null
          updated_at?: string | null
          usage_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_feature_flags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id: string
          role?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string | null
          org_id: string
          role: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          org_id: string
          role?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          org_id?: string
          role?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_skills: {
        Row: {
          ai_generated: boolean | null
          compiled_content: string | null
          compiled_frontmatter: Json | null
          config: Json
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          is_enabled: boolean | null
          last_compiled_at: string | null
          organization_id: string | null
          platform_skill_id: string | null
          platform_skill_version: number | null
          skill_id: string
          skill_name: string
          updated_at: string | null
          user_modified: boolean | null
          user_overrides: Json | null
          version: number
        }
        Insert: {
          ai_generated?: boolean | null
          compiled_content?: string | null
          compiled_frontmatter?: Json | null
          config?: Json
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          is_enabled?: boolean | null
          last_compiled_at?: string | null
          organization_id?: string | null
          platform_skill_id?: string | null
          platform_skill_version?: number | null
          skill_id: string
          skill_name: string
          updated_at?: string | null
          user_modified?: boolean | null
          user_overrides?: Json | null
          version?: number
        }
        Update: {
          ai_generated?: boolean | null
          compiled_content?: string | null
          compiled_frontmatter?: Json | null
          config?: Json
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          is_enabled?: boolean | null
          last_compiled_at?: string | null
          organization_id?: string | null
          platform_skill_id?: string | null
          platform_skill_version?: number | null
          skill_id?: string
          skill_name?: string
          updated_at?: string | null
          user_modified?: boolean | null
          user_overrides?: Json | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_skills_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_skills_platform_skill_id_fkey"
            columns: ["platform_skill_id"]
            isOneToOne: false
            referencedRelation: "platform_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_skills_history: {
        Row: {
          change_reason: string | null
          changed_by: string | null
          config: Json
          created_at: string | null
          id: string
          organization_id: string | null
          skill_id: string
          skill_record_id: string | null
          version: number
        }
        Insert: {
          change_reason?: string | null
          changed_by?: string | null
          config: Json
          created_at?: string | null
          id?: string
          organization_id?: string | null
          skill_id: string
          skill_record_id?: string | null
          version: number
        }
        Update: {
          change_reason?: string | null
          changed_by?: string | null
          config?: Json
          created_at?: string | null
          id?: string
          organization_id?: string | null
          skill_id?: string
          skill_record_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_skills_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_skills_history_skill_record_id_fkey"
            columns: ["skill_record_id"]
            isOneToOne: false
            referencedRelation: "organization_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_subscriptions: {
        Row: {
          admin_notes: string | null
          billing_cycle: string
          cancel_at_period_end: boolean | null
          canceled_at: string | null
          cancellation_reason: string | null
          created_at: string | null
          currency: string | null
          current_period_end: string
          current_period_start: string
          current_recurring_amount_cents: number | null
          custom_max_ai_tokens: number | null
          custom_max_meetings: number | null
          custom_max_storage_mb: number | null
          custom_max_users: number | null
          customer_country: string | null
          discount_info: Json | null
          first_payment_at: string | null
          id: string
          interval_count: number | null
          last_payment_at: string | null
          org_id: string
          plan_id: string
          quantity: number | null
          recurring_interval: string | null
          started_at: string
          status: string
          stripe_customer_id: string | null
          stripe_latest_invoice_id: string | null
          stripe_payment_method_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          trial_start_at: string | null
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          billing_cycle?: string
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          cancellation_reason?: string | null
          created_at?: string | null
          currency?: string | null
          current_period_end?: string
          current_period_start?: string
          current_recurring_amount_cents?: number | null
          custom_max_ai_tokens?: number | null
          custom_max_meetings?: number | null
          custom_max_storage_mb?: number | null
          custom_max_users?: number | null
          customer_country?: string | null
          discount_info?: Json | null
          first_payment_at?: string | null
          id?: string
          interval_count?: number | null
          last_payment_at?: string | null
          org_id: string
          plan_id: string
          quantity?: number | null
          recurring_interval?: string | null
          started_at?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_latest_invoice_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          trial_start_at?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          billing_cycle?: string
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          cancellation_reason?: string | null
          created_at?: string | null
          currency?: string | null
          current_period_end?: string
          current_period_start?: string
          current_recurring_amount_cents?: number | null
          custom_max_ai_tokens?: number | null
          custom_max_meetings?: number | null
          custom_max_storage_mb?: number | null
          custom_max_users?: number | null
          customer_country?: string | null
          discount_info?: Json | null
          first_payment_at?: string | null
          id?: string
          interval_count?: number | null
          last_payment_at?: string | null
          org_id?: string
          plan_id?: string
          quantity?: number | null
          recurring_interval?: string | null
          started_at?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_latest_invoice_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          trial_start_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_usage: {
        Row: {
          active_users_count: number
          ai_tokens_used: number
          created_at: string | null
          id: string
          meetings_count: number
          meetings_duration_minutes: number
          org_id: string
          period_end: string
          period_start: string
          storage_used_mb: number
          updated_at: string | null
          usage_breakdown: Json | null
        }
        Insert: {
          active_users_count?: number
          ai_tokens_used?: number
          created_at?: string | null
          id?: string
          meetings_count?: number
          meetings_duration_minutes?: number
          org_id: string
          period_end: string
          period_start: string
          storage_used_mb?: number
          updated_at?: string | null
          usage_breakdown?: Json | null
        }
        Update: {
          active_users_count?: number
          ai_tokens_used?: number
          created_at?: string | null
          id?: string
          meetings_count?: number
          meetings_duration_minutes?: number
          org_id?: string
          period_end?: string
          period_start?: string
          storage_used_mb?: number
          updated_at?: string | null
          usage_breakdown?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_usage_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          company_bio: string | null
          company_country_code: string | null
          company_domain: string | null
          company_enriched_at: string | null
          company_enrichment_confidence: number | null
          company_enrichment_raw: Json | null
          company_enrichment_status: string
          company_industry: string | null
          company_linkedin_url: string | null
          company_size: string | null
          company_timezone: string | null
          company_website: string | null
          created_at: string | null
          created_by: string | null
          currency_code: string
          currency_locale: string
          id: string
          is_active: boolean | null
          name: string
          notification_settings: Json | null
          onboarding_completed_at: string | null
          onboarding_version: string | null
          recording_settings: Json | null
          updated_at: string | null
        }
        Insert: {
          company_bio?: string | null
          company_country_code?: string | null
          company_domain?: string | null
          company_enriched_at?: string | null
          company_enrichment_confidence?: number | null
          company_enrichment_raw?: Json | null
          company_enrichment_status?: string
          company_industry?: string | null
          company_linkedin_url?: string | null
          company_size?: string | null
          company_timezone?: string | null
          company_website?: string | null
          created_at?: string | null
          created_by?: string | null
          currency_code?: string
          currency_locale?: string
          id?: string
          is_active?: boolean | null
          name: string
          notification_settings?: Json | null
          onboarding_completed_at?: string | null
          onboarding_version?: string | null
          recording_settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          company_bio?: string | null
          company_country_code?: string | null
          company_domain?: string | null
          company_enriched_at?: string | null
          company_enrichment_confidence?: number | null
          company_enrichment_raw?: Json | null
          company_enrichment_status?: string
          company_industry?: string | null
          company_linkedin_url?: string | null
          company_size?: string | null
          company_timezone?: string | null
          company_website?: string | null
          created_at?: string | null
          created_by?: string | null
          currency_code?: string
          currency_locale?: string
          id?: string
          is_active?: boolean | null
          name?: string
          notification_settings?: Json | null
          onboarding_completed_at?: string | null
          onboarding_version?: string | null
          recording_settings?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      page_views: {
        Row: {
          browser: string | null
          created_at: string
          device_type: string | null
          fbclid: string | null
          full_url: string | null
          id: string
          landing_page: string
          referrer: string | null
          session_id: string
          utm_campaign: string | null
          utm_content: string | null
          utm_id: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_id: string | null
        }
        Insert: {
          browser?: string | null
          created_at?: string
          device_type?: string | null
          fbclid?: string | null
          full_url?: string | null
          id?: string
          landing_page: string
          referrer?: string | null
          session_id: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_id?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Update: {
          browser?: string | null
          created_at?: string
          device_type?: string | null
          fbclid?: string | null
          full_url?: string | null
          id?: string
          landing_page?: string
          referrer?: string | null
          session_id?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_id?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Relationships: []
      }
      partial_signups: {
        Row: {
          converted: boolean | null
          converted_at: string | null
          created_at: string
          email: string
          fbclid: string | null
          form_step: string | null
          id: string
          landing_page: string
          session_id: string
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_id: string | null
        }
        Insert: {
          converted?: boolean | null
          converted_at?: string | null
          created_at?: string
          email: string
          fbclid?: string | null
          form_step?: string | null
          id?: string
          landing_page: string
          session_id: string
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Update: {
          converted?: boolean | null
          converted_at?: string | null
          created_at?: string
          email?: string
          fbclid?: string | null
          form_step?: string | null
          id?: string
          landing_page?: string
          session_id?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Relationships: []
      }
      pipeline_automation_log: {
        Row: {
          action_result: Json | null
          action_type: string
          created_at: string | null
          deal_id: string | null
          error_message: string | null
          id: string
          meeting_id: string | null
          org_id: string
          rule_id: string | null
          status: string
          trigger_signal: Json | null
          trigger_type: string
        }
        Insert: {
          action_result?: Json | null
          action_type: string
          created_at?: string | null
          deal_id?: string | null
          error_message?: string | null
          id?: string
          meeting_id?: string | null
          org_id: string
          rule_id?: string | null
          status?: string
          trigger_signal?: Json | null
          trigger_type: string
        }
        Update: {
          action_result?: Json | null
          action_type?: string
          created_at?: string | null
          deal_id?: string | null
          error_message?: string | null
          id?: string
          meeting_id?: string | null
          org_id?: string
          rule_id?: string | null
          status?: string
          trigger_signal?: Json | null
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_automation_log_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_automation_log_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_automation_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_automation_log_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "pipeline_automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_automation_rules: {
        Row: {
          action_config: Json
          action_type: string
          call_type_filter: string[] | null
          cooldown_hours: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          min_confidence: number | null
          name: string
          org_id: string
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          action_config: Json
          action_type: string
          call_type_filter?: string[] | null
          cooldown_hours?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          min_confidence?: number | null
          name: string
          org_id: string
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          action_config?: Json
          action_type?: string
          call_type_filter?: string[] | null
          cooldown_hours?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          min_confidence?: number | null
          name?: string
          org_id?: string
          trigger_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_automation_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stage_recommendations: {
        Row: {
          auto_apply_enabled: boolean | null
          auto_apply_threshold: number | null
          company_id: string | null
          confidence_score: number | null
          contact_id: string | null
          created_at: string | null
          current_stage: string
          deal_id: string | null
          expires_at: string | null
          id: string
          key_signals: string[] | null
          meeting_id: string
          meeting_sentiment_score: number | null
          meeting_summary: string | null
          metadata: Json | null
          recommendation_reason: string | null
          recommended_stage: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          auto_apply_enabled?: boolean | null
          auto_apply_threshold?: number | null
          company_id?: string | null
          confidence_score?: number | null
          contact_id?: string | null
          created_at?: string | null
          current_stage: string
          deal_id?: string | null
          expires_at?: string | null
          id?: string
          key_signals?: string[] | null
          meeting_id: string
          meeting_sentiment_score?: number | null
          meeting_summary?: string | null
          metadata?: Json | null
          recommendation_reason?: string | null
          recommended_stage: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          auto_apply_enabled?: boolean | null
          auto_apply_threshold?: number | null
          company_id?: string | null
          confidence_score?: number | null
          contact_id?: string | null
          created_at?: string | null
          current_stage?: string
          deal_id?: string | null
          expires_at?: string | null
          id?: string
          key_signals?: string[] | null
          meeting_id?: string
          meeting_sentiment_score?: number | null
          meeting_summary?: string | null
          metadata?: Json | null
          recommendation_reason?: string | null
          recommended_stage?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stage_recommendations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stage_recommendations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stage_recommendations_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stage_recommendations_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_skills: {
        Row: {
          category: string
          content_template: string
          created_at: string | null
          created_by: string | null
          frontmatter: Json
          id: string
          is_active: boolean | null
          skill_key: string
          updated_at: string | null
          version: number
        }
        Insert: {
          category: string
          content_template: string
          created_at?: string | null
          created_by?: string | null
          frontmatter?: Json
          id?: string
          is_active?: boolean | null
          skill_key: string
          updated_at?: string | null
          version?: number
        }
        Update: {
          category?: string
          content_template?: string
          created_at?: string | null
          created_by?: string | null
          frontmatter?: Json
          id?: string
          is_active?: boolean | null
          skill_key?: string
          updated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "platform_skills_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "platform_skills_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "platform_skills_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "platform_skills_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_skills_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      platform_skills_history: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          content_template: string
          frontmatter: Json
          id: string
          skill_id: string | null
          version: number
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          content_template: string
          frontmatter: Json
          id?: string
          skill_id?: string | null
          version: number
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          content_template?: string
          frontmatter?: Json
          id?: string
          skill_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "platform_skills_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "platform_skills_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "platform_skills_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "platform_skills_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_skills_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "platform_skills_history_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "platform_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_plans: {
        Row: {
          created_at: string | null
          description: string | null
          features: string[] | null
          id: string
          interval: string | null
          is_active: boolean | null
          is_popular: boolean | null
          name: string
          order_index: number | null
          price: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          features?: string[] | null
          id?: string
          interval?: string | null
          is_active?: boolean | null
          is_popular?: boolean | null
          name: string
          order_index?: number | null
          price?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          features?: string[] | null
          id?: string
          interval?: string | null
          is_active?: boolean | null
          is_popular?: boolean | null
          name?: string
          order_index?: number | null
          price?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      process_map_coverage_snapshots: {
        Row: {
          branch_coverage_percent: number
          branch_path_scenarios: number | null
          calculated_at: string
          covered_branches: number
          covered_paths: number
          created_at: string
          failure_mode_coverage: Json | null
          failure_mode_scenarios: number | null
          happy_path_scenarios: number | null
          id: string
          integrations_with_full_coverage: string[] | null
          integrations_with_partial_coverage: string[] | null
          org_id: string
          overall_score: number
          path_coverage_percent: number
          process_map_id: string | null
          process_structure_hash: string | null
          total_branches: number
          total_paths: number
          total_scenarios: number
          uncovered_paths: Json | null
          version: number | null
          workflow_id: string | null
        }
        Insert: {
          branch_coverage_percent?: number
          branch_path_scenarios?: number | null
          calculated_at?: string
          covered_branches?: number
          covered_paths?: number
          created_at?: string
          failure_mode_coverage?: Json | null
          failure_mode_scenarios?: number | null
          happy_path_scenarios?: number | null
          id?: string
          integrations_with_full_coverage?: string[] | null
          integrations_with_partial_coverage?: string[] | null
          org_id: string
          overall_score?: number
          path_coverage_percent?: number
          process_map_id?: string | null
          process_structure_hash?: string | null
          total_branches?: number
          total_paths?: number
          total_scenarios?: number
          uncovered_paths?: Json | null
          version?: number | null
          workflow_id?: string | null
        }
        Update: {
          branch_coverage_percent?: number
          branch_path_scenarios?: number | null
          calculated_at?: string
          covered_branches?: number
          covered_paths?: number
          created_at?: string
          failure_mode_coverage?: Json | null
          failure_mode_scenarios?: number | null
          happy_path_scenarios?: number | null
          id?: string
          integrations_with_full_coverage?: string[] | null
          integrations_with_partial_coverage?: string[] | null
          org_id?: string
          overall_score?: number
          path_coverage_percent?: number
          process_map_id?: string | null
          process_structure_hash?: string | null
          total_branches?: number
          total_paths?: number
          total_scenarios?: number
          uncovered_paths?: Json | null
          version?: number | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_map_coverage_snapshots_process_map_id_fkey"
            columns: ["process_map_id"]
            isOneToOne: false
            referencedRelation: "process_maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_map_coverage_snapshots_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "process_map_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      process_map_fixtures: {
        Row: {
          created_at: string
          data: Json
          description: string | null
          fixture_type: string
          id: string
          is_default: boolean | null
          name: string
          org_id: string
          tags: string[] | null
          target_integration: string | null
          target_step_id: string | null
          updated_at: string
          workflow_id: string | null
        }
        Insert: {
          created_at?: string
          data: Json
          description?: string | null
          fixture_type: string
          id?: string
          is_default?: boolean | null
          name: string
          org_id: string
          tags?: string[] | null
          target_integration?: string | null
          target_step_id?: string | null
          updated_at?: string
          workflow_id?: string | null
        }
        Update: {
          created_at?: string
          data?: Json
          description?: string | null
          fixture_type?: string
          id?: string
          is_default?: boolean | null
          name?: string
          org_id?: string
          tags?: string[] | null
          target_integration?: string | null
          target_step_id?: string | null
          updated_at?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_map_fixtures_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "process_map_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      process_map_mocks: {
        Row: {
          created_at: string
          delay_ms: number | null
          endpoint: string | null
          error_response: Json | null
          id: string
          integration: string
          is_active: boolean | null
          match_conditions: Json | null
          mock_type: string
          org_id: string
          priority: number | null
          response_data: Json | null
          updated_at: string
          workflow_id: string | null
        }
        Insert: {
          created_at?: string
          delay_ms?: number | null
          endpoint?: string | null
          error_response?: Json | null
          id?: string
          integration: string
          is_active?: boolean | null
          match_conditions?: Json | null
          mock_type?: string
          org_id: string
          priority?: number | null
          response_data?: Json | null
          updated_at?: string
          workflow_id?: string | null
        }
        Update: {
          created_at?: string
          delay_ms?: number | null
          endpoint?: string | null
          error_response?: Json | null
          id?: string
          integration?: string
          is_active?: boolean | null
          match_conditions?: Json | null
          mock_type?: string
          org_id?: string
          priority?: number | null
          response_data?: Json | null
          updated_at?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_map_mocks_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "process_map_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      process_map_scenario_runs: {
        Row: {
          duration_ms: number | null
          error_message: string | null
          executed_at: string
          failure_step_id: string | null
          failure_type: string | null
          id: string
          matched_expectation: boolean
          mismatch_details: string | null
          result: string
          scenario_id: string
          steps_executed: number | null
          steps_failed: number | null
          steps_passed: number | null
          test_run_id: string
        }
        Insert: {
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string
          failure_step_id?: string | null
          failure_type?: string | null
          id?: string
          matched_expectation?: boolean
          mismatch_details?: string | null
          result: string
          scenario_id: string
          steps_executed?: number | null
          steps_failed?: number | null
          steps_passed?: number | null
          test_run_id: string
        }
        Update: {
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string
          failure_step_id?: string | null
          failure_type?: string | null
          id?: string
          matched_expectation?: boolean
          mismatch_details?: string | null
          result?: string
          scenario_id?: string
          steps_executed?: number | null
          steps_failed?: number | null
          steps_passed?: number | null
          test_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_map_scenario_runs_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "process_map_test_scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_map_scenario_runs_test_run_id_fkey"
            columns: ["test_run_id"]
            isOneToOne: false
            referencedRelation: "process_map_test_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      process_map_step_results: {
        Row: {
          completed_at: string | null
          duration_ms: number | null
          error_details: Json | null
          error_message: string | null
          error_stack: string | null
          expected_output: Json | null
          id: string
          input_data: Json | null
          logs: Json | null
          mock_source: string | null
          output_data: Json | null
          sequence_number: number
          started_at: string | null
          status: string
          step_id: string
          step_name: string
          test_run_id: string
          validation_results: Json | null
          was_mocked: boolean | null
        }
        Insert: {
          completed_at?: string | null
          duration_ms?: number | null
          error_details?: Json | null
          error_message?: string | null
          error_stack?: string | null
          expected_output?: Json | null
          id?: string
          input_data?: Json | null
          logs?: Json | null
          mock_source?: string | null
          output_data?: Json | null
          sequence_number: number
          started_at?: string | null
          status?: string
          step_id: string
          step_name: string
          test_run_id: string
          validation_results?: Json | null
          was_mocked?: boolean | null
        }
        Update: {
          completed_at?: string | null
          duration_ms?: number | null
          error_details?: Json | null
          error_message?: string | null
          error_stack?: string | null
          expected_output?: Json | null
          id?: string
          input_data?: Json | null
          logs?: Json | null
          mock_source?: string | null
          output_data?: Json | null
          sequence_number?: number
          started_at?: string | null
          status?: string
          step_id?: string
          step_name?: string
          test_run_id?: string
          validation_results?: Json | null
          was_mocked?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "process_map_step_results_test_run_id_fkey"
            columns: ["test_run_id"]
            isOneToOne: false
            referencedRelation: "process_map_test_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      process_map_test_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_details: Json | null
          error_message: string | null
          id: string
          org_id: string
          overall_result: string | null
          run_by: string | null
          run_config: Json | null
          run_mode: string
          started_at: string | null
          status: string
          steps_failed: number | null
          steps_passed: number | null
          steps_skipped: number | null
          steps_total: number | null
          test_data: Json | null
          workflow_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          org_id: string
          overall_result?: string | null
          run_by?: string | null
          run_config?: Json | null
          run_mode: string
          started_at?: string | null
          status?: string
          steps_failed?: number | null
          steps_passed?: number | null
          steps_skipped?: number | null
          steps_total?: number | null
          test_data?: Json | null
          workflow_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          org_id?: string
          overall_result?: string | null
          run_by?: string | null
          run_config?: Json | null
          run_mode?: string
          started_at?: string | null
          status?: string
          steps_failed?: number | null
          steps_passed?: number | null
          steps_skipped?: number | null
          steps_total?: number | null
          test_data?: Json | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_map_test_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "process_map_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      process_map_test_scenarios: {
        Row: {
          created_at: string
          description: string | null
          expected_failure_step: string | null
          expected_failure_type: string | null
          expected_result: string
          generated_at: string
          id: string
          last_run_result: Json | null
          mock_overrides: Json | null
          name: string
          org_id: string
          path: Json
          priority: number | null
          process_map_id: string | null
          process_structure_hash: string | null
          scenario_type: string
          tags: string[] | null
          updated_at: string
          version: number | null
          workflow_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          expected_failure_step?: string | null
          expected_failure_type?: string | null
          expected_result: string
          generated_at?: string
          id?: string
          last_run_result?: Json | null
          mock_overrides?: Json | null
          name: string
          org_id: string
          path: Json
          priority?: number | null
          process_map_id?: string | null
          process_structure_hash?: string | null
          scenario_type: string
          tags?: string[] | null
          updated_at?: string
          version?: number | null
          workflow_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          expected_failure_step?: string | null
          expected_failure_type?: string | null
          expected_result?: string
          generated_at?: string
          id?: string
          last_run_result?: Json | null
          mock_overrides?: Json | null
          name?: string
          org_id?: string
          path?: Json
          priority?: number | null
          process_map_id?: string | null
          process_structure_hash?: string | null
          scenario_type?: string
          tags?: string[] | null
          updated_at?: string
          version?: number | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_map_test_scenarios_process_map_id_fkey"
            columns: ["process_map_id"]
            isOneToOne: false
            referencedRelation: "process_maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_map_test_scenarios_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "process_map_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      process_map_workflows: {
        Row: {
          connections: Json
          created_at: string
          id: string
          is_active: boolean | null
          mock_config: Json | null
          org_id: string
          parsed_at: string | null
          process_map_id: string | null
          steps: Json
          test_config: Json | null
          updated_at: string
          version: number | null
        }
        Insert: {
          connections?: Json
          created_at?: string
          id?: string
          is_active?: boolean | null
          mock_config?: Json | null
          org_id: string
          parsed_at?: string | null
          process_map_id?: string | null
          steps?: Json
          test_config?: Json | null
          updated_at?: string
          version?: number | null
        }
        Update: {
          connections?: Json
          created_at?: string
          id?: string
          is_active?: boolean | null
          mock_config?: Json | null
          org_id?: string
          parsed_at?: string | null
          process_map_id?: string | null
          steps?: Json
          test_config?: Json | null
          updated_at?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "process_map_workflows_process_map_id_fkey"
            columns: ["process_map_id"]
            isOneToOne: false
            referencedRelation: "process_maps"
            referencedColumns: ["id"]
          },
        ]
      }
      process_maps: {
        Row: {
          created_at: string
          description: string | null
          description_long: string | null
          generated_by: string | null
          generation_status: string | null
          id: string
          mermaid_code: string
          mermaid_code_horizontal: string | null
          mermaid_code_vertical: string | null
          org_id: string
          process_name: string
          process_structure: Json | null
          process_type: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          description_long?: string | null
          generated_by?: string | null
          generation_status?: string | null
          id?: string
          mermaid_code: string
          mermaid_code_horizontal?: string | null
          mermaid_code_vertical?: string | null
          org_id: string
          process_name: string
          process_structure?: Json | null
          process_type: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          description_long?: string | null
          generated_by?: string | null
          generation_status?: string | null
          id?: string
          mermaid_code?: string
          mermaid_code_horizontal?: string | null
          mermaid_code_vertical?: string | null
          org_id?: string
          process_name?: string
          process_structure?: Json | null
          process_type?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auth_provider: string | null
          avatar_url: string | null
          bio: string | null
          clerk_user_id: string | null
          created_at: string | null
          email: string
          first_name: string | null
          id: string
          is_admin: boolean | null
          last_login_at: string | null
          last_name: string | null
          stage: string | null
          timezone: string | null
          updated_at: string | null
          week_starts_on: number | null
          working_hours_end: number | null
          working_hours_start: number | null
        }
        Insert: {
          auth_provider?: string | null
          avatar_url?: string | null
          bio?: string | null
          clerk_user_id?: string | null
          created_at?: string | null
          email: string
          first_name?: string | null
          id: string
          is_admin?: boolean | null
          last_login_at?: string | null
          last_name?: string | null
          stage?: string | null
          timezone?: string | null
          updated_at?: string | null
          week_starts_on?: number | null
          working_hours_end?: number | null
          working_hours_start?: number | null
        }
        Update: {
          auth_provider?: string | null
          avatar_url?: string | null
          bio?: string | null
          clerk_user_id?: string | null
          created_at?: string | null
          email?: string
          first_name?: string | null
          id?: string
          is_admin?: boolean | null
          last_login_at?: string | null
          last_name?: string | null
          stage?: string | null
          timezone?: string | null
          updated_at?: string | null
          week_starts_on?: number | null
          working_hours_end?: number | null
          working_hours_start?: number | null
        }
        Relationships: []
      }
      proposal_jobs: {
        Row: {
          action: string
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          input_data: Json
          max_retries: number | null
          output_content: string | null
          output_usage: Json | null
          retry_count: number | null
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          action: string
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          input_data: Json
          max_retries?: number | null
          output_content?: string | null
          output_usage?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          action?: string
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          input_data?: Json
          max_retries?: number | null
          output_content?: string | null
          output_usage?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      proposal_templates: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_default: boolean | null
          name: string
          type: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          type: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          type?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      proposals: {
        Row: {
          contact_id: string | null
          content: string
          created_at: string | null
          id: string
          is_public: boolean | null
          last_viewed_at: string | null
          meeting_id: string | null
          password_hash: string | null
          share_token: string | null
          share_views: number | null
          status: string | null
          title: string | null
          type: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          contact_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          last_viewed_at?: string | null
          meeting_id?: string | null
          password_hash?: string | null
          share_token?: string | null
          share_views?: number | null
          status?: string | null
          title?: string | null
          type: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          contact_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          last_viewed_at?: string | null
          meeting_id?: string | null
          password_hash?: string | null
          share_token?: string | null
          share_views?: number | null
          status?: string | null
          title?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit: {
        Row: {
          created_at: string | null
          endpoint: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          endpoint: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          endpoint?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      recording_rules: {
        Row: {
          created_at: string | null
          domain_mode: string | null
          id: string
          internal_domain: string | null
          is_active: boolean | null
          max_attendee_count: number | null
          min_attendee_count: number | null
          name: string
          org_id: string
          priority: number | null
          specific_domains: string[] | null
          title_keywords: string[] | null
          title_keywords_exclude: string[] | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          domain_mode?: string | null
          id?: string
          internal_domain?: string | null
          is_active?: boolean | null
          max_attendee_count?: number | null
          min_attendee_count?: number | null
          name: string
          org_id: string
          priority?: number | null
          specific_domains?: string[] | null
          title_keywords?: string[] | null
          title_keywords_exclude?: string[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          domain_mode?: string | null
          id?: string
          internal_domain?: string | null
          is_active?: boolean | null
          max_attendee_count?: number | null
          min_attendee_count?: number | null
          name?: string
          org_id?: string
          priority?: number | null
          specific_domains?: string[] | null
          title_keywords?: string[] | null
          title_keywords_exclude?: string[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recording_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      recording_usage: {
        Row: {
          created_at: string | null
          id: string
          org_id: string
          period_end: string
          period_start: string
          recordings_count: number | null
          recordings_limit: number | null
          storage_used_bytes: number | null
          total_duration_seconds: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          org_id: string
          period_end: string
          period_start: string
          recordings_count?: number | null
          recordings_limit?: number | null
          storage_used_bytes?: number | null
          total_duration_seconds?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          org_id?: string
          period_end?: string
          period_start?: string
          recordings_count?: number | null
          recordings_limit?: number | null
          storage_used_bytes?: number | null
          total_duration_seconds?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recording_usage_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      recordings: {
        Row: {
          action_items: Json | null
          bot_id: string | null
          calendar_event_id: string | null
          coach_rating: number | null
          coach_summary: string | null
          created_at: string | null
          crm_activity_id: string | null
          crm_contacts: Json | null
          crm_deal_id: string | null
          crm_synced: boolean | null
          error_message: string | null
          highlights: Json | null
          hitl_data: Json | null
          hitl_required: boolean | null
          hitl_resolved_at: string | null
          hitl_resolved_by: string | null
          hitl_type: string | null
          hubspot_engagement_id: string | null
          id: string
          meeting_id: string | null
          meeting_duration_seconds: number | null
          meeting_end_time: string | null
          meeting_platform: string
          meeting_start_time: string | null
          meeting_title: string | null
          meeting_url: string
          meetingbaas_recording_id: string | null
          org_id: string
          recording_s3_key: string | null
          recording_s3_url: string | null
          sentiment_score: number | null
          speaker_identification_method: string | null
          speakers: Json | null
          status: string | null
          summary: string | null
          talk_time_customer_pct: number | null
          talk_time_judgement: string | null
          talk_time_rep_pct: number | null
          thumbnail_s3_key: string | null
          thumbnail_url: string | null
          transcript_json: Json | null
          transcript_s3_key: string | null
          transcript_text: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          action_items?: Json | null
          bot_id?: string | null
          calendar_event_id?: string | null
          coach_rating?: number | null
          coach_summary?: string | null
          created_at?: string | null
          crm_activity_id?: string | null
          crm_contacts?: Json | null
          crm_deal_id?: string | null
          crm_synced?: boolean | null
          error_message?: string | null
          highlights?: Json | null
          hitl_data?: Json | null
          hitl_required?: boolean | null
          hitl_resolved_at?: string | null
          hitl_resolved_by?: string | null
          hitl_type?: string | null
          hubspot_engagement_id?: string | null
          id?: string
          meeting_id?: string | null
          meeting_duration_seconds?: number | null
          meeting_end_time?: string | null
          meeting_platform: string
          meeting_start_time?: string | null
          meeting_title?: string | null
          meeting_url: string
          meetingbaas_recording_id?: string | null
          org_id: string
          recording_s3_key?: string | null
          recording_s3_url?: string | null
          sentiment_score?: number | null
          speaker_identification_method?: string | null
          speakers?: Json | null
          status?: string | null
          summary?: string | null
          talk_time_customer_pct?: number | null
          talk_time_judgement?: string | null
          talk_time_rep_pct?: number | null
          thumbnail_s3_key?: string | null
          thumbnail_url?: string | null
          transcript_json?: Json | null
          transcript_s3_key?: string | null
          transcript_text?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          action_items?: Json | null
          bot_id?: string | null
          calendar_event_id?: string | null
          coach_rating?: number | null
          coach_summary?: string | null
          created_at?: string | null
          crm_activity_id?: string | null
          crm_contacts?: Json | null
          crm_deal_id?: string | null
          crm_synced?: boolean | null
          error_message?: string | null
          highlights?: Json | null
          hitl_data?: Json | null
          hitl_required?: boolean | null
          hitl_resolved_at?: string | null
          hitl_resolved_by?: string | null
          hitl_type?: string | null
          hubspot_engagement_id?: string | null
          id?: string
          meeting_id?: string | null
          meeting_duration_seconds?: number | null
          meeting_end_time?: string | null
          meeting_platform?: string
          meeting_start_time?: string | null
          meeting_title?: string | null
          meeting_url?: string
          meetingbaas_recording_id?: string | null
          org_id?: string
          recording_s3_key?: string | null
          recording_s3_url?: string | null
          sentiment_score?: number | null
          speaker_identification_method?: string | null
          speakers?: Json | null
          status?: string | null
          summary?: string | null
          talk_time_customer_pct?: number | null
          talk_time_judgement?: string | null
          talk_time_rep_pct?: number | null
          thumbnail_s3_key?: string | null
          thumbnail_url?: string | null
          transcript_json?: Json | null
          transcript_s3_key?: string | null
          transcript_text?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recordings_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recordings_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events_with_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recordings_crm_activity_id_fkey"
            columns: ["crm_activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recordings_crm_activity_id_fkey"
            columns: ["crm_activity_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recordings_crm_deal_id_fkey"
            columns: ["crm_deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recordings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reengagement_log: {
        Row: {
          action_taken: string | null
          channel: string
          clicked_at: string | null
          created_at: string | null
          delivered: boolean | null
          delivered_at: string | null
          id: string
          new_segment_after: string | null
          opened_at: string | null
          org_id: string
          outcome: string | null
          reengagement_type: string
          returned_at: string | null
          returned_to_app: boolean | null
          segment_at_send: string
          sent_at: string | null
          trigger_context: Json | null
          trigger_entity_id: string | null
          trigger_entity_type: string | null
          trigger_type: string | null
          user_id: string
        }
        Insert: {
          action_taken?: string | null
          channel: string
          clicked_at?: string | null
          created_at?: string | null
          delivered?: boolean | null
          delivered_at?: string | null
          id?: string
          new_segment_after?: string | null
          opened_at?: string | null
          org_id: string
          outcome?: string | null
          reengagement_type: string
          returned_at?: string | null
          returned_to_app?: boolean | null
          segment_at_send: string
          sent_at?: string | null
          trigger_context?: Json | null
          trigger_entity_id?: string | null
          trigger_entity_type?: string | null
          trigger_type?: string | null
          user_id: string
        }
        Update: {
          action_taken?: string | null
          channel?: string
          clicked_at?: string | null
          created_at?: string | null
          delivered?: boolean | null
          delivered_at?: string | null
          id?: string
          new_segment_after?: string | null
          opened_at?: string | null
          org_id?: string
          outcome?: string | null
          reengagement_type?: string
          returned_at?: string | null
          returned_to_app?: boolean | null
          segment_at_send?: string
          sent_at?: string | null
          trigger_context?: Json | null
          trigger_entity_id?: string | null
          trigger_entity_type?: string | null
          trigger_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reengagement_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      relationship_health_history: {
        Row: {
          changes_from_previous: Json | null
          communication_frequency_score: number | null
          created_at: string | null
          engagement_quality_score: number | null
          ghost_probability_percent: number | null
          health_status: string
          id: string
          is_ghost_risk: boolean | null
          meeting_pattern_score: number | null
          overall_health_score: number
          relationship_health_id: string
          response_behavior_score: number | null
          sentiment_score: number | null
          snapshot_at: string
          snapshot_reason: string | null
          user_id: string
        }
        Insert: {
          changes_from_previous?: Json | null
          communication_frequency_score?: number | null
          created_at?: string | null
          engagement_quality_score?: number | null
          ghost_probability_percent?: number | null
          health_status: string
          id?: string
          is_ghost_risk?: boolean | null
          meeting_pattern_score?: number | null
          overall_health_score: number
          relationship_health_id: string
          response_behavior_score?: number | null
          sentiment_score?: number | null
          snapshot_at?: string
          snapshot_reason?: string | null
          user_id: string
        }
        Update: {
          changes_from_previous?: Json | null
          communication_frequency_score?: number | null
          created_at?: string | null
          engagement_quality_score?: number | null
          ghost_probability_percent?: number | null
          health_status?: string
          id?: string
          is_ghost_risk?: boolean | null
          meeting_pattern_score?: number | null
          overall_health_score?: number
          relationship_health_id?: string
          response_behavior_score?: number | null
          sentiment_score?: number | null
          snapshot_at?: string
          snapshot_reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationship_health_history_relationship_health_id_fkey"
            columns: ["relationship_health_id"]
            isOneToOne: false
            referencedRelation: "relationship_health_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      relationship_health_scores: {
        Row: {
          at_risk_deal_value: number | null
          avg_response_time_hours: number | null
          avg_sentiment_last_3_interactions: number | null
          baseline_contact_frequency_days: number | null
          baseline_meeting_frequency_days: number | null
          baseline_response_time_hours: number | null
          communication_frequency_score: number | null
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          days_since_last_contact: number | null
          days_since_last_response: number | null
          days_until_predicted_ghost: number | null
          email_count_30_days: number | null
          email_open_rate_percent: number | null
          engagement_quality_score: number | null
          ghost_probability_percent: number | null
          ghost_signals: Json | null
          health_status: string
          id: string
          is_ghost_risk: boolean | null
          last_calculated_at: string | null
          last_meaningful_interaction: Json | null
          meeting_count_30_days: number | null
          meeting_pattern_score: number | null
          overall_health_score: number
          related_deals_count: number | null
          relationship_type: string
          response_behavior_score: number | null
          response_rate_percent: number | null
          risk_factors: string[] | null
          risk_level: string
          sentiment_score: number | null
          sentiment_trend: string | null
          total_deal_value: number | null
          total_interactions_30_days: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          at_risk_deal_value?: number | null
          avg_response_time_hours?: number | null
          avg_sentiment_last_3_interactions?: number | null
          baseline_contact_frequency_days?: number | null
          baseline_meeting_frequency_days?: number | null
          baseline_response_time_hours?: number | null
          communication_frequency_score?: number | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          days_since_last_contact?: number | null
          days_since_last_response?: number | null
          days_until_predicted_ghost?: number | null
          email_count_30_days?: number | null
          email_open_rate_percent?: number | null
          engagement_quality_score?: number | null
          ghost_probability_percent?: number | null
          ghost_signals?: Json | null
          health_status: string
          id?: string
          is_ghost_risk?: boolean | null
          last_calculated_at?: string | null
          last_meaningful_interaction?: Json | null
          meeting_count_30_days?: number | null
          meeting_pattern_score?: number | null
          overall_health_score: number
          related_deals_count?: number | null
          relationship_type: string
          response_behavior_score?: number | null
          response_rate_percent?: number | null
          risk_factors?: string[] | null
          risk_level: string
          sentiment_score?: number | null
          sentiment_trend?: string | null
          total_deal_value?: number | null
          total_interactions_30_days?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          at_risk_deal_value?: number | null
          avg_response_time_hours?: number | null
          avg_sentiment_last_3_interactions?: number | null
          baseline_contact_frequency_days?: number | null
          baseline_meeting_frequency_days?: number | null
          baseline_response_time_hours?: number | null
          communication_frequency_score?: number | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          days_since_last_contact?: number | null
          days_since_last_response?: number | null
          days_until_predicted_ghost?: number | null
          email_count_30_days?: number | null
          email_open_rate_percent?: number | null
          engagement_quality_score?: number | null
          ghost_probability_percent?: number | null
          ghost_signals?: Json | null
          health_status?: string
          id?: string
          is_ghost_risk?: boolean | null
          last_calculated_at?: string | null
          last_meaningful_interaction?: Json | null
          meeting_count_30_days?: number | null
          meeting_pattern_score?: number | null
          overall_health_score?: number
          related_deals_count?: number | null
          relationship_type?: string
          response_behavior_score?: number | null
          response_rate_percent?: number | null
          risk_factors?: string[] | null
          risk_level?: string
          sentiment_score?: number | null
          sentiment_trend?: string | null
          total_deal_value?: number | null
          total_interactions_30_days?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationship_health_scores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_health_scores_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_comments: {
        Row: {
          comment: string
          created_at: string | null
          id: string
          is_admin_comment: boolean | null
          suggestion_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          comment: string
          created_at?: string | null
          id?: string
          is_admin_comment?: boolean | null
          suggestion_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          comment?: string
          created_at?: string | null
          id?: string
          is_admin_comment?: boolean | null
          suggestion_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_comments_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "roadmap_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_suggestions: {
        Row: {
          admin_notes: string | null
          assigned_to: string | null
          completion_date: string | null
          created_at: string | null
          description: string
          estimated_effort: string | null
          hub_last_sync_at: string | null
          hub_sync_error: string | null
          hub_sync_status: string | null
          hub_task_code: string | null
          hub_task_id: string | null
          id: string
          priority: string
          status: string
          submitted_at: string | null
          submitted_by: string
          target_version: string | null
          ticket_id: number
          title: string
          type: string
          updated_at: string | null
          votes_count: number | null
        }
        Insert: {
          admin_notes?: string | null
          assigned_to?: string | null
          completion_date?: string | null
          created_at?: string | null
          description: string
          estimated_effort?: string | null
          hub_last_sync_at?: string | null
          hub_sync_error?: string | null
          hub_sync_status?: string | null
          hub_task_code?: string | null
          hub_task_id?: string | null
          id?: string
          priority?: string
          status?: string
          submitted_at?: string | null
          submitted_by: string
          target_version?: string | null
          ticket_id?: number
          title: string
          type: string
          updated_at?: string | null
          votes_count?: number | null
        }
        Update: {
          admin_notes?: string | null
          assigned_to?: string | null
          completion_date?: string | null
          created_at?: string | null
          description?: string
          estimated_effort?: string | null
          hub_last_sync_at?: string | null
          hub_sync_error?: string | null
          hub_sync_status?: string | null
          hub_task_code?: string | null
          hub_task_id?: string | null
          id?: string
          priority?: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string
          target_version?: string | null
          ticket_id?: number
          title?: string
          type?: string
          updated_at?: string | null
          votes_count?: number | null
        }
        Relationships: []
      }
      roadmap_votes: {
        Row: {
          created_at: string | null
          id: string
          suggestion_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          suggestion_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          suggestion_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_votes_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "roadmap_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      savvycal_integration_secrets: {
        Row: {
          api_private_key: string | null
          api_public_key: string | null
          api_token: string | null
          created_at: string | null
          integration_id: string
          org_id: string
          updated_at: string | null
          webhook_secret: string | null
        }
        Insert: {
          api_private_key?: string | null
          api_public_key?: string | null
          api_token?: string | null
          created_at?: string | null
          integration_id: string
          org_id: string
          updated_at?: string | null
          webhook_secret?: string | null
        }
        Update: {
          api_private_key?: string | null
          api_public_key?: string | null
          api_token?: string | null
          created_at?: string | null
          integration_id?: string
          org_id?: string
          updated_at?: string | null
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "savvycal_integration_secrets_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: true
            referencedRelation: "savvycal_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savvycal_integration_secrets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savvycal_integration_secrets_org_matches_parent"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      savvycal_integrations: {
        Row: {
          connected_by_user_id: string | null
          created_at: string | null
          id: string
          is_active: boolean
          last_sync_at: string | null
          org_id: string
          updated_at: string | null
          webhook_configured_at: string | null
          webhook_last_event_id: string | null
          webhook_last_received_at: string | null
          webhook_token: string
        }
        Insert: {
          connected_by_user_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          org_id: string
          updated_at?: string | null
          webhook_configured_at?: string | null
          webhook_last_event_id?: string | null
          webhook_last_received_at?: string | null
          webhook_token: string
        }
        Update: {
          connected_by_user_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          org_id?: string
          updated_at?: string | null
          webhook_configured_at?: string | null
          webhook_last_event_id?: string | null
          webhook_last_received_at?: string | null
          webhook_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "savvycal_integrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      savvycal_link_mappings: {
        Row: {
          channel: string
          created_at: string | null
          default_owner_email: string | null
          description: string | null
          id: string
          is_active: boolean | null
          link_id: string
          medium: string | null
          source_name: string
          updated_at: string | null
        }
        Insert: {
          channel?: string
          created_at?: string | null
          default_owner_email?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          link_id: string
          medium?: string | null
          source_name: string
          updated_at?: string | null
        }
        Update: {
          channel?: string
          created_at?: string | null
          default_owner_email?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          link_id?: string
          medium?: string | null
          source_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      savvycal_source_mappings: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          link_id: string
          meeting_link: string | null
          notes: string | null
          org_id: string | null
          private_link: string | null
          source: string
          source_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          link_id: string
          meeting_link?: string | null
          notes?: string | null
          org_id?: string | null
          private_link?: string | null
          source: string
          source_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          link_id?: string
          meeting_link?: string | null
          notes?: string | null
          org_id?: string | null
          private_link?: string | null
          source?: string
          source_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "savvycal_source_mappings_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "booking_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_fixtures: {
        Row: {
          created_at: string | null
          description: string | null
          difficulty: string | null
          expected_outputs: Json | null
          id: string
          is_baseline: boolean | null
          node_fixtures: Json | null
          scenario_name: string
          tags: string[] | null
          trigger_data: Json | null
          updated_at: string | null
          validation_rules: Json | null
          workflow_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          difficulty?: string | null
          expected_outputs?: Json | null
          id?: string
          is_baseline?: boolean | null
          node_fixtures?: Json | null
          scenario_name: string
          tags?: string[] | null
          trigger_data?: Json | null
          updated_at?: string | null
          validation_rules?: Json | null
          workflow_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          difficulty?: string | null
          expected_outputs?: Json | null
          id?: string
          is_baseline?: boolean | null
          node_fixtures?: Json | null
          scenario_name?: string
          tags?: string[] | null
          trigger_data?: Json | null
          updated_at?: string | null
          validation_rules?: Json | null
          workflow_id?: string
        }
        Relationships: []
      }
      sentiment_alerts: {
        Row: {
          alert_type: string
          contact_id: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          meeting_id: string | null
          message: string
          sentiment_score: number | null
          severity: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          alert_type: string
          contact_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          meeting_id?: string | null
          message: string
          sentiment_score?: number | null
          severity: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          alert_type?: string
          contact_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          meeting_id?: string | null
          message?: string
          sentiment_score?: number | null
          severity?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sentiment_alerts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sentiment_alerts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      sentry_bridge_config: {
        Row: {
          created_at: string
          default_dev_hub_project_id: string | null
          default_priority: string | null
          enabled: boolean
          id: string
          max_tickets_per_day: number | null
          max_tickets_per_hour: number | null
          org_id: string
          sentry_org_slug: string | null
          sentry_project_slugs: string[] | null
          triage_mode_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_dev_hub_project_id?: string | null
          default_priority?: string | null
          enabled?: boolean
          id?: string
          max_tickets_per_day?: number | null
          max_tickets_per_hour?: number | null
          org_id: string
          sentry_org_slug?: string | null
          sentry_project_slugs?: string[] | null
          triage_mode_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_dev_hub_project_id?: string | null
          default_priority?: string | null
          enabled?: boolean
          id?: string
          max_tickets_per_day?: number | null
          max_tickets_per_hour?: number | null
          org_id?: string
          sentry_org_slug?: string | null
          sentry_project_slugs?: string[] | null
          triage_mode_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sentry_bridge_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sentry_bridge_metrics: {
        Row: {
          avg_processing_time_ms: number | null
          bucket_end: string
          bucket_start: string
          created_at: string
          dlq_items: number
          id: string
          max_processing_time_ms: number | null
          org_id: string
          tickets_created: number
          tickets_triaged: number
          tickets_updated: number
          webhooks_failed: number
          webhooks_processed: number
          webhooks_received: number
          webhooks_skipped: number
        }
        Insert: {
          avg_processing_time_ms?: number | null
          bucket_end: string
          bucket_start: string
          created_at?: string
          dlq_items?: number
          id?: string
          max_processing_time_ms?: number | null
          org_id: string
          tickets_created?: number
          tickets_triaged?: number
          tickets_updated?: number
          webhooks_failed?: number
          webhooks_processed?: number
          webhooks_received?: number
          webhooks_skipped?: number
        }
        Update: {
          avg_processing_time_ms?: number | null
          bucket_end?: string
          bucket_start?: string
          created_at?: string
          dlq_items?: number
          id?: string
          max_processing_time_ms?: number | null
          org_id?: string
          tickets_created?: number
          tickets_triaged?: number
          tickets_updated?: number
          webhooks_failed?: number
          webhooks_processed?: number
          webhooks_received?: number
          webhooks_skipped?: number
        }
        Relationships: [
          {
            foreignKeyName: "sentry_bridge_metrics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sentry_bridge_queue: {
        Row: {
          attempt_count: number
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string
          org_id: string
          processed_at: string | null
          routing_rule_id: string | null
          sentry_event_id: string
          sentry_issue_id: string
          status: string
          target_dev_hub_project_id: string
          target_owner_user_id: string | null
          target_priority: string
          ticket_payload: Json
          webhook_event_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string
          org_id: string
          processed_at?: string | null
          routing_rule_id?: string | null
          sentry_event_id: string
          sentry_issue_id: string
          status?: string
          target_dev_hub_project_id: string
          target_owner_user_id?: string | null
          target_priority?: string
          ticket_payload: Json
          webhook_event_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string
          org_id?: string
          processed_at?: string | null
          routing_rule_id?: string | null
          sentry_event_id?: string
          sentry_issue_id?: string
          status?: string
          target_dev_hub_project_id?: string
          target_owner_user_id?: string | null
          target_priority?: string
          ticket_payload?: Json
          webhook_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sentry_bridge_queue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sentry_bridge_queue_routing_rule_id_fkey"
            columns: ["routing_rule_id"]
            isOneToOne: false
            referencedRelation: "sentry_routing_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sentry_bridge_queue_webhook_event_id_fkey"
            columns: ["webhook_event_id"]
            isOneToOne: false
            referencedRelation: "sentry_webhook_events"
            referencedColumns: ["id"]
          },
        ]
      }
      sentry_dead_letter_queue: {
        Row: {
          attempt_count: number
          created_at: string
          event_type: string
          failure_reason: string
          id: string
          last_error_details: Json | null
          org_id: string
          original_payload: Json
          original_queue_id: string
          queue_type: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          sentry_issue_id: string
          status: string
          webhook_event_id: string
        }
        Insert: {
          attempt_count: number
          created_at?: string
          event_type: string
          failure_reason: string
          id?: string
          last_error_details?: Json | null
          org_id: string
          original_payload: Json
          original_queue_id: string
          queue_type: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sentry_issue_id: string
          status?: string
          webhook_event_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          event_type?: string
          failure_reason?: string
          id?: string
          last_error_details?: Json | null
          org_id?: string
          original_payload?: Json
          original_queue_id?: string
          queue_type?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sentry_issue_id?: string
          status?: string
          webhook_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sentry_dead_letter_queue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sentry_dead_letter_queue_webhook_event_id_fkey"
            columns: ["webhook_event_id"]
            isOneToOne: false
            referencedRelation: "sentry_webhook_events"
            referencedColumns: ["id"]
          },
        ]
      }
      sentry_issue_mappings: {
        Row: {
          created_at: string
          dev_hub_project_id: string
          dev_hub_status: string | null
          dev_hub_task_id: string
          error_hash: string | null
          event_count: number
          first_release: string | null
          first_seen: string
          id: string
          last_seen: string
          latest_release: string | null
          latest_sentry_event_id: string | null
          org_id: string
          sentry_external_issue_id: string | null
          sentry_issue_id: string
          sentry_project_slug: string
          sentry_status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dev_hub_project_id: string
          dev_hub_status?: string | null
          dev_hub_task_id: string
          error_hash?: string | null
          event_count?: number
          first_release?: string | null
          first_seen?: string
          id?: string
          last_seen?: string
          latest_release?: string | null
          latest_sentry_event_id?: string | null
          org_id: string
          sentry_external_issue_id?: string | null
          sentry_issue_id: string
          sentry_project_slug: string
          sentry_status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dev_hub_project_id?: string
          dev_hub_status?: string | null
          dev_hub_task_id?: string
          error_hash?: string | null
          event_count?: number
          first_release?: string | null
          first_seen?: string
          id?: string
          last_seen?: string
          latest_release?: string | null
          latest_sentry_event_id?: string | null
          org_id?: string
          sentry_external_issue_id?: string | null
          sentry_issue_id?: string
          sentry_project_slug?: string
          sentry_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sentry_issue_mappings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sentry_routing_rules: {
        Row: {
          additional_labels: string[] | null
          attach_runbook_urls: string[] | null
          config_id: string
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          match_culprit: string | null
          match_environment: string | null
          match_error_message: string | null
          match_error_type: string | null
          match_release_pattern: string | null
          match_sentry_project: string | null
          match_tags: Json | null
          name: string
          notify_slack_channel: string | null
          org_id: string
          priority: number
          target_dev_hub_project_id: string
          target_owner_user_id: string | null
          target_priority: string | null
          test_mode: boolean
          updated_at: string
        }
        Insert: {
          additional_labels?: string[] | null
          attach_runbook_urls?: string[] | null
          config_id: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          match_culprit?: string | null
          match_environment?: string | null
          match_error_message?: string | null
          match_error_type?: string | null
          match_release_pattern?: string | null
          match_sentry_project?: string | null
          match_tags?: Json | null
          name: string
          notify_slack_channel?: string | null
          org_id: string
          priority?: number
          target_dev_hub_project_id: string
          target_owner_user_id?: string | null
          target_priority?: string | null
          test_mode?: boolean
          updated_at?: string
        }
        Update: {
          additional_labels?: string[] | null
          attach_runbook_urls?: string[] | null
          config_id?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          match_culprit?: string | null
          match_environment?: string | null
          match_error_message?: string | null
          match_error_type?: string | null
          match_release_pattern?: string | null
          match_sentry_project?: string | null
          match_tags?: Json | null
          name?: string
          notify_slack_channel?: string | null
          org_id?: string
          priority?: number
          target_dev_hub_project_id?: string
          target_owner_user_id?: string | null
          target_priority?: string | null
          test_mode?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sentry_routing_rules_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "sentry_bridge_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sentry_routing_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sentry_triage_queue: {
        Row: {
          created_at: string
          culprit: string | null
          environment: string | null
          error_message: string | null
          error_title: string
          error_type: string | null
          event_count: number | null
          first_seen: string | null
          id: string
          matched_rule_id: string | null
          org_id: string
          rejection_reason: string | null
          release_version: string | null
          sentry_issue_id: string
          sentry_project_slug: string
          status: string
          suggested_dev_hub_project_id: string | null
          suggested_owner_user_id: string | null
          suggested_priority: string | null
          ticket_payload: Json
          triaged_at: string | null
          triaged_by: string | null
          webhook_event_id: string
        }
        Insert: {
          created_at?: string
          culprit?: string | null
          environment?: string | null
          error_message?: string | null
          error_title: string
          error_type?: string | null
          event_count?: number | null
          first_seen?: string | null
          id?: string
          matched_rule_id?: string | null
          org_id: string
          rejection_reason?: string | null
          release_version?: string | null
          sentry_issue_id: string
          sentry_project_slug: string
          status?: string
          suggested_dev_hub_project_id?: string | null
          suggested_owner_user_id?: string | null
          suggested_priority?: string | null
          ticket_payload: Json
          triaged_at?: string | null
          triaged_by?: string | null
          webhook_event_id: string
        }
        Update: {
          created_at?: string
          culprit?: string | null
          environment?: string | null
          error_message?: string | null
          error_title?: string
          error_type?: string | null
          event_count?: number | null
          first_seen?: string | null
          id?: string
          matched_rule_id?: string | null
          org_id?: string
          rejection_reason?: string | null
          release_version?: string | null
          sentry_issue_id?: string
          sentry_project_slug?: string
          status?: string
          suggested_dev_hub_project_id?: string | null
          suggested_owner_user_id?: string | null
          suggested_priority?: string | null
          ticket_payload?: Json
          triaged_at?: string | null
          triaged_by?: string | null
          webhook_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sentry_triage_queue_matched_rule_id_fkey"
            columns: ["matched_rule_id"]
            isOneToOne: false
            referencedRelation: "sentry_routing_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sentry_triage_queue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sentry_triage_queue_webhook_event_id_fkey"
            columns: ["webhook_event_id"]
            isOneToOne: false
            referencedRelation: "sentry_webhook_events"
            referencedColumns: ["id"]
          },
        ]
      }
      sentry_webhook_events: {
        Row: {
          error_message: string | null
          event_dedupe_key: string | null
          event_type: string
          id: string
          org_id: string
          processed_at: string | null
          raw_payload: Json
          received_at: string
          sentry_event_id: string
          sentry_issue_id: string | null
          status: string
        }
        Insert: {
          error_message?: string | null
          event_dedupe_key?: string | null
          event_type: string
          id?: string
          org_id: string
          processed_at?: string | null
          raw_payload: Json
          received_at?: string
          sentry_event_id: string
          sentry_issue_id?: string | null
          status?: string
        }
        Update: {
          error_message?: string | null
          event_dedupe_key?: string | null
          event_type?: string
          id?: string
          org_id?: string
          processed_at?: string | null
          raw_payload?: Json
          received_at?: string
          sentry_event_id?: string
          sentry_issue_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sentry_webhook_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sentry_webhook_queue: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          max_retries: number
          next_retry_at: string | null
          org_id: string
          payload: Json
          priority: number
          processed_at: string | null
          retry_count: number
          sentry_issue_id: string
          sentry_project_slug: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          max_retries?: number
          next_retry_at?: string | null
          org_id: string
          payload: Json
          priority?: number
          processed_at?: string | null
          retry_count?: number
          sentry_issue_id: string
          sentry_project_slug?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          max_retries?: number
          next_retry_at?: string | null
          org_id?: string
          payload?: Json
          priority?: number
          processed_at?: string | null
          retry_count?: number
          sentry_issue_id?: string
          sentry_project_slug?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sentry_webhook_queue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_executions: {
        Row: {
          completed_at: string | null
          created_at: string | null
          current_hitl_request_id: string | null
          error_message: string | null
          failed_step_index: number | null
          final_output: Json | null
          id: string
          input_context: Json
          is_simulation: boolean
          mock_data_used: Json | null
          organization_id: string
          sequence_key: string
          started_at: string | null
          status: string
          step_results: Json
          updated_at: string | null
          user_id: string
          waiting_for_hitl: boolean | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          current_hitl_request_id?: string | null
          error_message?: string | null
          failed_step_index?: number | null
          final_output?: Json | null
          id?: string
          input_context?: Json
          is_simulation?: boolean
          mock_data_used?: Json | null
          organization_id: string
          sequence_key: string
          started_at?: string | null
          status?: string
          step_results?: Json
          updated_at?: string | null
          user_id: string
          waiting_for_hitl?: boolean | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          current_hitl_request_id?: string | null
          error_message?: string | null
          failed_step_index?: number | null
          final_output?: Json | null
          id?: string
          input_context?: Json
          is_simulation?: boolean
          mock_data_used?: Json | null
          organization_id?: string
          sequence_key?: string
          started_at?: string | null
          status?: string
          step_results?: Json
          updated_at?: string | null
          user_id?: string
          waiting_for_hitl?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "sequence_executions_current_hitl_request_id_fkey"
            columns: ["current_hitl_request_id"]
            isOneToOne: false
            referencedRelation: "hitl_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_executions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_hitl_requests: {
        Row: {
          assigned_to_user_id: string | null
          channels: Json
          created_at: string
          default_value: string | null
          execution_context: Json
          execution_id: string
          expires_at: string | null
          id: string
          options: Json | null
          organization_id: string
          prompt: string
          request_type: string
          requested_by_user_id: string
          responded_at: string | null
          responded_by_user_id: string | null
          response_channel: string | null
          response_context: Json | null
          response_value: string | null
          sequence_key: string
          slack_channel_id: string | null
          slack_message_ts: string | null
          status: string
          step_index: number
          timeout_action: string
          timeout_minutes: number
          timing: string
          updated_at: string
        }
        Insert: {
          assigned_to_user_id?: string | null
          channels?: Json
          created_at?: string
          default_value?: string | null
          execution_context?: Json
          execution_id: string
          expires_at?: string | null
          id?: string
          options?: Json | null
          organization_id: string
          prompt: string
          request_type: string
          requested_by_user_id: string
          responded_at?: string | null
          responded_by_user_id?: string | null
          response_channel?: string | null
          response_context?: Json | null
          response_value?: string | null
          sequence_key: string
          slack_channel_id?: string | null
          slack_message_ts?: string | null
          status?: string
          step_index: number
          timeout_action?: string
          timeout_minutes?: number
          timing: string
          updated_at?: string
        }
        Update: {
          assigned_to_user_id?: string | null
          channels?: Json
          created_at?: string
          default_value?: string | null
          execution_context?: Json
          execution_id?: string
          expires_at?: string | null
          id?: string
          options?: Json | null
          organization_id?: string
          prompt?: string
          request_type?: string
          requested_by_user_id?: string
          responded_at?: string | null
          responded_by_user_id?: string | null
          response_channel?: string | null
          response_context?: Json | null
          response_value?: string | null
          sequence_key?: string
          slack_channel_id?: string | null
          slack_message_ts?: string | null
          status?: string
          step_index?: number
          timeout_action?: string
          timeout_minutes?: number
          timing?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequence_hitl_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_references_archive: {
        Row: {
          archived_at: string
          created_at: string
          id: string
          location: string
          organization_id: string
          reference_type: string
          sequence_instance_id: string
          size_bytes: number | null
          summary: string | null
        }
        Insert: {
          archived_at?: string
          created_at?: string
          id?: string
          location: string
          organization_id: string
          reference_type: string
          sequence_instance_id: string
          size_bytes?: number | null
          summary?: string | null
        }
        Update: {
          archived_at?: string
          created_at?: string
          id?: string
          location?: string
          organization_id?: string
          reference_type?: string
          sequence_instance_id?: string
          size_bytes?: number | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sequence_references_archive_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_token_budgets: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          over_budget: boolean
          per_step_ceiling: number
          sequence_instance_id: string
          skill_result_tokens: number
          state_tokens: number
          step_breakdown: Json | null
          system_prompt_tokens: number
          total_used: number
          updated_at: string
          warnings: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          over_budget?: boolean
          per_step_ceiling?: number
          sequence_instance_id: string
          skill_result_tokens?: number
          state_tokens?: number
          step_breakdown?: Json | null
          system_prompt_tokens?: number
          total_used?: number
          updated_at?: string
          warnings?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          over_budget?: boolean
          per_step_ceiling?: number
          sequence_instance_id?: string
          skill_result_tokens?: number
          state_tokens?: number
          step_breakdown?: Json | null
          system_prompt_tokens?: number
          total_used?: number
          updated_at?: string
          warnings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "sequence_token_budgets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_output_storage: {
        Row: {
          content_type: string
          created_at: string
          data: Json
          expires_at: string | null
          id: string
          organization_id: string
          path: string
          size_bytes: number
        }
        Insert: {
          content_type?: string
          created_at?: string
          data: Json
          expires_at?: string | null
          id?: string
          organization_id: string
          path: string
          size_bytes?: number
        }
        Update: {
          content_type?: string
          created_at?: string
          data?: Json
          expires_at?: string | null
          id?: string
          organization_id?: string
          path?: string
          size_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "skill_output_storage_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      slack_channels: {
        Row: {
          channel_id: string
          channel_name: string
          created_at: string | null
          id: string
          integration_id: string
          is_archived: boolean | null
          is_member: boolean | null
          is_private: boolean | null
          updated_at: string | null
        }
        Insert: {
          channel_id: string
          channel_name: string
          created_at?: string | null
          id?: string
          integration_id: string
          is_archived?: boolean | null
          is_member?: boolean | null
          is_private?: boolean | null
          updated_at?: string | null
        }
        Update: {
          channel_id?: string
          channel_name?: string
          created_at?: string | null
          id?: string
          integration_id?: string
          is_archived?: boolean | null
          is_member?: boolean | null
          is_private?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "slack_channels_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "slack_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      slack_deal_rooms: {
        Row: {
          archived_at: string | null
          created_at: string | null
          deal_id: string | null
          id: string
          invited_slack_user_ids: string[] | null
          is_archived: boolean | null
          org_id: string | null
          slack_channel_id: string
          slack_channel_name: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string | null
          deal_id?: string | null
          id?: string
          invited_slack_user_ids?: string[] | null
          is_archived?: boolean | null
          org_id?: string | null
          slack_channel_id: string
          slack_channel_name: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string | null
          deal_id?: string | null
          id?: string
          invited_slack_user_ids?: string[] | null
          is_archived?: boolean | null
          org_id?: string | null
          slack_channel_id?: string
          slack_channel_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "slack_deal_rooms_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slack_deal_rooms_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      slack_integrations: {
        Row: {
          access_token: string
          app_id: string
          authed_user: Json | null
          bot_user_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          scope: string
          team_id: string
          team_name: string
          token_type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          app_id: string
          authed_user?: Json | null
          bot_user_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          scope: string
          team_id: string
          team_name: string
          token_type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          app_id?: string
          authed_user?: Json | null
          bot_user_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          scope?: string
          team_id?: string
          team_name?: string
          token_type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      slack_notification_settings: {
        Row: {
          channel_id: string | null
          channel_name: string | null
          created_at: string | null
          deal_stage_threshold: string | null
          deal_stage_trigger: string | null
          deal_value_threshold: number | null
          delivery_method: string | null
          dm_audience: string | null
          feature: string
          id: string
          is_enabled: boolean | null
          org_id: string | null
          schedule: string | null
          schedule_time: string | null
          schedule_timezone: string | null
          stakeholder_slack_ids: string[] | null
          target_channel_id: string | null
          thresholds: Json | null
          updated_at: string | null
        }
        Insert: {
          channel_id?: string | null
          channel_name?: string | null
          created_at?: string | null
          deal_stage_threshold?: string | null
          deal_stage_trigger?: string | null
          deal_value_threshold?: number | null
          delivery_method?: string | null
          dm_audience?: string | null
          feature: string
          id?: string
          is_enabled?: boolean | null
          org_id?: string | null
          schedule?: string | null
          schedule_time?: string | null
          schedule_timezone?: string | null
          stakeholder_slack_ids?: string[] | null
          target_channel_id?: string | null
          thresholds?: Json | null
          updated_at?: string | null
        }
        Update: {
          channel_id?: string | null
          channel_name?: string | null
          created_at?: string | null
          deal_stage_threshold?: string | null
          deal_stage_trigger?: string | null
          deal_value_threshold?: number | null
          delivery_method?: string | null
          dm_audience?: string | null
          feature?: string
          id?: string
          is_enabled?: boolean | null
          org_id?: string | null
          schedule?: string | null
          schedule_time?: string | null
          schedule_timezone?: string | null
          stakeholder_slack_ids?: string[] | null
          target_channel_id?: string | null
          thresholds?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "slack_notification_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      slack_notifications_sent: {
        Row: {
          dedupe_key: string | null
          entity_id: string | null
          entity_key: string | null
          entity_type: string | null
          feature: string
          id: string
          metadata: Json | null
          org_id: string | null
          recipient_id: string | null
          recipient_type: string | null
          sent_at: string | null
          slack_channel_id: string | null
          slack_message_ts: string | null
          slack_ts: string | null
        }
        Insert: {
          dedupe_key?: string | null
          entity_id?: string | null
          entity_key?: string | null
          entity_type?: string | null
          feature: string
          id?: string
          metadata?: Json | null
          org_id?: string | null
          recipient_id?: string | null
          recipient_type?: string | null
          sent_at?: string | null
          slack_channel_id?: string | null
          slack_message_ts?: string | null
          slack_ts?: string | null
        }
        Update: {
          dedupe_key?: string | null
          entity_id?: string | null
          entity_key?: string | null
          entity_type?: string | null
          feature?: string
          id?: string
          metadata?: Json | null
          org_id?: string | null
          recipient_id?: string | null
          recipient_type?: string | null
          sent_at?: string | null
          slack_channel_id?: string | null
          slack_message_ts?: string | null
          slack_ts?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "slack_notifications_sent_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      slack_org_settings: {
        Row: {
          bot_access_token: string | null
          bot_user_id: string | null
          connected_at: string | null
          connected_by: string | null
          created_at: string | null
          id: string
          is_connected: boolean | null
          org_id: string | null
          slack_team_id: string | null
          slack_team_name: string | null
          updated_at: string | null
        }
        Insert: {
          bot_access_token?: string | null
          bot_user_id?: string | null
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string | null
          id?: string
          is_connected?: boolean | null
          org_id?: string | null
          slack_team_id?: string | null
          slack_team_name?: string | null
          updated_at?: string | null
        }
        Update: {
          bot_access_token?: string | null
          bot_user_id?: string | null
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string | null
          id?: string
          is_connected?: boolean | null
          org_id?: string | null
          slack_team_id?: string | null
          slack_team_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "slack_org_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      slack_user_mappings: {
        Row: {
          created_at: string | null
          id: string
          is_auto_matched: boolean | null
          org_id: string | null
          sixty_user_id: string | null
          slack_avatar_url: string | null
          slack_display_name: string | null
          slack_email: string | null
          slack_user_id: string
          slack_username: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_auto_matched?: boolean | null
          org_id?: string | null
          sixty_user_id?: string | null
          slack_avatar_url?: string | null
          slack_display_name?: string | null
          slack_email?: string | null
          slack_user_id: string
          slack_username?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_auto_matched?: boolean | null
          org_id?: string | null
          sixty_user_id?: string | null
          slack_avatar_url?: string | null
          slack_display_name?: string | null
          slack_email?: string | null
          slack_user_id?: string
          slack_username?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "slack_user_mappings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      smart_task_templates: {
        Row: {
          clerk_org_id: string | null
          created_at: string | null
          created_by: string | null
          days_after_trigger: number
          id: string
          is_active: boolean | null
          priority: string | null
          task_description: string | null
          task_title: string
          task_type: string
          trigger_activity_type: string
          updated_at: string | null
        }
        Insert: {
          clerk_org_id?: string | null
          created_at?: string | null
          created_by?: string | null
          days_after_trigger?: number
          id?: string
          is_active?: boolean | null
          priority?: string | null
          task_description?: string | null
          task_title: string
          task_type?: string
          trigger_activity_type: string
          updated_at?: string | null
        }
        Update: {
          clerk_org_id?: string | null
          created_at?: string | null
          created_by?: string | null
          days_after_trigger?: number
          id?: string
          is_active?: boolean | null
          priority?: string | null
          task_description?: string | null
          task_title?: string
          task_type?: string
          trigger_activity_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      solutions: {
        Row: {
          challenge_id: string | null
          created_at: string | null
          demo_url: string | null
          description: string | null
          features: string[] | null
          id: string
          is_active: boolean | null
          order_index: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          challenge_id?: string | null
          created_at?: string | null
          demo_url?: string | null
          description?: string | null
          features?: string[] | null
          id?: string
          is_active?: boolean | null
          order_index?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          challenge_id?: string | null
          created_at?: string | null
          demo_url?: string | null
          description?: string | null
          features?: string[] | null
          id?: string
          is_active?: boolean | null
          order_index?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solutions_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      stages: {
        Row: {
          created_at: string | null
          id: string
          name: string
          position: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          position?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          position?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          badge_text: string | null
          created_at: string | null
          cta_text: string | null
          cta_url: string | null
          currency: string
          description: string | null
          display_order: number | null
          features: Json
          highlight_features: string[] | null
          id: string
          included_seats: number | null
          is_active: boolean | null
          is_default: boolean | null
          is_free_tier: boolean | null
          is_public: boolean | null
          max_ai_tokens_per_month: number | null
          max_meetings_per_month: number | null
          max_storage_mb: number | null
          max_users: number | null
          meeting_retention_months: number | null
          name: string
          per_seat_price: number | null
          price_monthly: number
          price_yearly: number
          slug: string
          stripe_price_id_monthly: string | null
          stripe_price_id_yearly: string | null
          stripe_product_id: string | null
          stripe_seat_price_id: string | null
          stripe_sync_error: string | null
          stripe_synced_at: string | null
          trial_days: number | null
          updated_at: string | null
        }
        Insert: {
          badge_text?: string | null
          created_at?: string | null
          cta_text?: string | null
          cta_url?: string | null
          currency?: string
          description?: string | null
          display_order?: number | null
          features?: Json
          highlight_features?: string[] | null
          id?: string
          included_seats?: number | null
          is_active?: boolean | null
          is_default?: boolean | null
          is_free_tier?: boolean | null
          is_public?: boolean | null
          max_ai_tokens_per_month?: number | null
          max_meetings_per_month?: number | null
          max_storage_mb?: number | null
          max_users?: number | null
          meeting_retention_months?: number | null
          name: string
          per_seat_price?: number | null
          price_monthly?: number
          price_yearly?: number
          slug: string
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          stripe_product_id?: string | null
          stripe_seat_price_id?: string | null
          stripe_sync_error?: string | null
          stripe_synced_at?: string | null
          trial_days?: number | null
          updated_at?: string | null
        }
        Update: {
          badge_text?: string | null
          created_at?: string | null
          cta_text?: string | null
          cta_url?: string | null
          currency?: string
          description?: string | null
          display_order?: number | null
          features?: Json
          highlight_features?: string[] | null
          id?: string
          included_seats?: number | null
          is_active?: boolean | null
          is_default?: boolean | null
          is_free_tier?: boolean | null
          is_public?: boolean | null
          max_ai_tokens_per_month?: number | null
          max_meetings_per_month?: number | null
          max_storage_mb?: number | null
          max_users?: number | null
          meeting_retention_months?: number | null
          name?: string
          per_seat_price?: number | null
          price_monthly?: number
          price_yearly?: number
          slug?: string
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          stripe_product_id?: string | null
          stripe_seat_price_id?: string | null
          stripe_sync_error?: string | null
          stripe_synced_at?: string | null
          trial_days?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      subscription_seat_usage: {
        Row: {
          active_seats: number
          billed_at: string | null
          created_at: string | null
          id: string
          included_seats: number
          org_id: string
          overage_amount_cents: number | null
          overage_seats: number | null
          period_end: string
          period_start: string
          stripe_usage_record_id: string | null
          subscription_id: string | null
          updated_at: string | null
        }
        Insert: {
          active_seats?: number
          billed_at?: string | null
          created_at?: string | null
          id?: string
          included_seats?: number
          org_id: string
          overage_amount_cents?: number | null
          overage_seats?: number | null
          period_end: string
          period_start: string
          stripe_usage_record_id?: string | null
          subscription_id?: string | null
          updated_at?: string | null
        }
        Update: {
          active_seats?: number
          billed_at?: string | null
          created_at?: string | null
          id?: string
          included_seats?: number
          org_id?: string
          overage_amount_cents?: number | null
          overage_seats?: number | null
          period_end?: string
          period_start?: string
          stripe_usage_record_id?: string | null
          subscription_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_seat_usage_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_seat_usage_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "organization_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_seat_usage_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscription_facts_view"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          created_at: string | null
          description: string | null
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      targets: {
        Row: {
          closed_by: string | null
          created_at: string | null
          created_by: string | null
          end_date: string
          id: string
          meetings_target: number
          outbound_target: number
          previous_target_id: string | null
          proposal_target: number
          revenue_target: number
          start_date: string
          team_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          closed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          end_date: string
          id?: string
          meetings_target: number
          outbound_target: number
          previous_target_id?: string | null
          proposal_target: number
          revenue_target: number
          start_date: string
          team_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          closed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          end_date?: string
          id?: string
          meetings_target?: number
          outbound_target?: number
          previous_target_id?: string | null
          proposal_target?: number
          revenue_target?: number
          start_date?: string
          team_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "targets_previous_target_id_fkey"
            columns: ["previous_target_id"]
            isOneToOne: false
            referencedRelation: "targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "targets_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "targets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "targets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "targets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "targets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "targets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      task_notifications: {
        Row: {
          created_at: string | null
          id: string
          meeting_id: string | null
          message: string
          metadata: Json | null
          notification_type: string
          read: boolean | null
          task_count: number | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          meeting_id?: string | null
          message: string
          metadata?: Json | null
          notification_type: string
          read?: boolean | null
          task_count?: number | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          meeting_id?: string | null
          message?: string
          metadata?: Json | null
          notification_type?: string
          read?: boolean | null
          task_count?: number | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_notifications_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string
          call_action_item_id: string | null
          call_id: string | null
          category: string | null
          clerk_org_id: string | null
          company: string | null
          company_id: string | null
          completed: boolean | null
          completed_at: string | null
          contact_email: string | null
          contact_id: string | null
          contact_name: string | null
          created_at: string | null
          created_by: string
          deal_id: string | null
          description: string | null
          due_date: string | null
          google_etag: string | null
          google_list_id: string | null
          google_position: string | null
          google_task_id: string | null
          id: string
          importance: string | null
          last_synced_at: string | null
          meeting_action_item_id: string | null
          meeting_id: string | null
          metadata: Json | null
          notes: string | null
          owner_id: string | null
          parent_task_id: string | null
          primary_google_list_id: string | null
          priority: string | null
          source: string | null
          source_id: string | null
          status: string | null
          sync_status: string | null
          synced_to_lists: Json | null
          task_type: string | null
          title: string
          type: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to: string
          call_action_item_id?: string | null
          call_id?: string | null
          category?: string | null
          clerk_org_id?: string | null
          company?: string | null
          company_id?: string | null
          completed?: boolean | null
          completed_at?: string | null
          contact_email?: string | null
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          created_by: string
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          google_etag?: string | null
          google_list_id?: string | null
          google_position?: string | null
          google_task_id?: string | null
          id?: string
          importance?: string | null
          last_synced_at?: string | null
          meeting_action_item_id?: string | null
          meeting_id?: string | null
          metadata?: Json | null
          notes?: string | null
          owner_id?: string | null
          parent_task_id?: string | null
          primary_google_list_id?: string | null
          priority?: string | null
          source?: string | null
          source_id?: string | null
          status?: string | null
          sync_status?: string | null
          synced_to_lists?: Json | null
          task_type?: string | null
          title: string
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string
          call_action_item_id?: string | null
          call_id?: string | null
          category?: string | null
          clerk_org_id?: string | null
          company?: string | null
          company_id?: string | null
          completed?: boolean | null
          completed_at?: string | null
          contact_email?: string | null
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          created_by?: string
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          google_etag?: string | null
          google_list_id?: string | null
          google_position?: string | null
          google_task_id?: string | null
          id?: string
          importance?: string | null
          last_synced_at?: string | null
          meeting_action_item_id?: string | null
          meeting_id?: string | null
          metadata?: Json | null
          notes?: string | null
          owner_id?: string | null
          parent_task_id?: string | null
          primary_google_list_id?: string | null
          priority?: string | null
          source?: string | null
          source_id?: string | null
          status?: string | null
          sync_status?: string | null
          synced_to_lists?: Json | null
          task_type?: string | null
          title?: string
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_tasks_company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tasks_contact_id"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tasks_call_action_item_id_fkey"
            columns: ["call_action_item_id"]
            isOneToOne: false
            referencedRelation: "call_action_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_meeting_action_item_id_fkey"
            columns: ["meeting_action_item_id"]
            isOneToOne: false
            referencedRelation: "meeting_action_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["member_role"] | null
          team_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["member_role"] | null
          team_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["member_role"] | null
          team_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      topic_aggregation_queue: {
        Row: {
          attempts: number
          created_at: string
          error_message: string | null
          id: string
          meeting_id: string
          processed_at: string | null
          status: string
          topic_index: number
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          id?: string
          meeting_id: string
          processed_at?: string | null
          status?: string
          topic_index: number
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          id?: string
          meeting_id?: string
          processed_at?: string | null
          status?: string
          topic_index?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_aggregation_queue_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          created_at: string | null
          event_subtype: string | null
          event_type: string
          id: string
          metadata: Json | null
          org_id: string
          quantity: number
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_subtype?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          org_id: string
          quantity?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_subtype?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          org_id?: string
          quantity?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activation_events: {
        Row: {
          created_at: string | null
          event_data: Json | null
          event_type: string
          id: string
          org_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          org_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          org_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activation_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_events: {
        Row: {
          action_detail: string | null
          day_of_week: number | null
          entity_id: string | null
          entity_type: string | null
          event_at: string | null
          event_category: string | null
          event_source: string
          event_type: string
          hour_of_day: number | null
          id: string
          metadata: Json | null
          org_id: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          action_detail?: string | null
          day_of_week?: number | null
          entity_id?: string | null
          entity_type?: string | null
          event_at?: string | null
          event_category?: string | null
          event_source: string
          event_type: string
          hour_of_day?: number | null
          id?: string
          metadata?: Json | null
          org_id: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          action_detail?: string | null
          day_of_week?: number | null
          entity_id?: string | null
          entity_type?: string | null
          event_at?: string | null
          event_category?: string | null
          event_source?: string
          event_type?: string
          hour_of_day?: number | null
          id?: string
          metadata?: Json | null
          org_id?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_ai_feature_settings: {
        Row: {
          created_at: string | null
          feature_key: string
          id: string
          is_enabled: boolean | null
          max_tokens: number | null
          model: string
          provider: string
          temperature: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          feature_key: string
          id?: string
          is_enabled?: boolean | null
          max_tokens?: number | null
          model: string
          provider: string
          temperature?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          feature_key?: string
          id?: string
          is_enabled?: boolean | null
          max_tokens?: number | null
          model?: string
          provider?: string
          temperature?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_ai_preferences: {
        Row: {
          always_hitl_actions: string[] | null
          approval_rate: number | null
          auto_approve_threshold: number | null
          avg_time_to_decision_seconds: number | null
          created_at: string | null
          edit_rate: number | null
          id: string
          never_auto_send: boolean | null
          notification_frequency: string | null
          preferred_channels: string[] | null
          preferred_length: string | null
          preferred_tone: string | null
          prefers_bullet_points: boolean | null
          prefers_ctas: boolean | null
          rejection_rate: number | null
          total_suggestions: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          always_hitl_actions?: string[] | null
          approval_rate?: number | null
          auto_approve_threshold?: number | null
          avg_time_to_decision_seconds?: number | null
          created_at?: string | null
          edit_rate?: number | null
          id?: string
          never_auto_send?: boolean | null
          notification_frequency?: string | null
          preferred_channels?: string[] | null
          preferred_length?: string | null
          preferred_tone?: string | null
          prefers_bullet_points?: boolean | null
          prefers_ctas?: boolean | null
          rejection_rate?: number | null
          total_suggestions?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          always_hitl_actions?: string[] | null
          approval_rate?: number | null
          auto_approve_threshold?: number | null
          avg_time_to_decision_seconds?: number | null
          created_at?: string | null
          edit_rate?: number | null
          id?: string
          never_auto_send?: boolean | null
          notification_frequency?: string | null
          preferred_channels?: string[] | null
          preferred_length?: string | null
          preferred_tone?: string | null
          prefers_bullet_points?: boolean | null
          prefers_ctas?: boolean | null
          rejection_rate?: number | null
          total_suggestions?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_automation_rules: {
        Row: {
          action_config: Json | null
          action_type: string
          ai_agent_configs: Json | null
          avg_execution_time_ms: number | null
          canvas_data: Json | null
          clerk_org_id: string | null
          created_at: string | null
          execution_count: number | null
          execution_order: number | null
          failure_count: number | null
          id: string
          is_active: boolean | null
          last_error_message: string | null
          last_execution_at: string | null
          last_execution_status: string | null
          priority_level: number | null
          rule_description: string | null
          rule_name: string
          success_count: number | null
          success_rate: number | null
          template_id: string | null
          trigger_conditions: Json | null
          trigger_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          action_config?: Json | null
          action_type: string
          ai_agent_configs?: Json | null
          avg_execution_time_ms?: number | null
          canvas_data?: Json | null
          clerk_org_id?: string | null
          created_at?: string | null
          execution_count?: number | null
          execution_order?: number | null
          failure_count?: number | null
          id?: string
          is_active?: boolean | null
          last_error_message?: string | null
          last_execution_at?: string | null
          last_execution_status?: string | null
          priority_level?: number | null
          rule_description?: string | null
          rule_name: string
          success_count?: number | null
          success_rate?: number | null
          template_id?: string | null
          trigger_conditions?: Json | null
          trigger_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          action_config?: Json | null
          action_type?: string
          ai_agent_configs?: Json | null
          avg_execution_time_ms?: number | null
          canvas_data?: Json | null
          clerk_org_id?: string | null
          created_at?: string | null
          execution_count?: number | null
          execution_order?: number | null
          failure_count?: number | null
          id?: string
          is_active?: boolean | null
          last_error_message?: string | null
          last_execution_at?: string | null
          last_execution_status?: string | null
          priority_level?: number | null
          rule_description?: string | null
          rule_name?: string
          success_count?: number | null
          success_rate?: number | null
          template_id?: string | null
          trigger_conditions?: Json | null
          trigger_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_coaching_preferences: {
        Row: {
          bad_example_meeting_ids: string[] | null
          bad_examples: string | null
          coaching_framework: string
          created_at: string | null
          custom_instructions: string | null
          evaluation_criteria: Json | null
          focus_areas: string[] | null
          good_example_meeting_ids: string[] | null
          good_examples: string | null
          id: string
          is_active: boolean | null
          rating_scale: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          bad_example_meeting_ids?: string[] | null
          bad_examples?: string | null
          coaching_framework?: string
          created_at?: string | null
          custom_instructions?: string | null
          evaluation_criteria?: Json | null
          focus_areas?: string[] | null
          good_example_meeting_ids?: string[] | null
          good_examples?: string | null
          id?: string
          is_active?: boolean | null
          rating_scale?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          bad_example_meeting_ids?: string[] | null
          bad_examples?: string | null
          coaching_framework?: string
          created_at?: string | null
          custom_instructions?: string | null
          evaluation_criteria?: Json | null
          focus_areas?: string[] | null
          good_example_meeting_ids?: string[] | null
          good_examples?: string | null
          id?: string
          is_active?: boolean | null
          rating_scale?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_engagement_metrics: {
        Row: {
          app_engagement_score: number | null
          avg_daily_sessions: number | null
          avg_session_duration_minutes: number | null
          created_at: string | null
          id: string
          inferred_timezone: string | null
          last_app_active_at: string | null
          last_feedback_requested_at: string | null
          last_login_at: string | null
          last_notification_clicked_at: string | null
          last_reengagement_at: string | null
          last_reengagement_type: string | null
          last_slack_active_at: string | null
          notification_engagement_score: number | null
          notification_fatigue_level: number | null
          notifications_since_last_feedback: number | null
          org_id: string
          overall_engagement_score: number | null
          peak_activity_hour: number | null
          preferred_notification_frequency: string | null
          previous_segment: string | null
          reengagement_attempts: number | null
          reengagement_cooldown_until: string | null
          segment_changed_at: string | null
          slack_engagement_score: number | null
          typical_active_hours: Json | null
          updated_at: string | null
          user_id: string
          user_segment: string | null
        }
        Insert: {
          app_engagement_score?: number | null
          avg_daily_sessions?: number | null
          avg_session_duration_minutes?: number | null
          created_at?: string | null
          id?: string
          inferred_timezone?: string | null
          last_app_active_at?: string | null
          last_feedback_requested_at?: string | null
          last_login_at?: string | null
          last_notification_clicked_at?: string | null
          last_reengagement_at?: string | null
          last_reengagement_type?: string | null
          last_slack_active_at?: string | null
          notification_engagement_score?: number | null
          notification_fatigue_level?: number | null
          notifications_since_last_feedback?: number | null
          org_id: string
          overall_engagement_score?: number | null
          peak_activity_hour?: number | null
          preferred_notification_frequency?: string | null
          previous_segment?: string | null
          reengagement_attempts?: number | null
          reengagement_cooldown_until?: string | null
          segment_changed_at?: string | null
          slack_engagement_score?: number | null
          typical_active_hours?: Json | null
          updated_at?: string | null
          user_id: string
          user_segment?: string | null
        }
        Update: {
          app_engagement_score?: number | null
          avg_daily_sessions?: number | null
          avg_session_duration_minutes?: number | null
          created_at?: string | null
          id?: string
          inferred_timezone?: string | null
          last_app_active_at?: string | null
          last_feedback_requested_at?: string | null
          last_login_at?: string | null
          last_notification_clicked_at?: string | null
          last_reengagement_at?: string | null
          last_reengagement_type?: string | null
          last_slack_active_at?: string | null
          notification_engagement_score?: number | null
          notification_fatigue_level?: number | null
          notifications_since_last_feedback?: number | null
          org_id?: string
          overall_engagement_score?: number | null
          peak_activity_hour?: number | null
          preferred_notification_frequency?: string | null
          previous_segment?: string | null
          reengagement_attempts?: number | null
          reengagement_cooldown_until?: string | null
          segment_changed_at?: string | null
          slack_engagement_score?: number | null
          typical_active_hours?: Json | null
          updated_at?: string | null
          user_id?: string
          user_segment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_engagement_metrics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_engagement_metrics_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_engagement_metrics_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_engagement_metrics_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_engagement_metrics_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_engagement_metrics_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_file_search_stores: {
        Row: {
          created_at: string | null
          display_name: string | null
          error_message: string | null
          id: string
          last_sync_at: string | null
          status: string | null
          store_name: string
          total_files: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          status?: string | null
          store_name: string
          total_files?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          status?: string | null
          store_name?: string
          total_files?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_notifications: {
        Row: {
          action_text: string | null
          action_url: string | null
          created_at: string | null
          dismissed_at: string | null
          expires_at: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          org_id: string | null
          read_at: string | null
          scheduled_for: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_text?: string | null
          action_url?: string | null
          created_at?: string | null
          dismissed_at?: string | null
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          org_id?: string | null
          read_at?: string | null
          scheduled_for?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_text?: string | null
          action_url?: string | null
          created_at?: string | null
          dismissed_at?: string | null
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          org_id?: string | null
          read_at?: string | null
          scheduled_for?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_onboarding_progress: {
        Row: {
          activation_completed_at: string | null
          created_at: string | null
          fathom_connected: boolean | null
          features_discovered: Json | null
          first_meeting_synced: boolean | null
          first_proposal_generated: boolean | null
          first_summary_viewed: boolean | null
          first_summary_viewed_at: string | null
          id: string
          onboarding_completed_at: string | null
          onboarding_step: string | null
          skipped_onboarding: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          activation_completed_at?: string | null
          created_at?: string | null
          fathom_connected?: boolean | null
          features_discovered?: Json | null
          first_meeting_synced?: boolean | null
          first_proposal_generated?: boolean | null
          first_summary_viewed?: boolean | null
          first_summary_viewed_at?: string | null
          id?: string
          onboarding_completed_at?: string | null
          onboarding_step?: string | null
          skipped_onboarding?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          activation_completed_at?: string | null
          created_at?: string | null
          fathom_connected?: boolean | null
          features_discovered?: Json | null
          first_meeting_synced?: boolean | null
          first_proposal_generated?: boolean | null
          first_summary_viewed?: boolean | null
          first_summary_viewed_at?: string | null
          id?: string
          onboarding_completed_at?: string | null
          onboarding_step?: string | null
          skipped_onboarding?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          recording_setup_completed_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          recording_setup_completed_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          recording_setup_completed_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          is_admin: boolean | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          id?: string
          is_admin?: boolean | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_admin?: boolean | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          ai_provider_keys: Json | null
          created_at: string | null
          id: string
          preferences: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_provider_keys?: Json | null
          created_at?: string | null
          id?: string
          preferences?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_provider_keys?: Json | null
          created_at?: string | null
          id?: string
          preferences?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_sync_status: {
        Row: {
          calendar_last_synced_at: string | null
          calendar_sync_token: string | null
          created_at: string | null
          email_categorization_enabled: boolean | null
          email_last_synced_at: string | null
          email_sync_token: string | null
          gmail_history_id: string | null
          gmail_last_full_sync_at: string | null
          last_categorization_run_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          calendar_last_synced_at?: string | null
          calendar_sync_token?: string | null
          created_at?: string | null
          email_categorization_enabled?: boolean | null
          email_last_synced_at?: string | null
          email_sync_token?: string | null
          gmail_history_id?: string | null
          gmail_last_full_sync_at?: string | null
          last_categorization_run_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          calendar_last_synced_at?: string | null
          calendar_sync_token?: string | null
          created_at?: string | null
          email_categorization_enabled?: boolean | null
          email_last_synced_at?: string | null
          email_sync_token?: string | null
          gmail_history_id?: string | null
          gmail_last_full_sync_at?: string | null
          last_categorization_run_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_tone_settings: {
        Row: {
          brand_voice_description: string | null
          content_type: string
          created_at: string
          cta_style: string | null
          emoji_usage: string
          formality_level: number
          id: string
          include_cta: boolean | null
          max_length_override: number | null
          preferred_keywords: string[] | null
          sample_phrases: string[] | null
          tone_style: string
          updated_at: string
          user_id: string
          words_to_avoid: string[] | null
        }
        Insert: {
          brand_voice_description?: string | null
          content_type: string
          created_at?: string
          cta_style?: string | null
          emoji_usage?: string
          formality_level?: number
          id?: string
          include_cta?: boolean | null
          max_length_override?: number | null
          preferred_keywords?: string[] | null
          sample_phrases?: string[] | null
          tone_style?: string
          updated_at?: string
          user_id: string
          words_to_avoid?: string[] | null
        }
        Update: {
          brand_voice_description?: string | null
          content_type?: string
          created_at?: string
          cta_style?: string | null
          emoji_usage?: string
          formality_level?: number
          id?: string
          include_cta?: boolean | null
          max_length_override?: number | null
          preferred_keywords?: string[] | null
          sample_phrases?: string[] | null
          tone_style?: string
          updated_at?: string
          user_id?: string
          words_to_avoid?: string[] | null
        }
        Relationships: []
      }
      user_writing_styles: {
        Row: {
          created_at: string | null
          examples: string[] | null
          id: string
          is_default: boolean | null
          name: string
          source: string | null
          source_email_count: number | null
          style_metadata: Json | null
          tone_description: string
          trained_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          examples?: string[] | null
          id?: string
          is_default?: boolean | null
          name: string
          source?: string | null
          source_email_count?: number | null
          style_metadata?: Json | null
          tone_description: string
          trained_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          examples?: string[] | null
          id?: string
          is_default?: boolean | null
          name?: string
          source?: string | null
          source_email_count?: number | null
          style_metadata?: Json | null
          tone_description?: string
          trained_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      variable_storage: {
        Row: {
          created_at: string | null
          execution_id: string | null
          expires_at: string | null
          id: string
          key: string
          scope: string
          ttl_seconds: number | null
          updated_at: string | null
          value: Json
          workflow_id: string | null
        }
        Insert: {
          created_at?: string | null
          execution_id?: string | null
          expires_at?: string | null
          id?: string
          key: string
          scope: string
          ttl_seconds?: number | null
          updated_at?: string | null
          value: Json
          workflow_id?: string | null
        }
        Update: {
          created_at?: string | null
          execution_id?: string | null
          expires_at?: string | null
          id?: string
          key?: string
          scope?: string
          ttl_seconds?: number | null
          updated_at?: string | null
          value?: Json
          workflow_id?: string | null
        }
        Relationships: []
      }
      voice_recordings: {
        Row: {
          action_items: Json | null
          audio_url: string
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          deal_id: string | null
          duration_seconds: number | null
          error_message: string | null
          file_name: string
          file_size_bytes: number | null
          gladia_result_url: string | null
          id: string
          is_public: boolean | null
          key_topics: Json | null
          language: string | null
          last_viewed_at: string | null
          meeting_id: string | null
          org_id: string
          processed_at: string | null
          recorded_at: string | null
          recording_type: string
          sentiment_score: number | null
          share_token: string | null
          share_views: number | null
          speakers: Json | null
          status: string
          summary: string | null
          title: string
          transcript_segments: Json | null
          transcript_text: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          action_items?: Json | null
          audio_url: string
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          file_name: string
          file_size_bytes?: number | null
          gladia_result_url?: string | null
          id?: string
          is_public?: boolean | null
          key_topics?: Json | null
          language?: string | null
          last_viewed_at?: string | null
          meeting_id?: string | null
          org_id: string
          processed_at?: string | null
          recorded_at?: string | null
          recording_type?: string
          sentiment_score?: number | null
          share_token?: string | null
          share_views?: number | null
          speakers?: Json | null
          status?: string
          summary?: string | null
          title?: string
          transcript_segments?: Json | null
          transcript_text?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          action_items?: Json | null
          audio_url?: string
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          file_name?: string
          file_size_bytes?: number | null
          gladia_result_url?: string | null
          id?: string
          is_public?: boolean | null
          key_topics?: Json | null
          language?: string | null
          last_viewed_at?: string | null
          meeting_id?: string | null
          org_id?: string
          processed_at?: string | null
          recorded_at?: string | null
          recording_type?: string
          sentiment_score?: number | null
          share_token?: string | null
          share_views?: number | null
          speakers?: Json | null
          status?: string
          summary?: string | null
          title?: string
          transcript_segments?: Json | null
          transcript_text?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_recordings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_recordings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_recordings_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_recordings_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_recordings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vsl_video_analytics: {
        Row: {
          created_at: string | null
          duration: number | null
          event_type: string
          id: string
          playback_time: number | null
          progress_percent: number | null
          referrer: string | null
          screen_height: number | null
          screen_width: number | null
          session_id: string
          signup_source: string
          user_agent: string | null
          video_public_id: string
          watch_time: number | null
        }
        Insert: {
          created_at?: string | null
          duration?: number | null
          event_type: string
          id?: string
          playback_time?: number | null
          progress_percent?: number | null
          referrer?: string | null
          screen_height?: number | null
          screen_width?: number | null
          session_id: string
          signup_source: string
          user_agent?: string | null
          video_public_id: string
          watch_time?: number | null
        }
        Update: {
          created_at?: string | null
          duration?: number | null
          event_type?: string
          id?: string
          playback_time?: number | null
          progress_percent?: number | null
          referrer?: string | null
          screen_height?: number | null
          screen_width?: number | null
          session_id?: string
          signup_source?: string
          user_agent?: string | null
          video_public_id?: string
          watch_time?: number | null
        }
        Relationships: []
      }
      waitlist_admin_actions: {
        Row: {
          action_details: Json | null
          action_type: string
          admin_user_id: string
          created_at: string | null
          id: string
          new_value: Json | null
          notes: string | null
          previous_value: Json | null
          waitlist_entry_id: string
        }
        Insert: {
          action_details?: Json | null
          action_type: string
          admin_user_id: string
          created_at?: string | null
          id?: string
          new_value?: Json | null
          notes?: string | null
          previous_value?: Json | null
          waitlist_entry_id: string
        }
        Update: {
          action_details?: Json | null
          action_type?: string
          admin_user_id?: string
          created_at?: string | null
          id?: string
          new_value?: Json | null
          notes?: string | null
          previous_value?: Json | null
          waitlist_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_admin_actions_waitlist_entry_id_fkey"
            columns: ["waitlist_entry_id"]
            isOneToOne: false
            referencedRelation: "meetings_waitlist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_admin_actions_waitlist_entry_id_fkey"
            columns: ["waitlist_entry_id"]
            isOneToOne: false
            referencedRelation: "waitlist_with_rank"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_email_invites: {
        Row: {
          converted_at: string | null
          created_at: string | null
          email: string
          error_message: string | null
          id: string
          invite_status: string | null
          sent_at: string | null
          updated_at: string | null
          waitlist_entry_id: string
        }
        Insert: {
          converted_at?: string | null
          created_at?: string | null
          email: string
          error_message?: string | null
          id?: string
          invite_status?: string | null
          sent_at?: string | null
          updated_at?: string | null
          waitlist_entry_id: string
        }
        Update: {
          converted_at?: string | null
          created_at?: string | null
          email?: string
          error_message?: string | null
          id?: string
          invite_status?: string | null
          sent_at?: string | null
          updated_at?: string | null
          waitlist_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_email_invites_waitlist_entry_id_fkey"
            columns: ["waitlist_entry_id"]
            isOneToOne: false
            referencedRelation: "meetings_waitlist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_email_invites_waitlist_entry_id_fkey"
            columns: ["waitlist_entry_id"]
            isOneToOne: false
            referencedRelation: "waitlist_with_rank"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_email_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          email_body: string
          id: string
          is_active: boolean | null
          is_default: boolean | null
          subject_line: string
          template_name: string
          template_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          email_body: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          subject_line: string
          template_name: string
          template_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          email_body?: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          subject_line?: string
          template_name?: string
          template_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_email_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "waitlist_email_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "waitlist_email_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "waitlist_email_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_email_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      waitlist_invite_codes: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          updated_at: string | null
          use_count: number
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          updated_at?: string | null
          use_count?: number
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          updated_at?: string | null
          use_count?: number
        }
        Relationships: []
      }
      waitlist_onboarding_progress: {
        Row: {
          account_created_at: string | null
          completed_steps: number | null
          completion_percentage: number | null
          created_at: string | null
          crm_integrated_at: string | null
          first_meeting_synced_at: string | null
          id: string
          meeting_intelligence_used_at: string | null
          profile_completed_at: string | null
          team_invited_at: string | null
          total_steps: number
          updated_at: string | null
          user_id: string
          waitlist_entry_id: string | null
        }
        Insert: {
          account_created_at?: string | null
          completed_steps?: number | null
          completion_percentage?: number | null
          created_at?: string | null
          crm_integrated_at?: string | null
          first_meeting_synced_at?: string | null
          id?: string
          meeting_intelligence_used_at?: string | null
          profile_completed_at?: string | null
          team_invited_at?: string | null
          total_steps?: number
          updated_at?: string | null
          user_id: string
          waitlist_entry_id?: string | null
        }
        Update: {
          account_created_at?: string | null
          completed_steps?: number | null
          completion_percentage?: number | null
          created_at?: string | null
          crm_integrated_at?: string | null
          first_meeting_synced_at?: string | null
          id?: string
          meeting_intelligence_used_at?: string | null
          profile_completed_at?: string | null
          team_invited_at?: string | null
          total_steps?: number
          updated_at?: string | null
          user_id?: string
          waitlist_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_onboarding_progress_waitlist_entry_id_fkey"
            columns: ["waitlist_entry_id"]
            isOneToOne: false
            referencedRelation: "meetings_waitlist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_onboarding_progress_waitlist_entry_id_fkey"
            columns: ["waitlist_entry_id"]
            isOneToOne: false
            referencedRelation: "waitlist_with_rank"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_shares: {
        Row: {
          id: string
          platform: string
          referral_clicked: boolean | null
          referral_converted: boolean | null
          shared_at: string | null
          waitlist_entry_id: string
        }
        Insert: {
          id?: string
          platform: string
          referral_clicked?: boolean | null
          referral_converted?: boolean | null
          shared_at?: string | null
          waitlist_entry_id: string
        }
        Update: {
          id?: string
          platform?: string
          referral_clicked?: boolean | null
          referral_converted?: boolean | null
          shared_at?: string | null
          waitlist_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_shares_waitlist_entry_id_fkey"
            columns: ["waitlist_entry_id"]
            isOneToOne: false
            referencedRelation: "meetings_waitlist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_shares_waitlist_entry_id_fkey"
            columns: ["waitlist_entry_id"]
            isOneToOne: false
            referencedRelation: "waitlist_with_rank"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_id: string | null
          event_type: string
          headers: Json | null
          id: string
          next_retry_at: string | null
          payload: Json
          processed_at: string | null
          retry_count: number | null
          source: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_id?: string | null
          event_type: string
          headers?: Json | null
          id?: string
          next_retry_at?: string | null
          payload: Json
          processed_at?: string | null
          retry_count?: number | null
          source: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_id?: string | null
          event_type?: string
          headers?: Json | null
          id?: string
          next_retry_at?: string | null
          payload?: Json
          processed_at?: string | null
          retry_count?: number | null
          source?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      webhook_mirror_config: {
        Row: {
          created_at: string | null
          filter_rules: Json | null
          id: string
          is_active: boolean | null
          mirror_percentage: number | null
          source_environment: string
          target_environment: string
          updated_at: string | null
          workflow_id: string
        }
        Insert: {
          created_at?: string | null
          filter_rules?: Json | null
          id?: string
          is_active?: boolean | null
          mirror_percentage?: number | null
          source_environment: string
          target_environment: string
          updated_at?: string | null
          workflow_id: string
        }
        Update: {
          created_at?: string | null
          filter_rules?: Json | null
          id?: string
          is_active?: boolean | null
          mirror_percentage?: number | null
          source_environment?: string
          target_environment?: string
          updated_at?: string | null
          workflow_id?: string
        }
        Relationships: []
      }
      workflow_batch_windows: {
        Row: {
          created_at: string | null
          current_batch: Json | null
          current_count: number | null
          current_size: number | null
          id: string
          node_id: string
          window_closes_at: string | null
          window_size: number
          window_started_at: string | null
          window_type: string | null
          workflow_id: string
        }
        Insert: {
          created_at?: string | null
          current_batch?: Json | null
          current_count?: number | null
          current_size?: number | null
          id?: string
          node_id: string
          window_closes_at?: string | null
          window_size: number
          window_started_at?: string | null
          window_type?: string | null
          workflow_id: string
        }
        Update: {
          created_at?: string | null
          current_batch?: Json | null
          current_count?: number | null
          current_size?: number | null
          id?: string
          node_id?: string
          window_closes_at?: string | null
          window_size?: number
          window_started_at?: string | null
          window_type?: string | null
          workflow_id?: string
        }
        Relationships: []
      }
      workflow_circuit_breakers: {
        Row: {
          created_at: string | null
          failure_count: number | null
          failure_threshold: number | null
          id: string
          last_failure_at: string | null
          node_id: string
          opens_at: string | null
          state: string | null
          success_count: number | null
          success_threshold: number | null
          timeout_seconds: number | null
          updated_at: string | null
          workflow_id: string | null
        }
        Insert: {
          created_at?: string | null
          failure_count?: number | null
          failure_threshold?: number | null
          id?: string
          last_failure_at?: string | null
          node_id: string
          opens_at?: string | null
          state?: string | null
          success_count?: number | null
          success_threshold?: number | null
          timeout_seconds?: number | null
          updated_at?: string | null
          workflow_id?: string | null
        }
        Update: {
          created_at?: string | null
          failure_count?: number | null
          failure_threshold?: number | null
          id?: string
          last_failure_at?: string | null
          node_id?: string
          opens_at?: string | null
          state?: string | null
          success_count?: number | null
          success_threshold?: number | null
          timeout_seconds?: number | null
          updated_at?: string | null
          workflow_id?: string | null
        }
        Relationships: []
      }
      workflow_contracts: {
        Row: {
          created_at: string | null
          id: string
          input_schema: Json
          is_current: boolean | null
          node_id: string
          node_type: string
          output_schema: Json
          updated_at: string | null
          version: number | null
          workflow_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          input_schema?: Json
          is_current?: boolean | null
          node_id: string
          node_type: string
          output_schema?: Json
          updated_at?: string | null
          version?: number | null
          workflow_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          input_schema?: Json
          is_current?: boolean | null
          node_id?: string
          node_type?: string
          output_schema?: Json
          updated_at?: string | null
          version?: number | null
          workflow_id?: string
        }
        Relationships: []
      }
      workflow_dead_letter_queue: {
        Row: {
          created_at: string | null
          error_count: number | null
          error_message: string | null
          execution_id: string | null
          id: string
          max_retries: number | null
          next_retry_at: string | null
          resolved_at: string | null
          status: string | null
          trigger_data: Json | null
          workflow_id: string
        }
        Insert: {
          created_at?: string | null
          error_count?: number | null
          error_message?: string | null
          execution_id?: string | null
          id?: string
          max_retries?: number | null
          next_retry_at?: string | null
          resolved_at?: string | null
          status?: string | null
          trigger_data?: Json | null
          workflow_id: string
        }
        Update: {
          created_at?: string | null
          error_count?: number | null
          error_message?: string | null
          execution_id?: string | null
          id?: string
          max_retries?: number | null
          next_retry_at?: string | null
          resolved_at?: string | null
          status?: string | null
          trigger_data?: Json | null
          workflow_id?: string
        }
        Relationships: []
      }
      workflow_environment_promotions: {
        Row: {
          changes_diff: Json | null
          from_environment: string
          id: string
          promoted_at: string | null
          promoted_by: string | null
          rollback_data: Json | null
          status: string | null
          to_environment: string
          workflow_id: string
        }
        Insert: {
          changes_diff?: Json | null
          from_environment: string
          id?: string
          promoted_at?: string | null
          promoted_by?: string | null
          rollback_data?: Json | null
          status?: string | null
          to_environment: string
          workflow_id: string
        }
        Update: {
          changes_diff?: Json | null
          from_environment?: string
          id?: string
          promoted_at?: string | null
          promoted_by?: string | null
          rollback_data?: Json | null
          status?: string | null
          to_environment?: string
          workflow_id?: string
        }
        Relationships: []
      }
      workflow_environments: {
        Row: {
          config: Json | null
          created_at: string | null
          environment: string
          id: string
          is_active: boolean | null
          rate_limits: Json | null
          secrets: Json | null
          updated_at: string | null
          variables: Json | null
          webhook_urls: Json | null
          workflow_id: string
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          environment: string
          id?: string
          is_active?: boolean | null
          rate_limits?: Json | null
          secrets?: Json | null
          updated_at?: string | null
          variables?: Json | null
          webhook_urls?: Json | null
          workflow_id: string
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          environment?: string
          id?: string
          is_active?: boolean | null
          rate_limits?: Json | null
          secrets?: Json | null
          updated_at?: string | null
          variables?: Json | null
          webhook_urls?: Json | null
          workflow_id?: string
        }
        Relationships: []
      }
      workflow_executions: {
        Row: {
          action_results: Json | null
          clerk_org_id: string | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          execution_status: string
          id: string
          started_at: string | null
          trigger_data: Json | null
          trigger_type: string
          updated_at: string | null
          user_id: string
          workflow_id: string
        }
        Insert: {
          action_results?: Json | null
          clerk_org_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          execution_status?: string
          id?: string
          started_at?: string | null
          trigger_data?: Json | null
          trigger_type: string
          updated_at?: string | null
          user_id: string
          workflow_id: string
        }
        Update: {
          action_results?: Json | null
          clerk_org_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          execution_status?: string
          id?: string
          started_at?: string | null
          trigger_data?: Json | null
          trigger_type?: string
          updated_at?: string | null
          user_id?: string
          workflow_id?: string
        }
        Relationships: []
      }
      workflow_forms: {
        Row: {
          config: Json
          created_at: string | null
          created_by: string | null
          form_id: string
          id: string
          is_test: boolean | null
          updated_at: string | null
          workflow_id: string | null
        }
        Insert: {
          config?: Json
          created_at?: string | null
          created_by?: string | null
          form_id: string
          id?: string
          is_test?: boolean | null
          updated_at?: string | null
          workflow_id?: string | null
        }
        Update: {
          config?: Json
          created_at?: string | null
          created_by?: string | null
          form_id?: string
          id?: string
          is_test?: boolean | null
          updated_at?: string | null
          workflow_id?: string | null
        }
        Relationships: []
      }
      workflow_idempotency_keys: {
        Row: {
          created_at: string | null
          execution_id: string | null
          expires_at: string | null
          id: string
          idempotency_key: string
          result: Json | null
          status: string | null
          workflow_id: string
        }
        Insert: {
          created_at?: string | null
          execution_id?: string | null
          expires_at?: string | null
          id?: string
          idempotency_key: string
          result?: Json | null
          status?: string | null
          workflow_id: string
        }
        Update: {
          created_at?: string | null
          execution_id?: string | null
          expires_at?: string | null
          id?: string
          idempotency_key?: string
          result?: Json | null
          status?: string | null
          workflow_id?: string
        }
        Relationships: []
      }
      workflow_mcp_logs: {
        Row: {
          duration_ms: number | null
          error_message: string | null
          executed_at: string | null
          id: string
          mcp_server: string
          operation: string
          params: Json | null
          result: Json | null
          status: string | null
          user_id: string
          workflow_id: string | null
        }
        Insert: {
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          mcp_server: string
          operation: string
          params?: Json | null
          result?: Json | null
          status?: string | null
          user_id: string
          workflow_id?: string | null
        }
        Update: {
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          mcp_server?: string
          operation?: string
          params?: Json | null
          result?: Json | null
          status?: string | null
          user_id?: string
          workflow_id?: string | null
        }
        Relationships: []
      }
      workflow_rate_limits: {
        Row: {
          burst_size: number | null
          created_at: string | null
          current_tokens: number | null
          id: string
          last_refill_at: string | null
          limit_key: string
          node_id: string | null
          requests_per_hour: number | null
          requests_per_minute: number | null
          requests_per_second: number | null
          workflow_id: string | null
        }
        Insert: {
          burst_size?: number | null
          created_at?: string | null
          current_tokens?: number | null
          id?: string
          last_refill_at?: string | null
          limit_key: string
          node_id?: string | null
          requests_per_hour?: number | null
          requests_per_minute?: number | null
          requests_per_second?: number | null
          workflow_id?: string | null
        }
        Update: {
          burst_size?: number | null
          created_at?: string | null
          current_tokens?: number | null
          id?: string
          last_refill_at?: string | null
          limit_key?: string
          node_id?: string | null
          requests_per_hour?: number | null
          requests_per_minute?: number | null
          requests_per_second?: number | null
          workflow_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      activation_funnel_metrics: {
        Row: {
          activations_this_week: number | null
          activations_today: number | null
          fathom_connected_count: number | null
          first_meeting_synced_count: number | null
          first_proposal_generated_count: number | null
          first_summary_viewed_count: number | null
          fully_activated_count: number | null
          onboarding_completed_count: number | null
          skipped_onboarding_count: number | null
          total_users: number | null
          users_with_progress: number | null
        }
        Relationships: []
      }
      activities_with_profile: {
        Row: {
          amount: number | null
          auto_matched: boolean | null
          avatar_url: string | null
          clerk_org_id: string | null
          client_name: string | null
          company_id: string | null
          contact_id: string | null
          contact_identifier: string | null
          contact_identifier_type: string | null
          created_at: string | null
          date: string | null
          deal_id: string | null
          details: string | null
          execution_order: number | null
          id: string | null
          is_processed: boolean | null
          is_rebooking: boolean | null
          is_self_generated: boolean | null
          is_split: boolean | null
          meeting_id: string | null
          next_actions_count: number | null
          next_actions_generated_at: string | null
          original_activity_id: string | null
          outbound_type: string | null
          owner_id: string | null
          priority: string | null
          profile_avatar_url: string | null
          profile_full_name: string | null
          profile_id: string | null
          proposal_date: string | null
          quantity: number | null
          sale_date: string | null
          sales_rep: string | null
          savvycal_booking_id: string | null
          savvycal_link_id: string | null
          split_percentage: number | null
          status: string | null
          subject: string | null
          type: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_original_activity_id_fkey"
            columns: ["original_activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_original_activity_id_fkey"
            columns: ["original_activity_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activities_company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activities_contact_id"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      at_risk_users: {
        Row: {
          activation_completed_at: string | null
          email: string | null
          fathom_connected: boolean | null
          first_meeting_synced: boolean | null
          first_summary_viewed: boolean | null
          full_name: string | null
          hours_since_signup: number | null
          last_onboarding_update: string | null
          org_id: string | null
          org_name: string | null
          risk_level: string | null
          signup_date: string | null
          suggested_action: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events_with_contacts: {
        Row: {
          ai_generated: boolean | null
          ai_suggested_time: boolean | null
          all_day: boolean | null
          attendees_count: number | null
          busy_status: string | null
          calendar_id: string | null
          clerk_org_id: string | null
          color: string | null
          company_domain: string | null
          company_id: string | null
          company_name: string | null
          contact_email: string | null
          contact_id: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          creator_email: string | null
          deal_id: string | null
          description: string | null
          end_time: string | null
          etag: string | null
          external_id: string | null
          external_updated_at: string | null
          hangout_link: string | null
          html_link: string | null
          id: string | null
          location: string | null
          mcp_connection_id: string | null
          meeting_id: string | null
          meeting_prep: Json | null
          meeting_provider: string | null
          meeting_url: string | null
          org_id: string | null
          organizer_email: string | null
          original_start_time: string | null
          raw_data: Json | null
          recurrence_id: string | null
          recurrence_rule: string | null
          reminders: Json | null
          response_status: string | null
          start_time: string | null
          status: string | null
          sync_error: string | null
          sync_status: string | null
          synced_at: string | null
          title: string | null
          transparency: string | null
          updated_at: string | null
          user_id: string | null
          visibility: string | null
          workflow_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "calendar_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_mcp_connection_id_fkey"
            columns: ["mcp_connection_id"]
            isOneToOne: false
            referencedRelation: "mcp_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      client_churn_analytics: {
        Row: {
          churn_date: string | null
          churn_reason: string | null
          churn_status: string | null
          company_name: string | null
          days_until_final_billing: number | null
          final_billing_date: string | null
          id: string | null
          notice_given_date: string | null
          remaining_revenue_estimate: number | null
          status: Database["public"]["Enums"]["client_status"] | null
          subscription_amount: number | null
        }
        Insert: {
          churn_date?: string | null
          churn_reason?: string | null
          churn_status?: never
          company_name?: string | null
          days_until_final_billing?: never
          final_billing_date?: string | null
          id?: string | null
          notice_given_date?: string | null
          remaining_revenue_estimate?: never
          status?: Database["public"]["Enums"]["client_status"] | null
          subscription_amount?: number | null
        }
        Update: {
          churn_date?: string | null
          churn_reason?: string | null
          churn_status?: never
          company_name?: string | null
          days_until_final_billing?: never
          final_billing_date?: string | null
          id?: string | null
          notice_given_date?: string | null
          remaining_revenue_estimate?: never
          status?: Database["public"]["Enums"]["client_status"] | null
          subscription_amount?: number | null
        }
        Relationships: []
      }
      cron_jobs_status: {
        Row: {
          active: boolean | null
          alert_on_failure: boolean | null
          category: string | null
          description: string | null
          display_name: string | null
          failures_last_24h: number | null
          is_monitored: boolean | null
          jobid: number | null
          jobname: string | null
          last_run: Json | null
          nodename: string | null
          runs_last_24h: number | null
          schedule: string | null
        }
        Relationships: []
      }
      deal_activities_with_profile: {
        Row: {
          activity_type: string | null
          completed: boolean | null
          contact_email: string | null
          created_at: string | null
          deal_id: string | null
          due_date: string | null
          id: string | null
          is_matched: boolean | null
          notes: string | null
          profile_avatar_url: string | null
          profile_full_name: string | null
          profile_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_migration_review_details: {
        Row: {
          deal_id: string | null
          deal_name: string | null
          deal_value: number | null
          flagged_at: string | null
          original_company: string | null
          original_contact_email: string | null
          original_contact_name: string | null
          owner_email: string | null
          owner_id: string | null
          reason: string | null
          resolution_notes: string | null
          resolved_at: string | null
          review_id: string | null
          status: string | null
          suggested_company_id: string | null
          suggested_company_name: string | null
          suggested_contact_id: string | null
          suggested_contact_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_migration_reviews_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_migration_reviews_suggested_company_id_fkey"
            columns: ["suggested_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_migration_reviews_suggested_contact_id_fkey"
            columns: ["suggested_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_sentiment_trends: {
        Row: {
          avg_coach_rating: number | null
          avg_sentiment: number | null
          avg_talk_time_rep_pct: number | null
          deal_id: string | null
          last_meeting_at: string | null
          max_sentiment: number | null
          meeting_count: number | null
          min_sentiment: number | null
          previous_avg: number | null
          recent_avg: number | null
          sentiment_history: number[] | null
          trend_delta: number | null
          trend_direction: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_splits_with_users: {
        Row: {
          amount: number | null
          clerk_org_id: string | null
          created_at: string | null
          deal_id: string | null
          deal_name: string | null
          deal_owner_id: string | null
          deal_value: number | null
          email: string | null
          first_name: string | null
          full_name: string | null
          id: string | null
          last_name: string | null
          notes: string | null
          percentage: number | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_splits_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_splits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "deal_splits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "deal_splits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "deal_splits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_splits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      integration_health_summary: {
        Row: {
          error_count: number | null
          failed_count: number | null
          health_status: string | null
          integration_name: string | null
          last_test_at: string | null
          pass_rate: number | null
          passed_count: number | null
          total_tests: number | null
        }
        Relationships: []
      }
      landing_page_analytics: {
        Row: {
          campaign: string | null
          conversion_rate: number | null
          conversions: number | null
          creative_id: string | null
          date: string | null
          landing_page: string | null
          lead_capture_rate: number | null
          page_views: number | null
          partial_signups: number | null
          source: string | null
          unique_sessions: number | null
          unique_visitors: number | null
        }
        Relationships: []
      }
      latest_integration_test_results: {
        Row: {
          created_at: string | null
          duration_ms: number | null
          error_details: Json | null
          id: string | null
          integration_name: string | null
          message: string | null
          org_id: string | null
          status: string | null
          test_category: string | null
          test_name: string | null
          triggered_by: string | null
          triggered_by_user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_test_results_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_source_summary: {
        Row: {
          campaign: string | null
          channel: string | null
          converted_leads: number | null
          first_lead_at: string | null
          last_lead_at: string | null
          medium: string | null
          owner_id: string | null
          prepping_leads: number | null
          ready_leads: number | null
          source_id: string | null
          source_key: string | null
          source_name: string | null
          total_leads: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leads_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ads_analytics: {
        Row: {
          adset_id: string | null
          campaign_id: string | null
          conversions: number | null
          creative_id: string | null
          first_conversion: string | null
          landing_page: string | null
          last_conversion: string | null
          medium: string | null
          meta_campaign_id: string | null
          signups: Json[] | null
          source: string | null
          source_name: string | null
        }
        Relationships: []
      }
      meta_ads_daily_summary: {
        Row: {
          campaigns: number | null
          conversions: number | null
          creatives: number | null
          date: string | null
          landing_page: string | null
          source: string | null
        }
        Relationships: []
      }
      monthly_ai_usage: {
        Row: {
          model: string | null
          month: string | null
          provider: string | null
          request_count: number | null
          total_completion_tokens: number | null
          total_cost: number | null
          total_prompt_tokens: number | null
          total_tokens: number | null
          user_id: string | null
        }
        Relationships: []
      }
      mrr_current_view: {
        Row: {
          active_subscriptions: number | null
          currency: string | null
          total_mrr_cents: number | null
          trialing_subscriptions: number | null
        }
        Relationships: []
      }
      mrr_movement_view: {
        Row: {
          canceled_subscriptions: number | null
          change_date: string | null
          churned_mrr_cents: number | null
          currency: string | null
          new_mrr_cents: number | null
          new_subscriptions: number | null
          plan_changes: number | null
        }
        Relationships: []
      }
      notification_counts_by_user: {
        Row: {
          error_notifications: number | null
          first_notification_at: string | null
          info_notifications: number | null
          last_24_hours: number | null
          last_7_days: number | null
          last_hour: number | null
          last_notification_at: string | null
          success_notifications: number | null
          total_notifications: number | null
          unread_notifications: number | null
          user_email: string | null
          user_id: string | null
          warning_notifications: number | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      notification_flood_alerts: {
        Row: {
          alert_level: string | null
          alert_reason: string | null
          error_notifications: number | null
          last_24_hours: number | null
          last_7_days: number | null
          last_hour: number | null
          last_notification_at: string | null
          recommended_action: string | null
          total_notifications: number | null
          unread_notifications: number | null
          user_email: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      notification_rate_limit_status: {
        Row: {
          count_last_24_hours: number | null
          count_last_hour: number | null
          daily_percent_used: number | null
          daily_remaining: number | null
          hourly_percent_used: number | null
          hourly_remaining: number | null
          last_notification_attempt: string | null
          limit_status: string | null
          notification_type: string | null
          user_email: string | null
          user_id: string | null
        }
        Relationships: []
      }
      notification_type_breakdown: {
        Row: {
          affected_users: number | null
          category: string | null
          entity_type: string | null
          first_created_at: string | null
          last_24_hours_count: number | null
          last_7_days_count: number | null
          last_created_at: string | null
          last_hour_count: number | null
          notification_type: string | null
          recent_titles_sample: string | null
          total_count: number | null
          unread_count: number | null
        }
        Relationships: []
      }
      recent_notification_activity: {
        Row: {
          category: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          hours_ago: number | null
          id: string | null
          notifications_in_same_hour: number | null
          read: boolean | null
          title: string | null
          type: string | null
          user_email: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      subscription_facts_view: {
        Row: {
          billing_cycle: string | null
          cancel_at_period_end: boolean | null
          canceled_at: string | null
          cohort_month: string | null
          cohort_week: string | null
          created_at: string | null
          currency: string | null
          current_period_end: string | null
          current_period_start: string | null
          current_recurring_amount_cents: number | null
          customer_country: string | null
          discount_info: Json | null
          first_payment_at: string | null
          id: string | null
          interval_count: number | null
          is_active: boolean | null
          is_trialing: boolean | null
          last_payment_at: string | null
          normalized_mrr_cents: number | null
          org_id: string | null
          plan_id: string | null
          plan_name: string | null
          plan_slug: string | null
          recurring_interval: string | null
          started_at: string | null
          status: string | null
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          trial_start_at: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      team_meeting_analytics: {
        Row: {
          avg_coach_rating: number | null
          avg_sentiment: number | null
          avg_talk_time: number | null
          email: string | null
          first_meeting_date: string | null
          full_name: string | null
          last_meeting_date: string | null
          negative_meetings: number | null
          org_id: string | null
          positive_meetings: number | null
          total_duration_minutes: number | null
          total_meetings: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_task_list_configs: {
        Row: {
          auto_create_in_list: boolean | null
          created_at: string | null
          display_order: number | null
          google_list_id: string | null
          id: string | null
          is_primary: boolean | null
          list_title: string | null
          list_type: string | null
          priority_description: string | null
          priority_filter: string[] | null
          status_filter: string[] | null
          sync_direction: string | null
          sync_enabled: boolean | null
          task_categories: string[] | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          auto_create_in_list?: boolean | null
          created_at?: string | null
          display_order?: number | null
          google_list_id?: string | null
          id?: string | null
          is_primary?: boolean | null
          list_title?: string | null
          list_type?: never
          priority_description?: never
          priority_filter?: string[] | null
          status_filter?: string[] | null
          sync_direction?: string | null
          sync_enabled?: boolean | null
          task_categories?: string[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          auto_create_in_list?: boolean | null
          created_at?: string | null
          display_order?: number | null
          google_list_id?: string | null
          id?: string | null
          is_primary?: boolean | null
          list_title?: string | null
          list_type?: never
          priority_description?: never
          priority_filter?: string[] | null
          status_filter?: string[] | null
          sync_direction?: string | null
          sync_enabled?: boolean | null
          task_categories?: string[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_weekly_cohorts: {
        Row: {
          activation_rate: number | null
          avg_days_to_activation: number | null
          cohort_week: string | null
          fathom_connected: number | null
          fathom_rate: number | null
          first_meeting_synced: number | null
          first_summary_viewed: number | null
          fully_activated: number | null
          meeting_synced_rate: number | null
          summary_viewed_rate: number | null
          total_users: number | null
          week_number: number | null
          year: number | null
        }
        Relationships: []
      }
      v_failed_transcript_retries: {
        Row: {
          attempt_count: number | null
          completed_at: string | null
          created_at: string | null
          fathom_recording_id: string | null
          id: string | null
          last_error: string | null
          max_attempts: number | null
          meeting_id: string | null
          meeting_title: string | null
          minutes_since_last_update: number | null
          recording_id: string | null
          updated_at: string | null
          user_email: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fathom_transcript_retry_jobs_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      v_pending_transcript_retries: {
        Row: {
          attempt_count: number | null
          created_at: string | null
          fathom_recording_id: string | null
          id: string | null
          last_error: string | null
          max_attempts: number | null
          meeting_id: string | null
          meeting_title: string | null
          minutes_until_retry: number | null
          next_retry_at: string | null
          recording_id: string | null
          retry_status: string | null
          updated_at: string | null
          user_email: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fathom_transcript_retry_jobs_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      v_transcript_retry_stats: {
        Row: {
          avg_attempts_to_complete: number | null
          completed_count: number | null
          failed_count: number | null
          max_attempts_made: number | null
          pending_count: number | null
          processing_count: number | null
          ready_to_retry: number | null
          unique_meetings_with_retries: number | null
          unique_users_with_retries: number | null
        }
        Relationships: []
      }
      vsl_analytics_summary: {
        Row: {
          avg_completion_percent: number | null
          avg_watch_time: number | null
          completions: number | null
          conversions: number | null
          daily_conversions: number | null
          date: string | null
          reached_25: number | null
          reached_50: number | null
          reached_75: number | null
          signup_source: string | null
          total_plays: number | null
          total_views: number | null
          unique_plays: number | null
          unique_views: number | null
          video_public_id: string | null
        }
        Relationships: []
      }
      waitlist_with_rank: {
        Row: {
          access_granted_by: string | null
          admin_notes: string | null
          company_name: string | null
          converted_at: string | null
          created_at: string | null
          crm_other: string | null
          crm_tool: string | null
          dialer_other: string | null
          dialer_tool: string | null
          display_rank: number | null
          effective_position: number | null
          email: string | null
          full_name: string | null
          id: string | null
          is_seeded: boolean | null
          linkedin_boost_claimed: boolean | null
          linkedin_first_share_at: string | null
          linkedin_share_claimed: boolean | null
          magic_link_expires_at: string | null
          magic_link_sent_at: string | null
          meeting_recorder_other: string | null
          meeting_recorder_tool: string | null
          referral_code: string | null
          referral_count: number | null
          referred_by_code: string | null
          registration_url: string | null
          released_at: string | null
          released_by: string | null
          signup_position: number | null
          status: Database["public"]["Enums"]["waitlist_status"] | null
          task_manager_other: string | null
          task_manager_tool: string | null
          total_points: number | null
          twitter_boost_claimed: boolean | null
          updated_at: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_waitlist_access_granted_by_fkey"
            columns: ["access_granted_by"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "meetings_waitlist_access_granted_by_fkey"
            columns: ["access_granted_by"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meetings_waitlist_access_granted_by_fkey"
            columns: ["access_granted_by"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "meetings_waitlist_access_granted_by_fkey"
            columns: ["access_granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_waitlist_access_granted_by_fkey"
            columns: ["access_granted_by"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meetings_waitlist_referred_by_code_fkey"
            columns: ["referred_by_code"]
            isOneToOne: false
            referencedRelation: "meetings_waitlist"
            referencedColumns: ["referral_code"]
          },
          {
            foreignKeyName: "meetings_waitlist_referred_by_code_fkey"
            columns: ["referred_by_code"]
            isOneToOne: false
            referencedRelation: "waitlist_with_rank"
            referencedColumns: ["referral_code"]
          },
          {
            foreignKeyName: "meetings_waitlist_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "meetings_waitlist_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "at_risk_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meetings_waitlist_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "deal_activities_with_profile"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "meetings_waitlist_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_waitlist_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "team_meeting_analytics"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Functions: {
      accept_next_action_suggestion: {
        Args: { p_suggestion_id: string; p_task_data?: Json }
        Returns: string
      }
      accept_org_invitation: {
        Args: { p_token: string }
        Returns: {
          error_message: string
          org_id: string
          org_name: string
          role: string
          success: boolean
        }[]
      }
      adjust_notification_fatigue: {
        Args: { p_adjustment: number; p_user_id: string }
        Returns: undefined
      }
      aggregate_company_meeting_insights: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      aggregate_contact_meeting_insights: {
        Args: { p_contact_id: string }
        Returns: undefined
      }
      analyze_action_item_with_ai: {
        Args: { p_action_item_id: string }
        Returns: Json
      }
      apply_ai_analysis_to_task: {
        Args: {
          p_action_item_id: string
          p_confidence_score: number
          p_ideal_deadline: string
          p_reasoning: string
          p_task_type: string
        }
        Returns: boolean
      }
      approve_pipeline_recommendation: {
        Args: {
          p_notes?: string
          p_recommendation_id: string
          p_reviewed_by: string
        }
        Returns: boolean
      }
      auto_apply_pipeline_recommendations: { Args: never; Returns: number }
      auto_churn_expired_clients: { Args: never; Returns: number }
      backfill_next_actions_for_meetings: {
        Args: { p_limit?: number; p_min_date?: string }
        Returns: Json
      }
      bulk_grant_waitlist_access: {
        Args: {
          p_admin_notes?: string
          p_admin_user_id: string
          p_entry_ids: string[]
        }
        Returns: Json
      }
      calculate_activity_points: {
        Args: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          amount?: number
        }
        Returns: number
      }
      calculate_activity_trend: {
        Args: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          end_date: string
          start_date: string
          user_id: string
        }
        Returns: number
      }
      calculate_ai_cost: {
        Args: {
          p_completion_tokens: number
          p_model: string
          p_prompt_tokens: number
          p_provider: string
        }
        Returns: number
      }
      calculate_churn_rate: {
        Args: { p_currency?: string; p_end_date: string; p_start_date: string }
        Returns: {
          active_subscriptions_start: number
          currency: string
          mrr_churn_rate: number
          mrr_lost_cents: number
          mrr_start_cents: number
          period_end: string
          period_start: string
          subscriber_churn_rate: number
          subscribers_canceled: number
        }[]
      }
      calculate_close_plan_progress: {
        Args: { p_deal_id: string }
        Returns: {
          completed: number
          overdue: number
          progress_pct: number
          total: number
        }[]
      }
      calculate_contact_engagement_score: {
        Args: {
          p_avg_sentiment: number
          p_days_since_last_meeting: number
          p_total_meetings: number
        }
        Returns: number
      }
      calculate_deal_annual_value: {
        Args: { p_monthly_mrr: number; p_one_off_revenue: number }
        Returns: number
      }
      calculate_deal_clarity_score: {
        Args: { p_deal_id: string }
        Returns: {
          champion_score: number
          clarity_score: number
          economic_buyer_score: number
          next_step_score: number
          risks_score: number
          success_metric_score: number
        }[]
      }
      calculate_deal_momentum_score: {
        Args: { p_deal_id: string }
        Returns: number
      }
      calculate_deal_risk_aggregate: {
        Args: { p_deal_id: string }
        Returns: undefined
      }
      calculate_deal_total_value: {
        Args: { p_monthly_mrr: number; p_one_off_revenue: number }
        Returns: number
      }
      calculate_meeting_content_costs: {
        Args: { p_meeting_id: string }
        Returns: {
          content_cost_cents: number
          topics_cost_cents: number
          total_cost_cents: number
          total_tokens: number
        }[]
      }
      calculate_normalized_monthly_amount: {
        Args: {
          p_amount_cents: number
          p_interval: string
          p_interval_count?: number
        }
        Returns: number
      }
      calculate_realized_ltv: {
        Args: {
          p_cohort_end?: string
          p_cohort_start?: string
          p_currency?: string
        }
        Returns: {
          avg_monthly_revenue_cents: number
          cohort_month: string
          currency: string
          org_id: string
          subscription_months: number
          total_paid_cents: number
        }[]
      }
      calculate_seat_overage: {
        Args: { p_subscription_id: string }
        Returns: {
          active_seats: number
          included_seats: number
          overage_amount_cents: number
          overage_seats: number
        }[]
      }
      calculate_sentiment_trend: {
        Args: { p_company_id: string; p_contact_id?: string }
        Returns: number
      }
      calculate_split_amount: {
        Args: { p_deal_id: string; p_percentage: number }
        Returns: number
      }
      calculate_token_cost: {
        Args: {
          p_input_tokens: number
          p_model: string
          p_output_tokens: number
          p_provider: string
        }
        Returns: number
      }
      calculate_topic_relevance_score: {
        Args: { p_frequency_score: number; p_recency_score: number }
        Returns: number
      }
      calculate_trial_conversion_rate: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          avg_trial_days: number
          conversion_rate: number
          period_end: string
          period_start: string
          trials_converted: number
          trials_started: number
        }[]
      }
      calculate_win_rate: {
        Args: { end_date: string; start_date: string; user_id: string }
        Returns: number
      }
      calculate_workflow_coverage: {
        Args: { p_checklist_results: Json }
        Returns: {
          coverage_score: number
          covered_items: number
          missing_required: string[]
          required_coverage_score: number
          required_covered: number
          required_items: number
          total_items: number
        }[]
      }
      call_auto_join_scheduler: { Args: never; Returns: undefined }
      call_suggest_next_actions_async: {
        Args: {
          p_activity_id: string
          p_activity_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      can_access_org_data: { Args: { p_org_id: string }; Returns: boolean }
      can_admin_org: { Args: { p_org_id: string }; Returns: boolean }
      can_user_access_meeting_action_item: {
        Args: { p_action_item_id: string; p_user_id?: string }
        Returns: boolean
      }
      can_write_to_org: { Args: { p_org_id: string }; Returns: boolean }
      cancel_stale_notifications: { Args: never; Returns: number }
      check_cron_failures_and_notify: { Args: never; Returns: undefined }
      check_meeting_limits: {
        Args: { p_org_id: string }
        Returns: {
          can_sync_new: boolean
          historical_cutoff_date: string
          historical_meetings: number
          is_free_tier: boolean
          max_meetings_per_month: number
          meetings_remaining: number
          new_meetings_used: number
          total_meetings: number
        }[]
      }
      check_notification_floods: {
        Args: { p_alert_threshold?: string }
        Returns: Json
      }
      check_rate_limit: {
        Args: { key_hash_val: string }
        Returns: {
          allowed: boolean
          current_usage: number
          limit_value: number
        }[]
      }
      check_recording_quota: { Args: { p_org_id: string }; Returns: boolean }
      check_sentry_bridge_rate_limit: {
        Args: { p_org_id: string }
        Returns: Json
      }
      check_user_exists_by_email: {
        Args: { p_email: string }
        Returns: boolean
      }
      claim_notification_for_processing: {
        Args: { p_queue_id: string }
        Returns: boolean
      }
      claim_waitlist_boost: {
        Args: { p_entry_id: string; p_platform: string }
        Returns: Json
      }
      cleanup_expired_calendar_channels: { Args: never; Returns: number }
      cleanup_expired_fathom_oauth_states: { Args: never; Returns: undefined }
      cleanup_expired_google_oauth_states: { Args: never; Returns: undefined }
      cleanup_expired_google_tokens: { Args: never; Returns: undefined }
      cleanup_expired_hubspot_oauth_states: { Args: never; Returns: undefined }
      cleanup_expired_justcall_oauth_states: { Args: never; Returns: undefined }
      cleanup_expired_skill_outputs: { Args: never; Returns: number }
      cleanup_notification_rate_limits: { Args: never; Returns: number }
      cleanup_old_api_monitor_snapshots: { Args: never; Returns: number }
      cleanup_old_cron_logs: { Args: never; Returns: undefined }
      cleanup_old_notifications: { Args: never; Returns: undefined }
      cleanup_old_rate_limits: { Args: never; Returns: undefined }
      cleanup_old_relationship_health_history: {
        Args: { days_to_keep_hourly?: number }
        Returns: number
      }
      clear_audit_context: { Args: never; Returns: undefined }
      complete_sentry_bridge_item: {
        Args: { dev_hub_task_id: string; item_id: string; mapping_id?: string }
        Returns: undefined
      }
      complete_transcript_retry_job: {
        Args: { p_meeting_id: string }
        Returns: undefined
      }
      compute_improvement_deltas: {
        Args: { p_improvement_id: string }
        Returns: {
          actual_delta_error_rate: number
          actual_delta_requests_per_day: number
          actual_delta_requests_per_user_per_day: number
        }[]
      }
      create_api_key: {
        Args: {
          expires_days?: number
          key_name: string
          permissions_json?: Json
          rate_limit_val?: number
          user_uuid?: string
        }
        Returns: {
          api_key: string
          key_hash: string
          key_id: string
        }[]
      }
      create_clerk_user_mapping: {
        Args: {
          p_clerk_user_id: string
          p_email: string
          p_supabase_user_id: string
        }
        Returns: boolean
      }
      create_default_recording_rules: {
        Args: { p_org_id: string }
        Returns: undefined
      }
      create_hitl_approval: {
        Args: {
          p_callback_metadata?: Json
          p_callback_target?: string
          p_callback_type?: string
          p_created_by?: string
          p_expires_hours?: number
          p_metadata?: Json
          p_org_id: string
          p_original_content: Json
          p_resource_id: string
          p_resource_name: string
          p_resource_type: string
          p_slack_channel_id: string
          p_slack_message_ts: string
          p_slack_team_id: string
          p_slack_thread_ts?: string
          p_user_id: string
        }
        Returns: string
      }
      create_org_admin_notification: {
        Args: {
          p_action_text?: string
          p_action_url?: string
          p_message: string
          p_metadata?: Json
          p_org_id: string
          p_title: string
          p_type: string
        }
        Returns: string[]
      }
      create_org_for_new_user: {
        Args: { p_org_name: string; p_user_email?: string; p_user_id: string }
        Returns: string
      }
      create_profile_for_clerk_user: {
        Args: {
          p_clerk_user_id: string
          p_email: string
          p_first_name?: string
          p_full_name?: string
          p_last_name?: string
        }
        Returns: string
      }
      create_task_creation_notification: {
        Args: {
          p_meeting_id: string
          p_meeting_title: string
          p_task_count: number
          p_task_ids: string[]
          p_user_id: string
        }
        Returns: string
      }
      create_task_notification: {
        Args: {
          p_action_url?: string
          p_message: string
          p_task_id: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      create_waitlist_email_invite: {
        Args: { p_email: string; p_entry_id: string }
        Returns: Json
      }
      current_user_id: { Args: never; Returns: string }
      current_user_orgs:
        | { Args: never; Returns: string[] }
        | {
            Args: { p_user_id: string }
            Returns: {
              org_id: string
            }[]
          }
      custom_auth_uid: { Args: never; Returns: string }
      dequeue_sentry_bridge_item: {
        Args: { batch_size?: number; lock_duration_seconds?: number }
        Returns: {
          attempt_count: number
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string
          org_id: string
          processed_at: string | null
          routing_rule_id: string | null
          sentry_event_id: string
          sentry_issue_id: string
          status: string
          target_dev_hub_project_id: string
          target_owner_user_id: string | null
          target_priority: string
          ticket_payload: Json
          webhook_event_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "sentry_bridge_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      dismiss_next_action_suggestion: {
        Args: { p_feedback?: string; p_suggestion_id: string }
        Returns: boolean
      }
      enqueue_transcript_retry: {
        Args: {
          p_initial_attempt_count?: number
          p_meeting_id: string
          p_recording_id: string
          p_user_id: string
        }
        Returns: string
      }
      execute_automation_action: {
        Args: {
          rule: Database["public"]["Tables"]["user_automation_rules"]["Row"]
          trigger_data: Json
          user_id: string
        }
        Returns: Json
      }
      expire_hitl_approvals: { Args: never; Returns: number }
      expire_hitl_requests: { Args: never; Returns: number }
      expire_old_recommendations: { Args: never; Returns: number }
      expire_pending_hitl_requests: { Args: never; Returns: number }
      fail_sentry_bridge_item: {
        Args: { error_msg: string; item_id: string; move_to_dlq?: boolean }
        Returns: undefined
      }
      find_orgs_by_email_domain: {
        Args: { p_domain: string; p_user_id: string }
        Returns: {
          id: string
          member_count: number
          name: string
        }[]
      }
      find_similar_org_name: {
        Args: { normalized_name: string }
        Returns: string
      }
      generate_api_key:
        | { Args: never; Returns: string }
        | { Args: { prefix?: string }; Returns: string }
      generate_pipeline_recommendation_from_meeting: {
        Args: { p_meeting_id: string; p_user_id: string }
        Returns: string
      }
      generate_referral_code: { Args: never; Returns: string }
      get_activation_funnel: {
        Args: { p_end_date?: string; p_start_date?: string }
        Returns: {
          avg_time_to_step: unknown
          percentage: number
          step_name: string
          step_order: number
          user_count: number
        }[]
      }
      get_active_fathom_integration: {
        Args: { p_user_id: string }
        Returns: {
          access_token: string
          fathom_user_email: string
          fathom_user_id: string
          id: string
          last_sync_at: string
          refresh_token: string
          scopes: string[]
          token_expires_at: string
          user_id: string
        }[]
      }
      get_active_interventions: {
        Args: { user_id_param: string }
        Returns: {
          ai_recommendation_score: number | null
          click_count: number | null
          clicked_at: string | null
          company_id: string | null
          contact_id: string | null
          context_trigger: string
          created_at: string | null
          days_since_last_contact: number | null
          deal_id: string | null
          delivered_at: string | null
          first_open_at: string | null
          health_score_at_send: number | null
          id: string
          intervention_body: string
          intervention_channel: string
          metadata: Json | null
          open_count: number | null
          opened_at: string | null
          outcome: string | null
          outcome_notes: string | null
          personalization_data: Json | null
          recovered_at: string | null
          relationship_health_id: string
          replied_at: string | null
          response_text: string | null
          response_type: string | null
          sent_at: string | null
          status: string
          subject_line: string | null
          suggested_reply: string | null
          template_id: string | null
          template_type: string
          updated_at: string | null
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "interventions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_activity_summary: {
        Args: { end_date: string; start_date: string; user_id: string }
        Returns: {
          activity_type: string
          count: number
          points: number
          trend: number
        }[]
      }
      get_applicable_automation_rules: {
        Args: {
          p_call_type_id?: string
          p_confidence?: number
          p_org_id: string
          p_trigger_type: string
        }
        Returns: {
          action_config: Json
          action_type: string
          call_type_filter: string[] | null
          cooldown_hours: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          min_confidence: number | null
          name: string
          org_id: string
          trigger_type: string
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "pipeline_automation_rules"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_at_risk_summary: {
        Args: never
        Returns: {
          percentage: number
          risk_level: string
          user_count: number
        }[]
      }
      get_at_risk_users: {
        Args: { p_limit?: number; p_risk_level?: string }
        Returns: {
          email: string
          fathom_connected: boolean
          first_meeting_synced: boolean
          first_summary_viewed: boolean
          full_name: string
          hours_since_signup: number
          org_name: string
          risk_level: string
          signup_date: string
          suggested_action: string
          user_id: string
        }[]
      }
      get_audit_history: {
        Args: { p_limit?: number; p_record_id: string; p_table_name: string }
        Returns: {
          action: string
          audit_id: string
          changed_at: string
          changed_by: string
          changed_fields: string[]
          new_value: Json
          old_value: Json
        }[]
      }
      get_auth_provider: { Args: never; Returns: string }
      get_avg_health_change_per_day: {
        Args: { days?: number; relationship_health_id_param: string }
        Returns: number
      }
      get_avg_response_time: {
        Args: { contact_id_param: string }
        Returns: number
      }
      get_calendar_events_in_range: {
        Args: {
          p_calendar_ids?: string[]
          p_end_date: string
          p_start_date: string
          p_user_id: string
        }
        Returns: {
          all_day: boolean
          attendees_count: number
          calendar_id: string
          color: string
          company_id: string
          company_name: string
          contact_id: string
          contact_name: string
          creator_email: string
          description: string
          end_time: string
          external_id: string
          html_link: string
          id: string
          location: string
          meeting_url: string
          organizer_email: string
          raw_data: Json
          start_time: string
          status: string
          sync_status: string
          title: string
        }[]
      }
      get_changed_fields: {
        Args: { new_data: Json; old_data: Json }
        Returns: string[]
      }
      get_clerk_org_id: { Args: never; Returns: string }
      get_clerk_user_id: { Args: never; Returns: string }
      get_coaching_reference_meetings: {
        Args: {
          p_bad_meeting_ids?: string[]
          p_good_meeting_ids?: string[]
          p_user_id: string
        }
        Returns: Json
      }
      get_coaching_template_for_call_type: {
        Args: {
          p_call_type_id: string
          p_meeting_type?: string
          p_org_id: string
        }
        Returns: string
      }
      get_cohort_analysis: {
        Args: { p_weeks?: number }
        Returns: {
          activation_rate: number
          avg_days_to_activation: number
          cohort_week: string
          fathom_connected: number
          fathom_rate: number
          first_meeting_synced: number
          first_summary_viewed: number
          fully_activated: number
          meeting_synced_rate: number
          summary_viewed_rate: number
          total_users: number
          week_label: string
        }[]
      }
      get_communication_frequency: {
        Args: { contact_id_param: string; days?: number }
        Returns: number
      }
      get_competitor_analysis: {
        Args: { p_date_from?: string; p_date_to?: string; p_org_id: string }
        Returns: {
          competitor_name: string
          mention_count: number
          negative_mentions: number
          neutral_mentions: number
          positive_mentions: number
          recent_meetings: Json
        }[]
      }
      get_contact_note_stats: {
        Args: { target_contact_id: string }
        Returns: {
          last_note_date: string
          pinned_notes: number
          recent_notes: number
          total_notes: number
        }[]
      }
      get_content_triggers_for_user: {
        Args: { p_user_id: string }
        Returns: {
          context: Json
          entity_id: string
          entity_type: string
          priority: number
          trigger_type: string
        }[]
      }
      get_content_with_topics: {
        Args: { p_content_id: string }
        Returns: {
          content: string
          content_id: string
          content_type: string
          title: string
          topics: Json
        }[]
      }
      get_cron_job_history: {
        Args: { p_job_name?: string; p_limit?: number }
        Returns: {
          duration_seconds: number
          end_time: string
          jobid: number
          jobname: string
          return_message: string
          runid: number
          start_time: string
          status: string
        }[]
      }
      get_current_audit_context: {
        Args: never
        Returns: {
          impersonated_user_id: string
          is_impersonating: boolean
          original_user_id: string
        }[]
      }
      get_current_cost_rate: {
        Args: { p_model: string; p_provider: string }
        Returns: {
          input_cost_per_million: number
          output_cost_per_million: number
        }[]
      }
      get_days_since_last_contact: {
        Args: { contact_id_param: string }
        Returns: number
      }
      get_days_until_churn: {
        Args: { final_billing_date: string }
        Returns: number
      }
      get_deal_active_risks: {
        Args: { p_deal_id: string }
        Returns: {
          confidence_score: number
          description: string
          detected_at: string
          evidence: Json
          severity: string
          signal_id: string
          signal_type: string
          title: string
        }[]
      }
      get_deal_note_stats: {
        Args: { target_deal_id: string }
        Returns: {
          last_note_date: string
          pinned_notes: number
          recent_notes: number
          total_notes: number
        }[]
      }
      get_deal_truth_snapshot: {
        Args: { p_deal_id: string }
        Returns: {
          champion_strength: string
          confidence: number
          contact_name: string
          field_key: string
          next_step_date: string
          source: string
          value: string
        }[]
      }
      get_deals_needing_attention: {
        Args: {
          p_limit?: number
          p_min_clarity_score?: number
          p_org_id: string
          p_user_id?: string
        }
        Returns: {
          clarity_score: number
          close_plan_progress: number
          company_name: string
          deal_id: string
          deal_name: string
          deal_stage: string
          deal_value: number
          health_status: string
          momentum_score: number
          owner_user_id: string
          risk_level: string
        }[]
      }
      get_default_waitlist_email_template: {
        Args: { p_template_type: string }
        Returns: {
          created_at: string | null
          created_by: string | null
          description: string | null
          email_body: string
          id: string
          is_active: boolean | null
          is_default: boolean | null
          subject_line: string
          template_name: string
          template_type: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "waitlist_email_templates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_email_open_rate: {
        Args: { contact_id_param: string; days?: number }
        Returns: number
      }
      get_field_history: {
        Args: {
          p_field_name: string
          p_limit?: number
          p_record_id: string
          p_table_name: string
        }
        Returns: {
          changed_at: string
          changed_by: string
          new_value: string
          old_value: string
        }[]
      }
      get_free_tier_plan: {
        Args: never
        Returns: {
          features: Json
          id: string
          max_meetings_per_month: number
          max_users: number
          name: string
          slug: string
        }[]
      }
      get_global_topics_filtered: {
        Args: {
          p_company_ids?: string[]
          p_contact_ids?: string[]
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_offset?: number
          p_search_query?: string
          p_sort_by?: string
          p_user_id: string
        }
        Returns: {
          canonical_description: string
          canonical_title: string
          companies: string[]
          contacts: string[]
          first_seen_at: string
          id: string
          last_seen_at: string
          meeting_count: number
          relevance_score: number
          source_count: number
        }[]
      }
      get_global_topics_stats: {
        Args: { p_user_id: string }
        Returns: {
          avg_sources_per_topic: number
          newest_topic_date: string
          oldest_topic_date: string
          total_companies: number
          total_contacts: number
          total_meetings: number
          total_topics: number
        }[]
      }
      get_google_access_token: { Args: { p_user_id: string }; Returns: string }
      get_health_score_trend: {
        Args: { days?: number; relationship_health_id_param: string }
        Returns: {
          date: string
          score: number
          status: string
        }[]
      }
      get_high_risk_deals: {
        Args: { p_min_risk_level?: string; p_org_id: string }
        Returns: {
          active_signals_count: number
          company_name: string
          deal_id: string
          deal_name: string
          deal_stage: string
          deal_value: number
          owner_user_id: string
          risk_level: string
          risk_score: number
          risk_summary: string
          top_risk_signal: string
        }[]
      }
      get_highest_ghost_signal_severity: {
        Args: { relationship_health_id_param: string }
        Returns: string
      }
      get_intervention_success_rate: {
        Args: { user_id_param: string }
        Returns: {
          recovery_rate_percent: number
          response_rate_percent: number
          total_recovered: number
          total_replied: number
          total_sent: number
        }[]
      }
      get_last_communication_date: {
        Args: { contact_id_param: string }
        Returns: string
      }
      get_last_response_date: {
        Args: { contact_id_param: string }
        Returns: string
      }
      get_latest_content: {
        Args: { p_content_type: string; p_meeting_id: string }
        Returns: {
          content: string
          created_at: string
          id: string
          title: string
          version: number
        }[]
      }
      get_meeting_classification_counts: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_org_id: string
          p_owner_user_id?: string
        }
        Returns: {
          competitor_mention_count: number
          demo_request_count: number
          forward_movement_count: number
          negative_outcome_count: number
          next_steps_count: number
          objection_count: number
          positive_outcome_count: number
          pricing_discussion_count: number
          proposal_request_count: number
          total_meetings: number
        }[]
      }
      get_meeting_index_status: {
        Args: { p_user_id: string }
        Returns: {
          failed_count: number
          indexed_count: number
          last_indexed_at: string
          pending_count: number
          total_meetings: number
        }[]
      }
      get_meeting_index_status_v2: {
        Args: { p_requesting_user_id: string; p_target_user_id?: string }
        Returns: {
          failed_count: number
          indexed_count: number
          last_indexed_at: string
          pending_count: number
          total_meetings: number
        }[]
      }
      get_meeting_retry_status: {
        Args: { p_meeting_id: string }
        Returns: {
          attempt_count: number
          has_transcript: boolean
          last_error: string
          last_transcript_fetch_at: string
          max_attempts: number
          meeting_id: string
          next_retry_at: string
          retry_job_status: string
          transcript_fetch_attempts: number
        }[]
      }
      get_meeting_structured_summary: {
        Args: { p_meeting_id: string }
        Returns: Json
      }
      get_meetings_by_classification: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_filter_type: string
          p_limit?: number
          p_org_id: string
          p_owner_user_id?: string
        }
        Returns: {
          company_name: string
          competitors: Json
          meeting_date: string
          meeting_id: string
          meeting_title: string
          objections: Json
          outcome: string
          owner_name: string
          owner_user_id: string
          topics: Json
        }[]
      }
      get_meetings_for_drill_down: {
        Args: {
          p_limit?: number
          p_metric_type: string
          p_org_id: string
          p_period_days?: number
          p_user_id?: string
        }
        Returns: {
          company_name: string
          duration_minutes: number
          has_forward_movement: boolean
          has_objection: boolean
          meeting_date: string
          meeting_id: string
          outcome: string
          owner_name: string
          owner_user_id: string
          sentiment_score: number
          talk_time_pct: number
          title: string
        }[]
      }
      get_meetings_with_competitors: {
        Args: { p_date_from?: string; p_date_to?: string; p_org_id: string }
        Returns: {
          company_name: string
          competitor_mentions: Json
          meeting_date: string
          meeting_id: string
          meeting_title: string
          owner_user_id: string
        }[]
      }
      get_meetings_with_forward_movement: {
        Args: { p_date_from?: string; p_date_to?: string; p_org_id: string }
        Returns: {
          company_name: string
          meeting_date: string
          meeting_id: string
          meeting_title: string
          next_steps: Json
          owner_user_id: string
          positive_signals: Json
        }[]
      }
      get_mrr_by_date_range: {
        Args: { p_currency?: string; p_end_date: string; p_start_date: string }
        Returns: {
          active_subscriptions: number
          currency: string
          date: string
          mrr_cents: number
          trialing_subscriptions: number
        }[]
      }
      get_my_google_integration: {
        Args: never
        Returns: {
          created_at: string
          email: string
          expires_at: string
          id: string
          is_active: boolean
          scopes: string
          updated_at: string
          user_id: string
        }[]
      }
      get_next_proposal_job: {
        Args: never
        Returns: {
          action: string
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          input_data: Json
          max_retries: number | null
          output_content: string | null
          output_usage: Json | null
          retry_count: number | null
          started_at: string | null
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "proposal_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_notification_candidates_for_testing: {
        Args: { p_limit?: number; p_org_id?: string }
        Returns: {
          email: string
          full_name: string
          notification_fatigue_level: number
          org_id: string
          preferred_notification_frequency: string
          segment: string
          slack_user_id: string
          user_id: string
        }[]
      }
      get_notification_health_summary: { Args: never; Returns: Json }
      get_or_create_sync_status: {
        Args: { p_user_id: string }
        Returns: {
          id: string
          last_full_sync_at: string
          last_incremental_sync_at: string
          selected_list_id: string
          selected_list_title: string
          sync_status: string
          user_id: string
        }[]
      }
      get_org_email_label_mode: { Args: { p_org_id: string }; Returns: string }
      get_org_file_search_store: { Args: { p_org_id: string }; Returns: string }
      get_org_internal_domain: { Args: { p_org_id: string }; Returns: string }
      get_org_limits: {
        Args: { p_org_id: string }
        Returns: {
          max_ai_tokens: number
          max_meetings: number
          max_storage_mb: number
          max_users: number
        }[]
      }
      get_org_meeting_index_status: {
        Args: { p_org_id: string; p_target_user_id?: string }
        Returns: {
          failed_count: number
          indexed_count: number
          last_indexed_at: string
          pending_count: number
          total_meetings: number
        }[]
      }
      get_org_member_counts: {
        Args: { p_org_id: string }
        Returns: {
          admins: number
          members: number
          owners: number
          readonly_members: number
          total_members: number
        }[]
      }
      get_org_plan_features: { Args: { p_org_id: string }; Returns: Json }
      get_org_role: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: string
      }
      get_org_subscription_details: {
        Args: { p_org_id: string }
        Returns: {
          billing_cycle: string
          cancel_at_period_end: boolean
          currency: string
          current_period_end: string
          current_period_start: string
          features: Json
          included_seats: number
          max_meetings_per_month: number
          max_users: number
          meeting_retention_months: number
          per_seat_price: number
          plan_id: string
          plan_name: string
          plan_slug: string
          price_monthly: number
          price_yearly: number
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          subscription_id: string
          trial_ends_at: string
        }[]
      }
      get_org_team_members: {
        Args: { p_org_id: string }
        Returns: {
          email: string
          full_name: string
          indexed_count: number
          meeting_count: number
          user_id: string
        }[]
      }
      get_organization_context: {
        Args: { p_org_id: string }
        Returns: {
          confidence: number
          context_key: string
          source: string
          value: Json
          value_type: string
        }[]
      }
      get_organization_context_object: {
        Args: { p_org_id: string }
        Returns: Json
      }
      get_organization_skills_for_agent: {
        Args: { p_org_id: string }
        Returns: {
          category: string
          content: string
          frontmatter: Json
          is_enabled: boolean
          skill_key: string
        }[]
      }
      get_organization_skills_summary: {
        Args: { p_org_id: string }
        Returns: {
          category: string
          is_compiled: boolean
          is_enabled: boolean
          last_compiled_at: string
          needs_compilation: boolean
          org_version: number
          platform_version: number
          skill_id: string
          skill_name: string
        }[]
      }
      get_pending_aggregation_count: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_pending_ai_analysis: {
        Args: never
        Returns: {
          action_item_id: string
          category: string
          deadline_at: string
          meeting_summary: string
          meeting_title: string
          priority: string
          task_id: string
          title: string
        }[]
      }
      get_pending_hitl_requests: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          default_value: string
          execution_context: Json
          execution_id: string
          expires_at: string
          id: string
          options: Json
          prompt: string
          request_type: string
          sequence_key: string
          step_index: number
          timeout_action: string
          timeout_minutes: number
        }[]
      }
      get_pending_notifications: {
        Args: { p_channel?: string; p_limit?: number }
        Returns: {
          channel: string
          engagement_score: number
          metadata: Json
          notification_fatigue: number
          notification_type: string
          optimal_send_time: string
          org_id: string
          payload: Json
          preferred_frequency: string
          priority: string
          queue_id: string
          scheduled_for: string
          user_id: string
        }[]
      }
      get_pending_suggestions_count: {
        Args: { p_user_id?: string }
        Returns: number
      }
      get_pending_transcript_retry_jobs: {
        Args: { p_batch_size?: number }
        Returns: {
          attempt_count: number
          id: string
          max_attempts: number
          meeting_id: string
          next_retry_at: string
          recording_id: string
          user_id: string
        }[]
      }
      get_platform_skill: {
        Args: { p_skill_key: string }
        Returns: {
          category: string
          content_template: string
          frontmatter: Json
          id: string
          is_active: boolean
          skill_key: string
          version: number
        }[]
      }
      get_profile_for_current_user: {
        Args: never
        Returns: {
          auth_provider: string | null
          avatar_url: string | null
          bio: string | null
          clerk_user_id: string | null
          created_at: string | null
          email: string
          first_name: string | null
          id: string
          is_admin: boolean | null
          last_login_at: string | null
          last_name: string | null
          stage: string | null
          timezone: string | null
          updated_at: string | null
          week_starts_on: number | null
          working_hours_end: number | null
          working_hours_start: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_prompt_template: {
        Args: {
          p_category: string
          p_organization_id?: string
          p_user_id?: string
        }
        Returns: {
          category: string
          description: string
          id: string
          max_tokens: number
          model: string
          name: string
          source: string
          system_prompt: string
          temperature: number
          user_prompt: string
        }[]
      }
      get_public_subscription_plans: {
        Args: never
        Returns: {
          badge_text: string
          cta_text: string
          cta_url: string
          currency: string
          description: string
          display_order: number
          features: Json
          highlight_features: string[]
          id: string
          included_seats: number
          is_free_tier: boolean
          max_ai_tokens_per_month: number
          max_meetings_per_month: number
          max_storage_mb: number
          max_users: number
          meeting_retention_months: number
          name: string
          per_seat_price: number
          price_monthly: number
          price_yearly: number
          slug: string
          trial_days: number
        }[]
      }
      get_reengagement_candidates: {
        Args: { p_limit?: number; p_org_id?: string; p_segment?: string }
        Returns: {
          days_inactive: number
          email: string
          full_name: string
          last_reengagement_at: string
          last_reengagement_type: string
          org_id: string
          overall_engagement_score: number
          reengagement_attempts: number
          segment: string
          slack_user_id: string
          user_id: string
        }[]
      }
      get_reengagement_stats: {
        Args: { p_days?: number; p_org_id?: string }
        Returns: {
          opened_count: number
          returned_count: number
          segment: string
          sent_count: number
          success_rate: number
          total_candidates: number
        }[]
      }
      get_rep_scorecard_stats: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_org_id: string
          p_user_id?: string
        }
        Returns: {
          avg_discovery_questions: number
          avg_overall_score: number
          avg_talk_ratio: number
          grade_distribution: Json
          meeting_count: number
          next_steps_rate: number
          rep_user_id: string
        }[]
      }
      get_response_rate: {
        Args: { contact_id_param: string; days?: number }
        Returns: number
      }
      get_scorecard_template_for_type: {
        Args: { p_meeting_type: string; p_org_id: string }
        Returns: Json
      }
      get_sentiment_trend: {
        Args: { contact_id_param: string }
        Returns: string
      }
      get_sequence_executions: {
        Args: {
          p_is_simulation?: boolean
          p_limit?: number
          p_organization_id?: string
          p_sequence_key?: string
          p_status?: string
        }
        Returns: {
          completed_at: string
          duration_ms: number
          error_message: string
          failed_step_index: number
          final_output: Json
          id: string
          input_context: Json
          is_simulation: boolean
          organization_id: string
          sequence_key: string
          started_at: string
          status: string
          step_results: Json
          user_id: string
        }[]
      }
      get_share_stats: {
        Args: { entry_id: string }
        Returns: {
          clicks: number
          conversion_rate: number
          conversions: number
          copy_shares: number
          email_shares: number
          linkedin_shares: number
          total_shares: number
          twitter_shares: number
        }[]
      }
      get_skills_needing_compilation: {
        Args: never
        Returns: {
          org_skill_id: string
          organization_id: string
          platform_content: string
          platform_frontmatter: Json
          platform_skill_id: string
          platform_version: number
          skill_key: string
          user_overrides: Json
        }[]
      }
      get_skills_needing_recompile: {
        Args: { p_org_id?: string }
        Returns: {
          organization_id: string
          platform_skill_id: string
          platform_version: number
          skill_key: string
        }[]
      }
      get_slack_org_settings_public: {
        Args: { p_org_id: string }
        Returns: {
          connected_at: string
          connected_by: string
          id: string
          is_connected: boolean
          org_id: string
          slack_team_id: string
          slack_team_name: string
        }[]
      }
      get_status_change_count: {
        Args: { days?: number; relationship_health_id_param: string }
        Returns: number
      }
      get_stuck_waitlist_onboarding_users: {
        Args: never
        Returns: {
          completed_steps: number
          completion_percentage: number
          days_since_created: number
          email: string
          last_step_completed: string
          last_step_date: string
          name: string
          user_id: string
        }[]
      }
      get_subscription_retention_cohorts: {
        Args: {
          p_cohort_end: string
          p_cohort_start: string
          p_retention_months?: number[]
        }
        Returns: {
          cohort_month: string
          cohort_size: number
          mrr_retained_cents: number
          retained_count: number
          retention_month: number
          retention_rate: number
        }[]
      }
      get_supabase_id_for_clerk_user: {
        Args: { p_clerk_user_id: string }
        Returns: string
      }
      get_system_config: { Args: { p_key: string }; Returns: string }
      get_task_depth: { Args: { task_id: string }; Returns: number }
      get_task_target_lists: {
        Args: { p_category?: string; p_priority: string; p_user_id: string }
        Returns: {
          config_id: string
          google_list_id: string
          list_title: string
        }[]
      }
      get_team_aggregates_with_comparison: {
        Args: { p_org_id: string; p_period_days?: number }
        Returns: {
          coach_rating_change_pct: number
          current_avg_coach_rating: number
          current_avg_sentiment: number
          current_avg_talk_time: number
          current_forward_movement_count: number
          current_negative_count: number
          current_objection_count: number
          current_positive_count: number
          current_positive_outcome_count: number
          current_team_members: number
          current_total_duration: number
          current_total_meetings: number
          forward_movement_change_pct: number
          meetings_change_pct: number
          positive_outcome_change_pct: number
          previous_avg_coach_rating: number
          previous_avg_sentiment: number
          previous_avg_talk_time: number
          previous_forward_movement_count: number
          previous_positive_count: number
          previous_positive_outcome_count: number
          previous_total_meetings: number
          sentiment_change_pct: number
          talk_time_change_pct: number
        }[]
      }
      get_team_comparison_matrix: {
        Args: { p_org_id: string; p_period_days?: number }
        Returns: {
          avatar_url: string
          avg_coach_rating: number
          avg_sentiment: number
          avg_talk_time: number
          forward_movement_rate: number
          positive_outcome_rate: number
          total_meetings: number
          trend_data: Json
          user_email: string
          user_id: string
          user_name: string
        }[]
      }
      get_team_members_with_connected_accounts: {
        Args: never
        Returns: {
          email: string
          full_name: string
          indexed_count: number
          meeting_count: number
          user_id: string
        }[]
      }
      get_team_members_with_meetings: {
        Args: never
        Returns: {
          email: string
          full_name: string
          indexed_count: number
          meeting_count: number
          user_id: string
        }[]
      }
      get_team_quality_signals: {
        Args: { p_org_id: string; p_period_days?: number; p_user_id?: string }
        Returns: {
          avg_coach_rating: number
          avg_sentiment: number
          avg_talk_time: number
          classified_meetings: number
          competitor_mention_count: number
          forward_movement_count: number
          forward_movement_rate: number
          negative_outcome_count: number
          neutral_outcome_count: number
          objection_count: number
          objection_rate: number
          positive_outcome_count: number
          positive_outcome_rate: number
          pricing_discussion_count: number
          total_meetings: number
          user_email: string
          user_id: string
          user_name: string
        }[]
      }
      get_team_scorecard_leaderboard: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_org_id: string
        }
        Returns: {
          avg_score: number
          improvement_trend: number
          meeting_count: number
          rep_name: string
          rep_user_id: string
          top_improvement_area: string
          top_strength: string
        }[]
      }
      get_team_time_series_metrics: {
        Args: {
          p_granularity?: string
          p_org_id: string
          p_period_days?: number
          p_user_id?: string
        }
        Returns: {
          avg_coach_rating: number
          avg_sentiment: number
          avg_talk_time: number
          forward_movement_count: number
          meeting_count: number
          negative_count: number
          period_start: string
          positive_count: number
          total_duration: number
          user_id: string
          user_name: string
        }[]
      }
      get_top_objections: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_org_id: string
        }
        Returns: {
          category: string
          objection: string
          occurrence_count: number
          resolution_rate: number
          resolved_count: number
          sample_meetings: Json
        }[]
      }
      get_topic_sources_with_details: {
        Args: { p_global_topic_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          company_name: string
          contact_name: string
          fathom_url: string
          meeting_date: string
          meeting_id: string
          meeting_title: string
          similarity_score: number
          timestamp_seconds: number
          topic_description: string
          topic_title: string
        }[]
      }
      get_trial_status: {
        Args: { p_org_id: string }
        Returns: {
          days_remaining: number
          has_payment_method: boolean
          is_trialing: boolean
          trial_ends_at: string
          trial_start_at: string
        }[]
      }
      get_unanswered_outbound_count: {
        Args: { contact_id_param: string; days?: number }
        Returns: number
      }
      get_unprocessed_billing_events: {
        Args: { p_limit?: number; p_provider?: string }
        Returns: {
          event_type: string
          id: string
          occurred_at: string
          org_id: string
          payload: Json
          provider: string
          provider_event_id: string
        }[]
      }
      get_unread_notification_count: { Args: never; Returns: number }
      get_unread_sentiment_alert_count: { Args: never; Returns: number }
      get_unresolved_ghost_signals_count: {
        Args: { relationship_health_id_param: string }
        Returns: number
      }
      get_user_active_org: { Args: never; Returns: string }
      get_user_api_keys: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          expires_at: string
          id: string
          is_active: boolean
          key_preview: string
          last_used: string
          name: string
          permissions: Json
          rate_limit: number
          usage_count: number
        }[]
      }
      get_user_feature_model_config: {
        Args: { p_feature_key: string; p_user_id: string }
        Returns: {
          is_enabled: boolean
          max_tokens: number
          model: string
          provider: string
          temperature: number
        }[]
      }
      get_user_google_integration: {
        Args: { p_user_id: string }
        Returns: {
          access_token: string
          clerk_org_id: string | null
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          is_active: boolean | null
          last_token_refresh: string | null
          refresh_token: string | null
          scopes: string
          token_status: string | null
          updated_at: string | null
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "google_integrations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_id_from_activity: {
        Args: { p_activity_id: string; p_activity_type: string }
        Returns: string
      }
      get_user_id_from_email: { Args: { email_input: string }; Returns: string }
      get_user_notification_counts: {
        Args: { p_user_id: string }
        Returns: {
          day_count: number
          hour_count: number
          last_sent_at: string
        }[]
      }
      get_user_org_id:
        | { Args: never; Returns: string }
        | { Args: { p_user_id: string }; Returns: string }
      get_user_org_ids: { Args: { p_user_id: string }; Returns: string[] }
      get_user_org_role: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: string
      }
      get_user_orgs_with_roles: {
        Args: never
        Returns: {
          member_since: string
          org_id: string
          org_name: string
          role: string
        }[]
      }
      get_user_pending_approvals: {
        Args: { p_limit?: number; p_org_id?: string; p_user_id: string }
        Returns: {
          actioned_at: string | null
          actioned_by: string | null
          callback_metadata: Json | null
          callback_target: string | null
          callback_type: string | null
          created_at: string | null
          created_by: string | null
          edited_content: Json | null
          expires_at: string | null
          id: string
          metadata: Json | null
          org_id: string
          original_content: Json
          resource_id: string
          resource_name: string | null
          resource_type: string
          response: Json | null
          slack_channel_id: string
          slack_message_ts: string
          slack_team_id: string
          slack_thread_ts: string | null
          status: string
          updated_at: string | null
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "hitl_pending_approvals"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_primary_org: { Args: never; Returns: string }
      get_user_timezone_from_calendar: {
        Args: { p_user_id: string }
        Returns: string
      }
      get_user_uuid_from_clerk: { Args: never; Returns: string }
      get_users_due_for_feedback: {
        Args: { p_limit?: number; p_org_id?: string }
        Returns: {
          days_since_last_feedback: number
          notifications_since_last_feedback: number
          org_id: string
          reason: string
          slack_user_id: string
          user_id: string
        }[]
      }
      get_users_with_targets: {
        Args: never
        Returns: {
          avatar_url: string
          created_at: string
          email: string
          first_name: string
          id: string
          is_admin: boolean
          last_name: string
          last_sign_in_at: string
          stage: string
          targets: Json
        }[]
      }
      get_waitlist_analytics: { Args: never; Returns: Json }
      get_waitlist_onboarding_analytics: { Args: never; Returns: Json }
      handle_hitl_response: {
        Args: {
          p_request_id: string
          p_response_context?: Json
          p_response_value: string
        }
        Returns: Json
      }
      has_notification_flood: { Args: never; Returns: boolean }
      hash_api_key: { Args: { key_text: string }; Returns: string }
      hubspot_dequeue_jobs: {
        Args: { p_limit?: number; p_org_id?: string }
        Returns: {
          attempts: number
          clerk_org_id: string | null
          created_at: string | null
          dedupe_key: string | null
          id: string
          job_type: string
          last_error: string | null
          max_attempts: number
          org_id: string
          payload: Json
          priority: number
          run_after: string
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "hubspot_sync_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      hubspot_release_worker_lock: { Args: never; Returns: boolean }
      hubspot_try_acquire_worker_lock: { Args: never; Returns: boolean }
      increment_invite_code_usage: {
        Args: { code_value: string }
        Returns: undefined
      }
      increment_notification_count: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      increment_proposal_views: {
        Args: { p_share_token: string }
        Returns: undefined
      }
      increment_recording_usage: {
        Args: {
          p_duration_seconds?: number
          p_org_id: string
          p_period?: string
          p_storage_bytes?: number
        }
        Returns: {
          created_at: string | null
          id: string
          org_id: string
          period_end: string
          period_start: string
          recordings_count: number | null
          recordings_limit: number | null
          storage_used_bytes: number | null
          total_duration_seconds: number | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "recording_usage"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      increment_sentry_bridge_metrics: {
        Args: {
          p_date: string
          p_errors?: number
          p_org_id: string
          p_processing_time_ms?: number
          p_tickets_created?: number
          p_tickets_updated?: number
        }
        Returns: undefined
      }
      increment_source_count: { Args: { topic_id: string }; Returns: number }
      increment_voice_recording_views: {
        Args: { p_share_token: string }
        Returns: undefined
      }
      initialize_deal_close_plan: {
        Args: { p_deal_id: string; p_org_id: string; p_owner_id?: string }
        Returns: undefined
      }
      initialize_user_engagement_metrics: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_optimized: { Args: never; Returns: boolean }
      is_clerk_admin: { Args: never; Returns: boolean }
      is_clerk_authenticated: { Args: never; Returns: boolean }
      is_internal_assignee: { Args: { email_input: string }; Returns: boolean }
      is_org_member: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: boolean
      }
      is_org_owner: { Args: { p_org_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_platform_admin_for_testing: { Args: never; Returns: boolean }
      is_service_role: { Args: never; Returns: boolean }
      is_super_admin:
        | { Args: never; Returns: boolean }
        | { Args: { p_user_id: string }; Returns: boolean }
      is_task_from_meeting: { Args: { p_task_id: string }; Returns: boolean }
      is_user_admin: { Args: { user_id: string }; Returns: boolean }
      link_profile_to_clerk_user: {
        Args: { p_clerk_user_id: string; p_profile_id: string }
        Returns: boolean
      }
      log_api_request: {
        Args: {
          p_api_key_id: string
          p_body: Json
          p_endpoint: string
          p_headers: Json
          p_method: string
          p_response_body: Json
          p_status_code: number
          p_user_id: string
        }
        Returns: undefined
      }
      log_integration_sync: {
        Args: {
          p_batch_id?: string
          p_direction?: string
          p_entity_id?: string
          p_entity_name?: string
          p_entity_type?: string
          p_error_message?: string
          p_integration_name?: string
          p_metadata?: Json
          p_operation?: string
          p_org_id?: string
          p_status?: string
          p_user_id?: string
        }
        Returns: string
      }
      log_user_activity_event: {
        Args: {
          p_action_detail?: string
          p_entity_id?: string
          p_entity_type?: string
          p_event_category?: string
          p_event_source: string
          p_event_type: string
          p_metadata?: Json
          p_org_id: string
          p_session_id?: string
          p_user_id: string
        }
        Returns: string
      }
      map_deal_activity_to_main_activity: {
        Args: { deal_activity_type: string }
        Returns: string
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_billing_event_processed: {
        Args: { p_error?: string; p_id: string }
        Returns: undefined
      }
      mark_notification_failed: {
        Args: { p_error_message: string; p_queue_id: string }
        Returns: undefined
      }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: boolean
      }
      mark_notification_sent: {
        Args: { p_interaction_id?: string; p_queue_id: string }
        Returns: undefined
      }
      mark_onboarding_complete: {
        Args: { p_org_id: string }
        Returns: undefined
      }
      mark_sentiment_alert_read: {
        Args: { p_alert_id: string }
        Returns: undefined
      }
      mark_skill_compiled: {
        Args: {
          p_compiled_content: string
          p_compiled_frontmatter: Json
          p_org_skill_id: string
          p_platform_skill_id: string
          p_platform_version: number
        }
        Returns: boolean
      }
      mark_waitlist_onboarding_step: {
        Args: { p_step: string; p_user_id: string }
        Returns: boolean
      }
      meeting_needs_transcript_retry: {
        Args: { meeting_row: Database["public"]["Tables"]["meetings"]["Row"] }
        Returns: boolean
      }
      merge_global_topics: {
        Args: { p_source_topic_id: string; p_target_topic_id: string }
        Returns: boolean
      }
      migrate_deal_entities: {
        Args: { deal_record: Record<string, unknown> }
        Returns: Json
      }
      migrate_existing_list_configs: { Args: never; Returns: undefined }
      normalize_org_name: { Args: { raw_name: string }; Returns: string }
      notify_api_monitor_improvements: { Args: never; Returns: undefined }
      notify_overdue_tasks: { Args: never; Returns: Json }
      notify_upcoming_task_deadlines: { Args: never; Returns: Json }
      org_has_feature: {
        Args: { p_feature_key: string; p_org_id: string }
        Returns: boolean
      }
      process_hitl_action: {
        Args: {
          p_action: string
          p_actioned_by: string
          p_approval_id: string
          p_edited_content?: Json
          p_response?: Json
        }
        Returns: {
          actioned_at: string | null
          actioned_by: string | null
          callback_metadata: Json | null
          callback_target: string | null
          callback_type: string | null
          created_at: string | null
          created_by: string | null
          edited_content: Json | null
          expires_at: string | null
          id: string
          metadata: Json | null
          org_id: string
          original_content: Json
          resource_id: string
          resource_name: string | null
          resource_type: string
          response: Json | null
          slack_channel_id: string
          slack_message_ts: string
          slack_team_id: string
          slack_thread_ts: string | null
          status: string
          updated_at: string | null
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "hitl_pending_approvals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      queue_notification: {
        Args: {
          p_channel: string
          p_dedupe_key?: string
          p_dedupe_window_minutes?: number
          p_metadata?: Json
          p_notification_type: string
          p_org_id: string
          p_payload: Json
          p_priority?: string
          p_related_entity_id?: string
          p_related_entity_type?: string
          p_scheduled_for?: string
          p_send_deadline?: string
          p_user_id: string
        }
        Returns: string
      }
      reanalyze_action_items_with_ai: {
        Args: { p_meeting_id?: string }
        Returns: Json
      }
      reconcile_billing_subscriptions: { Args: never; Returns: undefined }
      record_activation_event: {
        Args: { p_event_data?: Json; p_event_type: string; p_user_id: string }
        Returns: string
      }
      record_email_send: {
        Args: {
          p_email_type: string
          p_encharge_message_id?: string
          p_journey_id: string
          p_metadata?: Json
          p_to_email: string
          p_user_id: string
        }
        Returns: string
      }
      record_notification_interaction: {
        Args: {
          p_delivered_via: string
          p_notification_id?: string
          p_notification_type: string
          p_org_id: string
          p_slack_notification_sent_id?: string
          p_user_id: string
        }
        Returns: string
      }
      record_notification_preference_feedback: {
        Args: { p_feedback_value: string; p_user_id: string }
        Returns: undefined
      }
      record_reengagement_attempt: {
        Args: {
          p_channel: string
          p_org_id: string
          p_reengagement_type: string
          p_trigger_context?: Json
          p_trigger_entity_id?: string
          p_trigger_entity_type?: string
          p_trigger_type?: string
          p_user_id: string
        }
        Returns: string
      }
      record_reengagement_response: {
        Args: { p_action: string; p_action_detail?: string; p_log_id: string }
        Returns: undefined
      }
      record_usage_event: {
        Args: {
          p_event_subtype?: string
          p_event_type: string
          p_metadata?: Json
          p_org_id: string
          p_quantity?: number
          p_user_id: string
        }
        Returns: string
      }
      refresh_deal_health_scores: {
        Args: { p_max_age_hours?: number; p_user_id: string }
        Returns: {
          deal_id: string
          health_score: number
          health_status: string
          updated: boolean
        }[]
      }
      refresh_meeting_aggregate_metrics: {
        Args: {
          p_org_id: string
          p_period_start: string
          p_period_type: string
        }
        Returns: undefined
      }
      refresh_relationship_health_scores: {
        Args: { p_max_age_hours?: number; p_user_id: string }
        Returns: {
          contact_id: string
          health_score: number
          health_status: string
          updated: boolean
        }[]
      }
      regenerate_next_actions_for_activity: {
        Args: { p_activity_id: string; p_activity_type: string }
        Returns: Json
      }
      reject_pipeline_recommendation: {
        Args: {
          p_notes?: string
          p_recommendation_id: string
          p_reviewed_by: string
        }
        Returns: boolean
      }
      rename_user_organization: {
        Args: { p_new_name: string }
        Returns: {
          error_message: string
          org_id: string
          org_name: string
          success: boolean
        }[]
      }
      resend_waitlist_magic_link: {
        Args: { p_admin_user_id: string; p_entry_id: string }
        Returns: Json
      }
      reset_prompt_to_default: {
        Args: { p_category: string }
        Returns: boolean
      }
      resolve_deal_migration_review: {
        Args: {
          p_company_id: string
          p_contact_id: string
          p_notes?: string
          p_resolved_by: string
          p_review_id: string
        }
        Returns: boolean
      }
      resolve_fathom_user_to_sixty: {
        Args: { p_fathom_email: string; p_org_id: string }
        Returns: string
      }
      respond_to_hitl_request: {
        Args: {
          p_request_id: string
          p_response_channel?: string
          p_response_context?: Json
          p_response_value: string
        }
        Returns: boolean
      }
      retry_roadmap_sync: {
        Args: { suggestion_id_param: string }
        Returns: undefined
      }
      save_compiled_organization_skill: {
        Args: {
          p_compiled_content: string
          p_compiled_frontmatter: Json
          p_org_id: string
          p_platform_skill_id: string
          p_platform_version: number
          p_skill_key: string
        }
        Returns: string
      }
      save_organization_skill: {
        Args: {
          p_ai_generated?: boolean
          p_change_reason?: string
          p_config: Json
          p_org_id: string
          p_skill_id: string
          p_skill_name: string
          p_user_id: string
        }
        Returns: string
      }
      save_prompt_template: {
        Args: {
          p_category: string
          p_description?: string
          p_is_public?: boolean
          p_max_tokens?: number
          p_model?: string
          p_name: string
          p_organization_id?: string
          p_system_prompt: string
          p_temperature?: number
          p_user_prompt: string
        }
        Returns: string
      }
      search_meetings_by_owner: {
        Args: {
          p_company_id?: string
          p_date_from?: string
          p_date_to?: string
          p_has_action_items?: boolean
          p_limit?: number
          p_owner_user_id?: string
          p_sentiment?: string
        }
        Returns: {
          company_name: string
          has_action_items: boolean
          meeting_date: string
          meeting_id: string
          owner_name: string
          owner_user_id: string
          sentiment_score: number
          title: string
        }[]
      }
      seed_default_call_types: {
        Args: { p_org_id: string }
        Returns: undefined
      }
      set_audit_context: {
        Args: {
          p_impersonated_user_id?: string
          p_is_impersonating?: boolean
          p_original_user_id?: string
        }
        Returns: undefined
      }
      set_system_config: {
        Args: { p_description?: string; p_key: string; p_value: string }
        Returns: undefined
      }
      should_create_notification: {
        Args: {
          p_max_per_day?: number
          p_max_per_hour?: number
          p_notification_type: string
          p_user_id: string
        }
        Returns: boolean
      }
      should_request_feedback: {
        Args: { p_user_id: string }
        Returns: {
          days_since_last_feedback: number
          notifications_since_last_feedback: number
          reason: string
          should_request: boolean
        }[]
      }
      sync_action_item_to_task: {
        Args: { action_item_id: string }
        Returns: string
      }
      sync_playwright_test_user: { Args: never; Returns: undefined }
      sync_task_to_action_item: {
        Args: { task_id_input: string }
        Returns: string
      }
      toggle_topic_archive: {
        Args: { p_archive: boolean; p_topic_id: string }
        Returns: boolean
      }
      track_waitlist_link_share: {
        Args: { p_entry_id: string; p_platform: string }
        Returns: Json
      }
      trigger_all_task_notifications: { Args: never; Returns: Json }
      trigger_fathom_hourly_sync: { Args: never; Returns: undefined }
      update_notification_interaction: {
        Args: {
          p_action: string
          p_action_taken?: string
          p_feedback_rating?: string
          p_interaction_id: string
        }
        Returns: undefined
      }
      update_subscription_facts: {
        Args: {
          p_customer_country?: string
          p_discount_info?: Json
          p_interval: string
          p_interval_count?: number
          p_recurring_amount_cents: number
          p_subscription_id: string
        }
        Returns: undefined
      }
      update_template_performance: {
        Args: {
          clicked?: boolean
          opened?: boolean
          recovered?: boolean
          replied?: boolean
          response_time_hours?: number
          template_id_param: string
        }
        Returns: undefined
      }
      update_user_timezone: {
        Args: { p_timezone: string; p_user_id: string }
        Returns: undefined
      }
      upsert_deal_clarity_score: {
        Args: { p_deal_id: string; p_org_id: string }
        Returns: undefined
      }
      upsert_organization_context: {
        Args: {
          p_confidence?: number
          p_context_key: string
          p_org_id: string
          p_source: string
          p_value: Json
          p_value_type: string
        }
        Returns: string
      }
      user_org_ids: { Args: { p_user_id: string }; Returns: string[] }
      user_owns_execution: {
        Args: { p_execution_id: string }
        Returns: boolean
      }
      user_owns_workflow: { Args: { p_workflow_id: string }; Returns: boolean }
      user_shares_org_with: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      users_share_organization: {
        Args: { user_a: string; user_b: string }
        Returns: boolean
      }
      validate_api_key:
        | {
            Args: { key_text: string }
            Returns: {
              is_active: boolean
              is_expired: boolean
              is_valid: boolean
              permissions: Json
              rate_limit: number
              user_id: string
            }[]
          }
        | {
            Args: { params: Json }
            Returns: {
              is_active: boolean
              is_expired: boolean
              is_valid: boolean
              permissions: string[]
              rate_limit: number
              user_id: string
            }[]
          }
      validate_api_key_simple: {
        Args: { key_text: string }
        Returns: {
          is_active: boolean
          is_expired: boolean
          is_valid: boolean
          permissions: Json
          rate_limit: number
          user_id: string
        }[]
      }
      validate_org_access: {
        Args: { p_org_id: string; p_require_write?: boolean }
        Returns: boolean
      }
      was_email_sent: {
        Args: {
          p_email_type: string
          p_hours_window?: number
          p_user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      activity_priority: "low" | "medium" | "high"
      activity_status: "pending" | "completed" | "cancelled" | "no_show"
      activity_type:
        | "outbound"
        | "meeting"
        | "proposal"
        | "sale"
        | "fathom_meeting"
      client_status:
        | "active"
        | "churned"
        | "paused"
        | "signed"
        | "deposit_paid"
        | "notice_given"
      meeting_processing_status:
        | "pending"
        | "processing"
        | "complete"
        | "failed"
      member_role: "member" | "leader" | "admin"
      waitlist_status: "pending" | "released" | "declined" | "converted"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_priority: ["low", "medium", "high"],
      activity_status: ["pending", "completed", "cancelled", "no_show"],
      activity_type: [
        "outbound",
        "meeting",
        "proposal",
        "sale",
        "fathom_meeting",
      ],
      client_status: [
        "active",
        "churned",
        "paused",
        "signed",
        "deposit_paid",
        "notice_given",
      ],
      meeting_processing_status: [
        "pending",
        "processing",
        "complete",
        "failed",
      ],
      member_role: ["member", "leader", "admin"],
      waitlist_status: ["pending", "released", "declined", "converted"],
    },
  },
} as const
