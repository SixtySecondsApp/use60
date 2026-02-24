import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Pencil, X, Sparkles } from 'lucide-react'
import { ApifyMappingEditor, FieldMapping } from './ApifyMappingEditor'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MappingTemplate {
  id?: string
  name?: string
  actor_id?: string
  mappings: FieldMapping[]
  dedup_key?: string
}

interface ApifyAutoMapReviewProps {
  runId: string
  mappings: FieldMapping[]
  actorId?: string
  onAccept: (template: MappingTemplate) => void
  onReject: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApifyAutoMapReview({
  runId,
  mappings,
  actorId,
  onAccept,
  onReject,
}: ApifyAutoMapReviewProps) {
  const [mode, setMode] = useState<'review' | 'edit'>('review')

  const highCount = mappings.filter((m) => m.confidence === 'high').length
  const mediumCount = mappings.filter((m) => m.confidence === 'medium').length
  const lowCount = mappings.filter((m) => m.confidence === 'low').length

  if (mode === 'edit') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
          <Pencil className="w-4 h-4 text-blue-500" />
          Edit Mapping
        </div>
        <ApifyMappingEditor
          mappings={mappings}
          actorId={actorId}
          onSave={(template) => {
            onAccept(template)
          }}
          onCancel={() => setMode('review')}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-violet-500" />
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Auto-Map Results
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          ({mappings.length} fields)
        </span>
      </div>

      {/* Confidence summary */}
      <div className="flex items-center gap-2">
        {highCount > 0 && (
          <Badge className="bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200/50 dark:border-emerald-500/30">
            {highCount} high
          </Badge>
        )}
        {mediumCount > 0 && (
          <Badge className="bg-amber-100/80 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200/50 dark:border-amber-500/30">
            {mediumCount} medium
          </Badge>
        )}
        {lowCount > 0 && (
          <Badge className="bg-red-100/80 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200/50 dark:border-red-500/30">
            {lowCount} low
          </Badge>
        )}
      </div>

      {/* Compact mapping preview */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700/50 divide-y divide-gray-100 dark:divide-gray-700/30 max-h-[300px] overflow-y-auto">
        {mappings.map((m, idx) => (
          <div
            key={`${m.source}-${idx}`}
            className="flex items-center gap-3 px-3 py-2 text-sm"
          >
            <span className="text-gray-700 dark:text-gray-300 font-mono text-xs truncate flex-1">
              {m.source}
            </span>
            <span className="text-gray-400 dark:text-gray-500 shrink-0">
              {'\u2192'}
            </span>
            <span className="text-gray-900 dark:text-gray-100 font-mono text-xs truncate flex-1">
              {m.target}
            </span>
            {m.transform && m.transform !== 'none' && (
              <Badge variant="outline" className="text-[10px] shrink-0">
                {m.transform}
              </Badge>
            )}
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${
                m.confidence === 'high'
                  ? 'bg-emerald-500'
                  : m.confidence === 'medium'
                  ? 'bg-amber-500'
                  : 'bg-red-500'
              }`}
              title={`${m.confidence} confidence`}
            />
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onReject}
          className="gap-1.5 text-sm text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <X className="w-3.5 h-3.5" />
          Reject
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMode('edit')}
          className="gap-1.5 text-sm"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </Button>
        <Button
          size="sm"
          onClick={() =>
            onAccept({
              actor_id: actorId,
              mappings,
            })
          }
          className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm"
        >
          <Check className="w-3.5 h-3.5" />
          Accept
        </Button>
      </div>
    </div>
  )
}
