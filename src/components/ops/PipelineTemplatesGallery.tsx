import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  ArrowRight,
  RotateCcw,
  Target,
  CalendarCheck,
  Brain,
  Mail,
  PenLine,
  BarChart3,
  Compass,
  FileText,
  ListChecks,
  Send,
} from 'lucide-react';
import { PIPELINE_TEMPLATES, type PipelineTemplate } from '@/lib/config/pipelineTemplates';
import { PipelineConfigWizard } from './PipelineConfigWizard';

interface PipelineTemplatesGalleryProps {
  onPipelineCreated?: (tableId: string) => void;
}

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  RotateCcw,
  Target,
  CalendarCheck,
  Brain,
  Mail,
  PenLine,
  BarChart3,
  Compass,
  FileText,
  ListChecks,
  Send,
  Sparkles,
};

const CATEGORY_COLORS: Record<string, string> = {
  outreach: 'bg-violet-500/20 text-violet-400',
  analysis: 'bg-blue-500/20 text-blue-400',
  'follow-up': 'bg-amber-500/20 text-amber-400',
};

const STEP_DOT_COLORS: Record<string, string> = {
  violet: 'bg-violet-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  blue: 'bg-blue-500',
  sky: 'bg-sky-500',
};

export default function PipelineTemplatesGallery({ onPipelineCreated }: PipelineTemplatesGalleryProps) {
  const navigate = useNavigate();
  const [wizardTemplate, setWizardTemplate] = useState<PipelineTemplate | null>(null);

  function handleComplete(tableId: string) {
    if (onPipelineCreated) {
      onPipelineCreated(tableId);
    } else {
      navigate(`/ops/${tableId}`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Sparkles className="h-4 w-4 text-violet-400" />
        <span className="font-medium text-zinc-200">AI Pipelines</span>
        <span className="text-zinc-500">
          Multi-step AI workflows that process your data automatically
        </span>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {PIPELINE_TEMPLATES.map((template) => {
          const Icon = ICON_MAP[template.icon] || Sparkles;

          return (
            <div
              key={template.key}
              className="group relative flex flex-col rounded-xl border border-zinc-800 bg-gradient-to-b from-zinc-900/80 to-zinc-900/40 p-5 transition-all hover:border-violet-500/30 hover:shadow-lg hover:shadow-violet-500/5"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-zinc-100">{template.name}</h3>
                    <span className={`inline-block mt-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[template.category] || 'bg-zinc-700/30 text-zinc-500'}`}>
                      {template.category}
                    </span>
                  </div>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2 mb-4">
                {template.description}
              </p>

              {/* Steps preview */}
              <div className="flex items-center gap-1.5 mb-4">
                {template.steps.map((step, i) => {
                  return (
                    <div key={step.action_column_key} className="flex items-center gap-1.5">
                      {i > 0 && <div className="w-3 h-px bg-zinc-700" />}
                      <div className="flex items-center gap-1" title={step.title}>
                        <div className={`h-2 w-2 rounded-full ${STEP_DOT_COLORS[step.color] || 'bg-zinc-500'}`} />
                        <span className="text-[10px] text-zinc-500 hidden sm:inline">{step.title}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Stats */}
              <div className="flex items-center gap-3 text-[10px] text-zinc-600 mb-4">
                <span>{template.columns.length} columns</span>
                <span>{template.steps.length} steps</span>
                <span>{template.columns.filter(c => c.column_type === 'formula').length} formulas</span>
              </div>

              {/* CTA */}
              <button
                onClick={() => setWizardTemplate(template)}
                className="mt-auto flex w-full items-center justify-center gap-2 rounded-lg border border-violet-600/40 bg-violet-600/10 px-3 py-2 text-xs font-medium text-violet-300 transition-all hover:bg-violet-600/20 hover:border-violet-500/60"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                Create Pipeline
              </button>
            </div>
          );
        })}
      </div>

      {/* Config wizard */}
      {wizardTemplate && (
        <PipelineConfigWizard
          open={!!wizardTemplate}
          onOpenChange={(open) => { if (!open) setWizardTemplate(null); }}
          template={wizardTemplate}
          onComplete={handleComplete}
        />
      )}
    </div>
  );
}
