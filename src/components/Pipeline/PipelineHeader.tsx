/**
 * PipelineHeader Component (PIPE-010)
 *
 * Premium glass-morphism header with metrics chips, health dots,
 * view toggle, and filter pills matching the pipeline design system.
 */

import React, { useState, useEffect } from 'react';
import {
  Search,
  X,
  LayoutGrid,
  Table2,
  ChevronDown,
  Filter,
  Heart,
  AlertTriangle,
  Users,
  Plus,
  Download,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import type { PipelineSummary, StageMetric } from './hooks/usePipelineData';
import type { PipelineViewMode } from './hooks/usePipelineFilters';

interface PipelineHeaderProps {
  summary: PipelineSummary;
  stageMetrics: StageMetric[];
  viewMode: PipelineViewMode;
  onViewModeChange: (mode: PipelineViewMode) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  selectedStages: string[];
  onStagesChange: (stages: string[]) => void;
  selectedHealthStatus: string[];
  onHealthStatusChange: (statuses: string[]) => void;
  selectedRiskLevel: string[];
  onRiskLevelChange: (levels: string[]) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  onAddDeal: () => void;
  onImportFromCRM?: (source: 'hubspot' | 'attio') => void;
  connectedCRMs?: { hubspot: boolean; attio: boolean };
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function PipelineHeader({
  summary,
  stageMetrics,
  viewMode,
  onViewModeChange,
  searchValue,
  onSearchChange,
  selectedStages,
  onStagesChange,
  selectedHealthStatus,
  onHealthStatusChange,
  selectedRiskLevel,
  onRiskLevelChange,
  onClearFilters,
  hasActiveFilters,
  onAddDeal,
  onImportFromCRM,
  connectedCRMs = { hubspot: false, attio: false },
}: PipelineHeaderProps) {
  const safeSummary = summary ?? {
    total_value: 0,
    weighted_value: 0,
    deal_count: 0,
    healthy_count: 0,
    warning_count: 0,
    critical_count: 0,
    stalled_count: 0,
  };

  const [stagePopoverOpen, setStagePopoverOpen] = useState(false);
  const [healthPopoverOpen, setHealthPopoverOpen] = useState(false);
  const [riskPopoverOpen, setRiskPopoverOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const healthOptions = [
    { value: 'healthy', label: 'Healthy' },
    { value: 'warning', label: 'Warning' },
    { value: 'critical', label: 'Critical' },
    { value: 'stalled', label: 'Stalled' },
  ];

  const riskOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'critical', label: 'Critical' },
  ];

  const avgDealSize = safeSummary.deal_count > 0
    ? Math.round(safeSummary.total_value / safeSummary.deal_count)
    : 0;

  return (
    <div className="space-y-3 mb-4">
      {/* ---- TOP BAR: Title + Views + New Deal ---- */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">
            Pipeline
          </h1>
          <div className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-blue-50 dark:bg-blue-500/[0.08] border border-blue-200 dark:border-blue-500/15 text-blue-600 dark:text-blue-400 text-[12.5px] font-semibold cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-500/[0.13] transition-colors">
            <span>Sales Pipeline</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* View toggle */}
          <div className="flex rounded-[10px] overflow-hidden bg-gray-100 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06] backdrop-blur-xl">
            <button
              onClick={() => onViewModeChange('kanban')}
              className={`
                flex items-center gap-1.5 px-4 py-[7px] text-[12.5px] font-medium transition-all relative
                ${viewMode === 'kanban'
                  ? 'text-gray-900 dark:text-white bg-white dark:bg-blue-500/20'
                  : 'text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.02]'
                }
              `}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Board
              {viewMode === 'kanban' && (
                <span className="absolute bottom-0 left-[20%] right-[20%] h-[2px] bg-blue-500 rounded-sm" />
              )}
            </button>
            <button
              onClick={() => onViewModeChange('table')}
              className={`
                flex items-center gap-1.5 px-4 py-[7px] text-[12.5px] font-medium transition-all relative
                ${viewMode === 'table'
                  ? 'text-gray-900 dark:text-white bg-white dark:bg-blue-500/20'
                  : 'text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.02]'
                }
              `}
            >
              <Table2 className="w-3.5 h-3.5" />
              Table
              {viewMode === 'table' && (
                <span className="absolute bottom-0 left-[20%] right-[20%] h-[2px] bg-blue-500 rounded-sm" />
              )}
            </button>
          </div>

          {/* New Deal button */}
          <button
            onClick={onAddDeal}
            className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-[10px] bg-gradient-to-br from-blue-500/20 to-violet-500/20 dark:from-blue-500/25 dark:to-violet-500/25 border border-blue-300/30 dark:border-blue-500/30 text-blue-700 dark:text-white text-[12.5px] font-semibold backdrop-blur-xl hover:from-blue-500/30 hover:to-violet-500/30 dark:hover:from-blue-500/35 dark:hover:to-violet-500/35 shadow-sm hover:shadow-md transition-all hover:-translate-y-[1px]"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            New Deal
          </button>

          {/* Import from CRM dropdown */}
          {(connectedCRMs.hubspot || connectedCRMs.attio) && onImportFromCRM && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-[10px] bg-white/60 dark:bg-white/[0.025] border border-gray-200/80 dark:border-white/[0.06] text-gray-600 dark:text-gray-300 text-[12.5px] font-medium backdrop-blur-xl hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-all">
                  <Download className="w-3.5 h-3.5" />
                  Import
                  <ChevronDown className="w-3 h-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[180px] p-1.5" align="end">
                <div className="space-y-0.5">
                  {connectedCRMs.hubspot && (
                    <button
                      onClick={() => onImportFromCRM('hubspot')}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors text-left"
                    >
                      <span className="w-5 h-5 rounded bg-orange-500/10 flex items-center justify-center text-[10px] font-bold text-orange-600 dark:text-orange-400">H</span>
                      HubSpot Deals
                    </button>
                  )}
                  {connectedCRMs.attio && (
                    <button
                      onClick={() => onImportFromCRM('attio')}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors text-left"
                    >
                      <span className="w-5 h-5 rounded bg-blue-500/10 flex items-center justify-center text-[10px] font-bold text-blue-600 dark:text-blue-400">A</span>
                      Attio Deals
                    </button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {/* ---- METRICS ROW ---- */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Metric chips */}
        <div className="px-3.5 py-2 rounded-[10px] bg-white/80 dark:bg-white/[0.025] border border-gray-200/80 dark:border-white/[0.06] backdrop-blur-xl">
          <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wider">Total Value</div>
          <div className="text-[15px] font-bold text-gray-900 dark:text-white tracking-tight mt-0.5">{formatCurrency(safeSummary.total_value)}</div>
        </div>
        <div className="px-3.5 py-2 rounded-[10px] bg-white/80 dark:bg-white/[0.025] border border-gray-200/80 dark:border-white/[0.06] backdrop-blur-xl">
          <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wider">Weighted</div>
          <div className="text-[15px] font-bold text-gray-900 dark:text-white tracking-tight mt-0.5">{formatCurrency(safeSummary.weighted_value)}</div>
        </div>
        <div className="px-3.5 py-2 rounded-[10px] bg-white/80 dark:bg-white/[0.025] border border-gray-200/80 dark:border-white/[0.06] backdrop-blur-xl">
          <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wider">Deals</div>
          <div className="text-[15px] font-bold text-gray-900 dark:text-white tracking-tight mt-0.5">{safeSummary.deal_count}</div>
        </div>
        <div className="px-3.5 py-2 rounded-[10px] bg-white/80 dark:bg-white/[0.025] border border-gray-200/80 dark:border-white/[0.06] backdrop-blur-xl">
          <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wider">Avg Size</div>
          <div className="text-[15px] font-bold text-gray-900 dark:text-white tracking-tight mt-0.5">{formatCurrency(avgDealSize)}</div>
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-px h-8 bg-gray-200 dark:bg-white/[0.06] mx-2" />

        {/* Health dots */}
        <div className="hidden sm:flex items-center gap-3.5 ml-1.5">
          <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-gray-500 dark:text-gray-400">
            <span className="w-[7px] h-[7px] rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(52,217,154,0.4)]" />
            {safeSummary.healthy_count} Healthy
          </div>
          <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-gray-500 dark:text-gray-400">
            <span className="w-[7px] h-[7px] rounded-full bg-amber-500 shadow-[0_0_8px_rgba(251,191,36,0.4)]" />
            {safeSummary.warning_count} Warning
          </div>
          <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-gray-500 dark:text-gray-400">
            <span className="w-[7px] h-[7px] rounded-full bg-red-500 shadow-[0_0_8px_rgba(248,113,113,0.4)]" />
            {safeSummary.critical_count} Critical
          </div>
          <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-gray-500 dark:text-gray-400">
            <span className="w-[7px] h-[7px] rounded-full bg-gray-400 dark:bg-gray-500" />
            {safeSummary.stalled_count} Stalled
          </div>
        </div>
      </div>

      {/* ---- FILTERS ROW (Desktop) ---- */}
      <div className="hidden md:flex items-center gap-2">
        {/* Stage filter */}
        <Popover open={stagePopoverOpen} onOpenChange={setStagePopoverOpen}>
          <PopoverTrigger asChild>
            <button className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium backdrop-blur-xl transition-all
              ${selectedStages.length > 0
                ? 'bg-blue-50 dark:bg-blue-500/[0.08] border border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-400'
                : 'bg-white/60 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.09] text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-white/[0.13] hover:text-gray-800 dark:hover:text-white hover:bg-white dark:hover:bg-white/[0.04]'
              }
            `}>
              <Filter className="w-3.5 h-3.5" />
              {selectedStages.length > 0 ? `${selectedStages.length} Stage${selectedStages.length > 1 ? 's' : ''}` : 'All Stages'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-2" align="start">
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {stageMetrics.map((stage) => (
                <label key={stage.stage_id} className="flex items-center gap-2.5 p-2 hover:bg-gray-100 dark:hover:bg-white/[0.04] rounded-lg cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedStages.includes(stage.stage_id)}
                    onChange={(e) => {
                      const newSelection = e.target.checked
                        ? [...selectedStages, stage.stage_id]
                        : selectedStages.filter(id => id !== stage.stage_id);
                      onStagesChange(newSelection);
                    }}
                    className="rounded"
                  />
                  <div className="flex items-center gap-2 flex-1">
                    <span
                      className="w-2 h-2 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: stage.stage_color || '#3B82F6' }}
                    />
                    <span className="text-sm text-gray-800 dark:text-gray-200">{stage.stage_name}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">{stage.deal_count}</span>
                  </div>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Health filter */}
        <Popover open={healthPopoverOpen} onOpenChange={setHealthPopoverOpen}>
          <PopoverTrigger asChild>
            <button className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium backdrop-blur-xl transition-all
              ${selectedHealthStatus.length > 0
                ? 'bg-blue-50 dark:bg-blue-500/[0.08] border border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-400'
                : 'bg-white/60 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.09] text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-white/[0.13] hover:text-gray-800 dark:hover:text-white hover:bg-white dark:hover:bg-white/[0.04]'
              }
            `}>
              <Heart className="w-3.5 h-3.5" />
              Health
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-2" align="start">
            <div className="space-y-1">
              {healthOptions.map((option) => {
                const dotColors: Record<string, string> = {
                  healthy: 'bg-emerald-500',
                  warning: 'bg-amber-500',
                  critical: 'bg-red-500',
                  stalled: 'bg-gray-400',
                };
                return (
                  <label key={option.value} className="flex items-center gap-2.5 p-2 hover:bg-gray-100 dark:hover:bg-white/[0.04] rounded-lg cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedHealthStatus.includes(option.value)}
                      onChange={(e) => {
                        const newSelection = e.target.checked
                          ? [...selectedHealthStatus, option.value]
                          : selectedHealthStatus.filter(v => v !== option.value);
                        onHealthStatusChange(newSelection);
                      }}
                      className="rounded"
                    />
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${dotColors[option.value] || 'bg-gray-400'}`} />
                      <span className="text-sm text-gray-800 dark:text-gray-200">{option.label}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        {/* Risk filter */}
        <Popover open={riskPopoverOpen} onOpenChange={setRiskPopoverOpen}>
          <PopoverTrigger asChild>
            <button className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium backdrop-blur-xl transition-all
              ${selectedRiskLevel.length > 0
                ? 'bg-blue-50 dark:bg-blue-500/[0.08] border border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-400'
                : 'bg-white/60 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.09] text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-white/[0.13] hover:text-gray-800 dark:hover:text-white hover:bg-white dark:hover:bg-white/[0.04]'
              }
            `}>
              <AlertTriangle className="w-3.5 h-3.5" />
              Risk
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-2" align="start">
            <div className="space-y-1">
              {riskOptions.map((option) => (
                <label key={option.value} className="flex items-center gap-2.5 p-2 hover:bg-gray-100 dark:hover:bg-white/[0.04] rounded-lg cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedRiskLevel.includes(option.value)}
                    onChange={(e) => {
                      const newSelection = e.target.checked
                        ? [...selectedRiskLevel, option.value]
                        : selectedRiskLevel.filter(v => v !== option.value);
                      onRiskLevelChange(newSelection);
                    }}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-800 dark:text-gray-200">{option.label}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Owner filter (placeholder) */}
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium bg-white/60 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.09] text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-white/[0.13] hover:text-gray-800 dark:hover:text-white hover:bg-white dark:hover:bg-white/[0.04] backdrop-blur-xl transition-all opacity-50 cursor-not-allowed" disabled>
          <Users className="w-3.5 h-3.5" />
          Owner
        </button>

        {/* Search */}
        <div className="ml-auto flex items-center gap-2 px-3.5 py-1.5 rounded-full max-w-[260px] flex-1 bg-white/60 dark:bg-white/[0.025] border border-gray-200/80 dark:border-white/[0.06] backdrop-blur-xl transition-all focus-within:border-blue-400/50 dark:focus-within:border-blue-500/30 focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.06)]">
          <Search className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search deals..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="bg-transparent border-none outline-none text-gray-900 dark:text-white text-[12.5px] w-full placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
          {searchValue && (
            <button onClick={() => onSearchChange('')} className="flex-shrink-0">
              <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors" />
            </button>
          )}
        </div>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={onClearFilters}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[12px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.04] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* ---- MOBILE FILTERS ---- */}
      <div className="md:hidden space-y-3">
        {/* Mobile health dots */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            <span className="w-[6px] h-[6px] rounded-full bg-emerald-500" />
            {safeSummary.healthy_count}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            <span className="w-[6px] h-[6px] rounded-full bg-amber-500" />
            {safeSummary.warning_count}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            <span className="w-[6px] h-[6px] rounded-full bg-red-500" />
            {safeSummary.critical_count}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            <span className="w-[6px] h-[6px] rounded-full bg-gray-400" />
            {safeSummary.stalled_count}
          </div>
        </div>

        {/* Search bar */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/80 dark:bg-white/[0.025] border border-gray-200/80 dark:border-white/[0.06] backdrop-blur-xl focus-within:border-blue-400/50 dark:focus-within:border-blue-500/30 transition-all">
          <Search className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search deals..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="bg-transparent border-none outline-none text-gray-900 dark:text-white text-sm w-full placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
          {searchValue && (
            <button onClick={() => onSearchChange('')} className="flex-shrink-0">
              <X className="w-4 h-4 text-gray-400 hover:text-gray-600 transition-colors" />
            </button>
          )}
        </div>

        {/* Filters sheet trigger */}
        <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
          <SheetTrigger asChild>
            <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/80 dark:bg-white/[0.025] border border-gray-200/80 dark:border-white/[0.06] text-gray-600 dark:text-gray-300 text-sm font-medium backdrop-blur-xl hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors">
              <Filter className="w-4 h-4" />
              Filters
              {hasActiveFilters && (
                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 rounded text-xs font-semibold">
                  Active
                </span>
              )}
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="!top-16 !h-[calc(100vh-4rem)] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>

            <div className="space-y-6 mt-6">
              {/* Stage filter */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Stage</h3>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {stageMetrics.map((stage) => (
                    <label key={stage.stage_id} className="flex items-center gap-3 p-2.5 hover:bg-gray-100 dark:hover:bg-white/[0.04] rounded-xl cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedStages.includes(stage.stage_id)}
                        onChange={(e) => {
                          const newSelection = e.target.checked
                            ? [...selectedStages, stage.stage_id]
                            : selectedStages.filter(id => id !== stage.stage_id);
                          onStagesChange(newSelection);
                        }}
                        className="rounded"
                      />
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-sm"
                          style={{ backgroundColor: stage.stage_color || '#3B82F6' }}
                        />
                        <span className="text-sm">{stage.stage_name} ({stage.deal_count})</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Health filter */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Health Status</h3>
                <div className="space-y-2">
                  {healthOptions.map((option) => {
                    const dotColors: Record<string, string> = {
                      healthy: 'bg-emerald-500',
                      warning: 'bg-amber-500',
                      critical: 'bg-red-500',
                      stalled: 'bg-gray-400',
                    };
                    return (
                      <label key={option.value} className="flex items-center gap-3 p-2.5 hover:bg-gray-100 dark:hover:bg-white/[0.04] rounded-xl cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedHealthStatus.includes(option.value)}
                          onChange={(e) => {
                            const newSelection = e.target.checked
                              ? [...selectedHealthStatus, option.value]
                              : selectedHealthStatus.filter(v => v !== option.value);
                            onHealthStatusChange(newSelection);
                          }}
                          className="rounded"
                        />
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${dotColors[option.value] || 'bg-gray-400'}`} />
                          <span className="text-sm">{option.label}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Risk filter */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Risk Level</h3>
                <div className="space-y-2">
                  {riskOptions.map((option) => (
                    <label key={option.value} className="flex items-center gap-3 p-2.5 hover:bg-gray-100 dark:hover:bg-white/[0.04] rounded-xl cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedRiskLevel.includes(option.value)}
                        onChange={(e) => {
                          const newSelection = e.target.checked
                            ? [...selectedRiskLevel, option.value]
                            : selectedRiskLevel.filter(v => v !== option.value);
                          onRiskLevelChange(newSelection);
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Clear all */}
              {hasActiveFilters && (
                <button
                  onClick={() => {
                    onClearFilters();
                    setMobileFiltersOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 dark:border-white/[0.06] text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
                >
                  <X className="w-4 h-4" />
                  Clear All Filters
                </button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
