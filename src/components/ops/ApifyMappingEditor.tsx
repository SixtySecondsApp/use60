import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowRight, Key, Loader2, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/clientV2'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FieldMapping {
  source: string
  target: string
  transform?: string
  confidence: 'high' | 'medium' | 'low'
  sample_value?: string
}

interface MappingTemplate {
  id?: string
  name?: string
  actor_id?: string
  mappings: FieldMapping[]
  dedup_key?: string
}

interface ApifyMappingEditorProps {
  mappings: FieldMapping[]
  templateId?: string
  templateName?: string
  actorId?: string
  onSave: (template: MappingTemplate) => void
  onCancel: () => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRANSFORM_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'lowercase', label: 'Lowercase' },
  { value: 'uppercase', label: 'Uppercase' },
  { value: 'trim', label: 'Trim' },
  { value: 'normalise_phone', label: 'Normalise Phone' },
  { value: 'extract_domain', label: 'Extract Domain' },
  { value: 'parse_date', label: 'Parse Date' },
  { value: 'to_integer', label: 'To Integer' },
  { value: 'to_float', label: 'To Float' },
  { value: 'join_array', label: 'Join Array' },
  { value: 'first', label: 'First Item' },
  { value: 'stringify', label: 'Stringify' },
] as const

const CONFIDENCE_STYLES: Record<string, string> = {
  high: 'bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200/50 dark:border-emerald-500/30',
  medium: 'bg-amber-100/80 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200/50 dark:border-amber-500/30',
  low: 'bg-red-100/80 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200/50 dark:border-red-500/30',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApifyMappingEditor({
  mappings: initialMappings,
  templateId,
  templateName: initialName,
  actorId,
  onSave,
  onCancel,
}: ApifyMappingEditorProps) {
  const [rows, setRows] = useState<FieldMapping[]>(initialMappings)
  const [dedupKey, setDedupKey] = useState<string>('')
  const [templateName, setTemplateName] = useState(initialName || '')
  const [saving, setSaving] = useState(false)

  const updateRow = (index: number, updates: Partial<FieldMapping>) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...updates } : r))
    )
  }

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    const activeMappings = rows.filter((r) => r.target.trim())
    if (activeMappings.length === 0) {
      toast.error('At least one field must be mapped')
      return
    }

    setSaving(true)
    try {
      const template: MappingTemplate = {
        id: templateId,
        name: templateName.trim() || undefined,
        actor_id: actorId,
        mappings: activeMappings,
        dedup_key: dedupKey || undefined,
      }

      // Upsert to mapping_templates table
      const payload: Record<string, unknown> = {
        field_mappings: activeMappings,
        dedup_key: dedupKey || null,
        name: templateName.trim() || null,
        actor_id: actorId || null,
        updated_at: new Date().toISOString(),
      }

      if (templateId) {
        const { error } = await supabase
          .from('apify_mapping_templates')
          .update(payload)
          .eq('id', templateId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('apify_mapping_templates')
          .insert(payload)
        if (error) throw error
      }

      toast.success('Mapping template saved')
      onSave(template)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save mapping template')
      console.error('[ApifyMappingEditor] save error:', err)
    } finally {
      setSaving(false)
    }
  }

  // Build dedup key options from mapped target fields
  const targetFields = rows.filter((r) => r.target.trim()).map((r) => r.target)

  return (
    <div className="space-y-4">
      {/* Template name */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Template Name
        </label>
        <Input
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          placeholder="e.g. LinkedIn Scraper Mapping"
          className="h-8 text-sm"
        />
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_24px_1fr_140px_70px_28px] gap-2 items-center px-1">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Source Field
        </span>
        <span />
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Target Field
        </span>
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Transform
        </span>
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center">
          Match
        </span>
        <span />
      </div>

      {/* Mapping rows */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {rows.map((row, idx) => (
          <div
            key={`${row.source}-${idx}`}
            className="grid grid-cols-[1fr_24px_1fr_140px_70px_28px] gap-2 items-center rounded-lg border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/30 p-2"
          >
            {/* Source (read-only) */}
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {row.source}
              </div>
              {row.sample_value && (
                <div className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                  e.g. {row.sample_value}
                </div>
              )}
            </div>

            {/* Arrow */}
            <ArrowRight className="w-4 h-4 text-gray-400 dark:text-gray-500 mx-auto shrink-0" />

            {/* Target (editable) */}
            <Input
              value={row.target}
              onChange={(e) => updateRow(idx, { target: e.target.value })}
              placeholder="target_field"
              className="h-8 text-sm"
            />

            {/* Transform select */}
            <Select
              value={row.transform || 'none'}
              onValueChange={(val) =>
                updateRow(idx, { transform: val === 'none' ? undefined : val })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSFORM_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Confidence badge */}
            <div className="flex justify-center">
              <Badge className={`text-[10px] ${CONFIDENCE_STYLES[row.confidence] || CONFIDENCE_STYLES.low}`}>
                {row.confidence}
              </Badge>
            </div>

            {/* Remove */}
            <button
              onClick={() => removeRow(idx)}
              className="rounded p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title="Remove mapping"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {rows.length === 0 && (
          <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-500">
            No field mappings. Run auto-map to generate suggestions.
          </div>
        )}
      </div>

      {/* Dedup key selector */}
      {targetFields.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5" />
            Dedup Key
          </label>
          <Select value={dedupKey || '__none'} onValueChange={(v) => setDedupKey(v === '__none' ? '' : v)}>
            <SelectTrigger className="h-8 text-sm w-64">
              <SelectValue placeholder="Select dedup field" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">No dedup key</SelectItem>
              {targetFields.map((field) => (
                <SelectItem key={field} value={field}>
                  {field}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Rows with duplicate values in this field will be merged.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700/50">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={saving}
          className="text-sm"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || rows.filter((r) => r.target.trim()).length === 0}
          className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm"
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {saving ? 'Saving...' : 'Save Template'}
        </Button>
      </div>
    </div>
  )
}
