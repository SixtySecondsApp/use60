import React from 'react';
import {
  CheckCircle,
  Clock,
  AlertCircle,
  Building2,
  Users,
  Briefcase,
  MapPin,
  Cpu,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ICPProfile } from '@/lib/types/prospecting';

// ---------------------------------------------------------------------------
// Criteria Section
// ---------------------------------------------------------------------------

function CriteriaSection({ label, items, icon }: { label: string; items: string[]; icon: React.ReactNode }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-zinc-400">
        {icon}
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Badge key={item} variant="outline" className="text-xs">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ApprovalViewProps {
  profile: ICPProfile;
  onApprove: (profile: ICPProfile) => void;
  onReject: (profile: ICPProfile) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApprovalView({ profile, onApprove, onReject }: ApprovalViewProps) {
  const c = profile.criteria;
  const isPendingApproval = profile.status === 'pending_approval';
  const isApproved = profile.status === 'approved' || profile.status === 'active';

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      {isPendingApproval && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3">
          <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
            Awaiting Approval
          </span>
        </div>
      )}

      {isApproved && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3">
          <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Approved
          </span>
          {profile.updated_at && (
            <span className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
              {new Date(profile.updated_at).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {/* Profile Summary */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">{profile.name}</h3>
        {profile.description && (
          <p className="mt-1 text-sm text-gray-600 dark:text-zinc-400">{profile.description}</p>
        )}
      </div>

      {/* Target Provider */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">Provider:</span>
        <Badge variant="outline" className="text-xs">
          {profile.target_provider === 'apollo' ? 'Apollo' : profile.target_provider === 'ai_ark' ? 'AI Ark' : 'Apollo + AI Ark'}
        </Badge>
      </div>

      {/* Criteria Breakdown */}
      <div className="space-y-4 rounded-lg border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/50 p-4">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Targeting Criteria</h4>

        <CriteriaSection
          label="Industries"
          items={c.industries ?? []}
          icon={<Building2 className="h-3 w-3" />}
        />

        <CriteriaSection
          label="Seniority"
          items={c.seniority_levels ?? []}
          icon={<Users className="h-3 w-3" />}
        />

        <CriteriaSection
          label="Departments"
          items={c.departments ?? []}
          icon={<Briefcase className="h-3 w-3" />}
        />

        <CriteriaSection
          label="Title Keywords"
          items={c.title_keywords ?? []}
          icon={<Briefcase className="h-3 w-3" />}
        />

        <CriteriaSection
          label="Locations"
          items={[
            ...(c.location_countries ?? []),
            ...(c.location_regions ?? []),
            ...(c.location_cities ?? []),
          ]}
          icon={<MapPin className="h-3 w-3" />}
        />

        <CriteriaSection
          label="Technologies"
          items={c.technology_keywords ?? []}
          icon={<Cpu className="h-3 w-3" />}
        />

        {c.employee_ranges?.length ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-zinc-400">
              <Users className="h-3 w-3" />
              Employee Count
            </div>
            <div className="flex flex-wrap gap-1.5">
              {c.employee_ranges.map((r, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {r.min.toLocaleString()} - {r.max.toLocaleString()}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        {c.funding_stages?.length ? (
          <CriteriaSection
            label="Funding Stages"
            items={c.funding_stages}
            icon={<AlertCircle className="h-3 w-3" />}
          />
        ) : null}
      </div>

      {/* Last Test Results */}
      {profile.last_tested_at && (
        <div className="rounded-lg border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/50 p-4">
          <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-zinc-100">
            Last Test Results
          </h4>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-gray-600 dark:text-zinc-400">
              <Clock className="mr-1 inline h-3.5 w-3.5" />
              {new Date(profile.last_tested_at).toLocaleDateString()}
            </div>
            {profile.last_test_result_count != null && (
              <div className="font-semibold text-gray-900 dark:text-zinc-100">
                {profile.last_test_result_count.toLocaleString()} results
              </div>
            )}
          </div>
        </div>
      )}

      {/* Approval Actions */}
      {isPendingApproval && (
        <div className="flex items-center gap-3 border-t border-gray-200 dark:border-zinc-800 pt-4">
          <Button
            onClick={() => onApprove(profile)}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            <CheckCircle className="h-4 w-4" />
            Approve
          </Button>
          <Button
            variant="outline"
            onClick={() => onReject(profile)}
            className="gap-2 text-amber-600 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-500/30 dark:hover:bg-amber-500/10"
          >
            <AlertCircle className="h-4 w-4" />
            Request Changes
          </Button>
        </div>
      )}
    </div>
  );
}
