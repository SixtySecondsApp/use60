import { Sparkles, FileText } from 'lucide-react';
import PipelineTemplatesGallery from '@/components/ops/PipelineTemplatesGallery';

export default function PipelineGalleryPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-violet-400 text-sm font-medium">
            <Sparkles className="h-4 w-4" />
            AI Pipelines
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Pipeline Templates</h1>
          <p className="text-zinc-400 max-w-2xl">
            Pre-built multi-step AI workflows. Each pipeline creates an Ops table with action buttons,
            formula extractors, and conditional logic — ready to run on your data.
          </p>
        </div>

        {/* Gallery */}
        <PipelineTemplatesGallery />

        {/* How it works */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-zinc-500" />
            How AI Pipelines work
          </h3>
          <ul className="text-sm text-zinc-400 space-y-1.5 list-disc list-inside">
            <li>Each pipeline creates an Ops table pre-loaded with your real data (or sample data if none exists)</li>
            <li>Action columns run AI prompts — click a button to process that row through each step</li>
            <li>
              <code className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded">JSON_GET</code>{' '}
              formula columns automatically extract structured fields from AI responses
            </li>
            <li>Conditional buttons only appear when the previous step is complete</li>
            <li>Use &ldquo;Run All&rdquo; to process every row through the full pipeline automatically</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
