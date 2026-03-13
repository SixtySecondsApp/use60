import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/clientV2'
import { useOrgStore } from '@/lib/stores/orgStore'
import { useAuth } from '@/lib/contexts/AuthContext'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { FileText, Plus, Archive, Eye, Loader2 } from 'lucide-react'
import type { ManagedLeadForm } from '@/lib/services/linkedinAdManagerService'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LeadFormBuilderProps {
  campaignId?: string
  onFormCreated?: (formId: string) => void
}

interface FieldOption {
  key: string
  label: string
  fieldType: string
}

const STANDARD_FIELDS: FieldOption[] = [
  { key: 'first_name', label: 'First Name', fieldType: 'FIRST_NAME' },
  { key: 'last_name', label: 'Last Name', fieldType: 'LAST_NAME' },
  { key: 'email', label: 'Email', fieldType: 'EMAIL' },
  { key: 'company', label: 'Company', fieldType: 'COMPANY_NAME' },
  { key: 'job_title', label: 'Job Title', fieldType: 'JOB_TITLE' },
  { key: 'phone', label: 'Phone', fieldType: 'PHONE_NUMBER' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LeadFormBuilder({ campaignId, onFormCreated }: LeadFormBuilderProps) {
  const { user } = useAuth()
  const activeOrgId = useOrgStore((s) => s.activeOrgId)

  // Form builder state
  const [formName, setFormName] = useState('')
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState('')
  const [thankYouMessage, setThankYouMessage] = useState('')
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set(['first_name', 'last_name', 'email']))
  const [customFieldName, setCustomFieldName] = useState('')
  const [customFields, setCustomFields] = useState<string[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [saving, setSaving] = useState(false)

  // Existing forms state
  const [forms, setForms] = useState<ManagedLeadForm[]>([])
  const [formsLoading, setFormsLoading] = useState(true)

  // ---------------------------------------------------------------------------
  // Load existing forms
  // ---------------------------------------------------------------------------

  const loadForms = useCallback(async () => {
    if (!activeOrgId) return
    setFormsLoading(true)
    try {
      const { data, error } = await supabase
        .from('linkedin_managed_lead_forms')
        .select('id, org_id, name, fields, privacy_policy_url, thank_you_message, status, created_at, created_by, linkedin_form_id, headline, description, landing_page_url, last_synced_at, updated_at')
        .eq('org_id', activeOrgId)
        .neq('status', 'ARCHIVED')
        .order('created_at', { ascending: false })

      if (error) throw error
      setForms((data as ManagedLeadForm[]) || [])
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load forms'
      console.error('[LeadFormBuilder] load error:', message)
      toast.error(message)
    } finally {
      setFormsLoading(false)
    }
  }, [activeOrgId])

  useEffect(() => {
    loadForms()
  }, [loadForms])

  // ---------------------------------------------------------------------------
  // Field selection helpers
  // ---------------------------------------------------------------------------

  const toggleField = (key: string) => {
    setSelectedFields((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const addCustomField = () => {
    const trimmed = customFieldName.trim()
    if (!trimmed) return
    if (customFields.includes(trimmed)) {
      toast.error('Custom field already exists')
      return
    }
    setCustomFields((prev) => [...prev, trimmed])
    setCustomFieldName('')
  }

  const removeCustomField = (name: string) => {
    setCustomFields((prev) => prev.filter((f) => f !== name))
  }

  // ---------------------------------------------------------------------------
  // Build fields array for storage
  // ---------------------------------------------------------------------------

  const buildFieldsArray = (): Array<{ fieldType: string; label: string; required: boolean }> => {
    const fields: Array<{ fieldType: string; label: string; required: boolean }> = []

    for (const sf of STANDARD_FIELDS) {
      if (selectedFields.has(sf.key)) {
        fields.push({ fieldType: sf.fieldType, label: sf.label, required: true })
      }
    }

    for (const cf of customFields) {
      fields.push({ fieldType: 'CUSTOM', label: cf, required: false })
    }

    return fields
  }

  // ---------------------------------------------------------------------------
  // Create form
  // ---------------------------------------------------------------------------

  const handleCreate = async () => {
    if (!activeOrgId) {
      toast.error('No active organization')
      return
    }
    if (!formName.trim()) {
      toast.error('Form name is required')
      return
    }

    const fields = buildFieldsArray()
    if (fields.length === 0) {
      toast.error('Select at least one field')
      return
    }

    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('linkedin_managed_lead_forms')
        .insert({
          org_id: activeOrgId,
          name: formName.trim(),
          fields,
          privacy_policy_url: privacyPolicyUrl.trim() || null,
          thank_you_message: thankYouMessage.trim() || null,
          status: 'DRAFT',
          created_by: user?.id ?? null,
        })
        .select('id')
        .single()

      if (error) throw error

      toast.success('Lead gen form created')

      // Reset builder state
      setFormName('')
      setPrivacyPolicyUrl('')
      setThankYouMessage('')
      setSelectedFields(new Set(['first_name', 'last_name', 'email']))
      setCustomFields([])
      setShowPreview(false)

      await loadForms()
      onFormCreated?.(data.id)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to create form'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Archive form
  // ---------------------------------------------------------------------------

  const handleArchive = async (formId: string) => {
    try {
      const { error } = await supabase
        .from('linkedin_managed_lead_forms')
        .update({ status: 'ARCHIVED', updated_at: new Date().toISOString() })
        .eq('id', formId)
        .eq('org_id', activeOrgId!)

      if (error) throw error

      toast.success('Form archived')
      await loadForms()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to archive form'
      toast.error(message)
    }
  }

  // ---------------------------------------------------------------------------
  // Preview fields
  // ---------------------------------------------------------------------------

  const previewFields = buildFieldsArray()

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Builder Card */}
      <Card className="border-zinc-800/60 bg-zinc-900/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-zinc-100">
            <FileText className="w-5 h-5 text-blue-400" />
            Lead Gen Form Builder
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Form name */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300 text-sm">Form Name</Label>
            <Input
              placeholder="e.g. Q2 Demo Request Form"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="bg-zinc-800/60 border-zinc-700/60 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>

          {/* Field selection */}
          <div className="space-y-2">
            <Label className="text-zinc-300 text-sm">Fields</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {STANDARD_FIELDS.map((field) => (
                <label
                  key={field.key}
                  className="flex items-center gap-2 cursor-pointer select-none"
                >
                  <Checkbox
                    checked={selectedFields.has(field.key)}
                    onCheckedChange={() => toggleField(field.key)}
                  />
                  <span className="text-sm text-zinc-300">{field.label}</span>
                </label>
              ))}
            </div>

            {/* Custom fields */}
            <div className="pt-2 space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Custom field name"
                  value={customFieldName}
                  onChange={(e) => setCustomFieldName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addCustomField()
                    }
                  }}
                  className="bg-zinc-800/60 border-zinc-700/60 text-zinc-100 placeholder:text-zinc-500 flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addCustomField}
                  disabled={!customFieldName.trim()}
                  className="gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </Button>
              </div>
              {customFields.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {customFields.map((cf) => (
                    <Badge
                      key={cf}
                      variant="outline"
                      className="bg-zinc-800/40 text-zinc-300 border-zinc-700/60 cursor-pointer hover:border-red-500/40 hover:text-red-400 transition-colors"
                      onClick={() => removeCustomField(cf)}
                    >
                      {cf} &times;
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Privacy policy URL */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300 text-sm">Privacy Policy URL</Label>
            <Input
              placeholder="https://yoursite.com/privacy"
              value={privacyPolicyUrl}
              onChange={(e) => setPrivacyPolicyUrl(e.target.value)}
              className="bg-zinc-800/60 border-zinc-700/60 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>

          {/* Thank you message */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300 text-sm">Thank You Message</Label>
            <Textarea
              placeholder="Thanks for your interest! We'll be in touch within 24 hours."
              value={thankYouMessage}
              onChange={(e) => setThankYouMessage(e.target.value)}
              className="bg-zinc-800/60 border-zinc-700/60 text-zinc-100 placeholder:text-zinc-500 resize-none"
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleCreate}
              disabled={saving || !formName.trim() || (selectedFields.size === 0 && customFields.length === 0)}
              className="gap-2"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Create Form
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreview((p) => !p)}
              className="gap-2"
            >
              <Eye className="w-4 h-4" />
              {showPreview ? 'Hide Preview' : 'Preview'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Form Preview */}
      {showPreview && (
        <Card className="border-zinc-800/60 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="text-sm text-zinc-400">Form Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/40 p-5 max-w-md space-y-4">
              {/* Simulated LinkedIn form header */}
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-zinc-100">
                  {formName || 'Untitled Form'}
                </h3>
                <p className="text-xs text-zinc-500">LinkedIn Lead Gen Form</p>
              </div>

              {/* Simulated fields */}
              {previewFields.length > 0 ? (
                <div className="space-y-3">
                  {previewFields.map((field, i) => (
                    <div key={i} className="space-y-1">
                      <label className="text-xs font-medium text-zinc-400">
                        {field.label}
                        {field.required && <span className="text-red-400 ml-0.5">*</span>}
                      </label>
                      <div className="h-8 rounded border border-zinc-600/40 bg-zinc-700/30" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500 italic">No fields selected</p>
              )}

              {/* Privacy policy link */}
              {privacyPolicyUrl.trim() && (
                <p className="text-xs text-blue-400 underline truncate">
                  Privacy Policy
                </p>
              )}

              {/* Submit simulation */}
              <div className="h-9 rounded bg-blue-600/80 flex items-center justify-center">
                <span className="text-sm font-medium text-white">Submit</span>
              </div>

              {/* Thank you message preview */}
              {thankYouMessage.trim() && (
                <div className="rounded border border-zinc-700/40 bg-zinc-800/60 p-3 mt-2">
                  <p className="text-xs text-zinc-500 mb-1">After submission:</p>
                  <p className="text-sm text-zinc-300">{thankYouMessage}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing Forms */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-zinc-400">Existing Forms</h3>

        {formsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 text-zinc-500 animate-spin" />
          </div>
        ) : forms.length > 0 ? (
          forms.map((form) => (
            <Card key={form.id} className="border-zinc-800/60 bg-zinc-900/60">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                      <FileText className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-200">{form.name}</p>
                      <p className="text-xs text-zinc-500">
                        {Array.isArray(form.fields) ? form.fields.length : 0} field{Array.isArray(form.fields) && form.fields.length !== 1 ? 's' : ''}
                        {form.created_at && (
                          <> &middot; {new Date(form.created_at).toLocaleDateString()}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        form.status === 'ACTIVE'
                          ? 'bg-green-500/10 text-green-400 border-green-500/20'
                          : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                      }
                    >
                      {form.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleArchive(form.id)}
                      className="text-zinc-500 hover:text-red-400"
                    >
                      <Archive className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="border-zinc-800/60 bg-zinc-900/60">
            <CardContent className="py-10 text-center">
              <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">
                No lead gen forms yet. Create one above to start collecting leads from LinkedIn ads.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
