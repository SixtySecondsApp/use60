import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, Sparkles, FileText, ArrowRight, Loader2, Brain, Mail, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useOrg } from '@/lib/contexts/OrgContext'
import { supabase } from '@/lib/supabase/clientV2'

const STEPS = [
  {
    icon: Brain,
    title: 'Analyse Transcript',
    description:
      'Prompt 1 reads the meeting transcript and extracts qualification status, pain points, and next steps. Results are written back to the row as structured JSON.',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10 border-violet-500/20',
  },
  {
    icon: Mail,
    title: 'Write Personalisation',
    description:
      'Prompt 2 runs only for qualified leads. It generates personalised email merge variables — subject line, opener, pain reference, and CTA — using the analysis from step 1.',
    color: 'text-sky-400',
    bg: 'bg-sky-500/10 border-sky-500/20',
  },
  {
    icon: PenLine,
    title: 'Write Email',
    description:
      'Prompt 3 composes the actual re-engagement email using all the extracted variables. Short, warm, references something specific from the original meeting.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
  },
] as const

export default function DemoReengagementPage() {
  const navigate = useNavigate()
  const { activeOrg } = useOrg()
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    if (!activeOrg?.id) {
      toast.error('No active organisation')
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('setup-reengagement-demo', {
        body: { org_id: activeOrg.id },
      })

      if (error) {
        // SDK doesn't parse body on non-2xx — read it from the raw response
        let msg = error?.message || 'Edge function error'
        try {
          const body = await error?.context?.json?.()
          if (body?.error) msg = body.error + (body.detail ? ` (${body.detail})` : '')
        } catch { /* ignore parse failure */ }
        throw new Error(msg)
      }
      if (data?.error) throw new Error(data.error + (data.detail ? ` (${data.detail})` : ''))
      if (!data?.table_id) throw new Error('No table ID returned')

      toast.success('Demo table created')
      navigate(`/ops/${data.table_id}`)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create demo table')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 md:p-10">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-violet-400 text-sm font-medium">
            <Sparkles className="h-4 w-4" />
            AI Pipeline Demo
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Re-Engagement Pipeline</h1>
          <p className="text-zinc-400 max-w-2xl">
            A 2-step AI flow that analyses past meeting transcripts and generates
            personalised re-engagement emails. Qualified leads get custom merge
            variables — everyone else is flagged for review.
          </p>
        </div>

        {/* Step cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className={`rounded-xl border p-5 space-y-3 ${step.bg}`}
            >
              <div className="flex items-center gap-2">
                <step.icon className={`h-5 w-5 ${step.color}`} />
                <span className="text-xs text-zinc-500 font-mono">Step {i + 1}</span>
              </div>
              <h3 className="font-semibold">{step.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-zinc-500" />
            How the demo works
          </h3>
          <ul className="text-sm text-zinc-400 space-y-1.5 list-disc list-inside">
            <li>Creates an Ops table pre-loaded with your real meetings data</li>
            <li>
              Columns include transcript text, analysis JSON, email merge variables, and
              action buttons
            </li>
            <li>
              <code className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded">JSON_GET</code>{' '}
              formula extractors surface nested values as readable columns
            </li>
            <li>Conditional buttons only appear when the row is ready for that step</li>
          </ul>
          <p className="text-xs text-zinc-500">
            Requires meetings with transcripts. If none exist, the table will be created
            empty.
          </p>
        </div>

        {/* CTA */}
        <div className="flex items-center gap-4">
          <Button
            size="lg"
            onClick={handleCreate}
            disabled={loading}
            className="bg-violet-600 hover:bg-violet-500 text-white gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            {loading ? 'Creating…' : 'Create Demo Table'}
          </Button>
          <span className="text-xs text-zinc-500">
            Redirects to the new Ops table once ready
          </span>
        </div>
      </div>
    </div>
  )
}
