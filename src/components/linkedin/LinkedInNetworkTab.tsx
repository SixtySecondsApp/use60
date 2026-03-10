import { useEffect, useRef, useState } from 'react'
import { useLinkedInGraphImport } from '@/lib/hooks/useLinkedInGraphImport'
import type { ArchiveImport, ImportContact } from '@/lib/services/linkedinGraphImportService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Upload,
  Users,
  Shield,
  Link2,
  FileText,
  Loader2,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Status badge colour map
// ---------------------------------------------------------------------------

function statusBadge(status: string) {
  switch (status) {
    case 'processing':
      return <Badge variant="outline" className="text-blue-400 border-blue-500/30">Processing</Badge>
    case 'completed':
      return <Badge variant="outline" className="text-green-400 border-green-500/30">Completed</Badge>
    case 'failed':
      return <Badge variant="outline" className="text-red-400 border-red-500/30">Failed</Badge>
    default:
      return <Badge variant="outline" className="text-zinc-400 border-zinc-600">{status}</Badge>
  }
}

// ---------------------------------------------------------------------------
// Match confidence badge
// ---------------------------------------------------------------------------

function confidenceBadge(confidence?: string) {
  if (!confidence) return null
  switch (confidence) {
    case 'high':
      return <Badge variant="outline" className="text-green-400 border-green-500/30">High</Badge>
    case 'medium':
      return <Badge variant="outline" className="text-amber-400 border-amber-500/30">Medium</Badge>
    case 'low':
      return <Badge variant="outline" className="text-zinc-400 border-zinc-600">Low</Badge>
    default:
      return <Badge variant="outline" className="text-zinc-400 border-zinc-600">{confidence}</Badge>
  }
}

// ---------------------------------------------------------------------------
// Trust tier config
// ---------------------------------------------------------------------------

const TRUST_TIERS: { key: string; label: string; color: string; iconColor: string }[] = [
  { key: 'strong', label: 'Strong', color: 'bg-green-500/10', iconColor: 'text-green-400' },
  { key: 'trusted', label: 'Trusted', color: 'bg-blue-500/10', iconColor: 'text-blue-400' },
  { key: 'known', label: 'Known', color: 'bg-amber-500/10', iconColor: 'text-amber-400' },
  { key: 'cold', label: 'Cold', color: 'bg-zinc-500/10', iconColor: 'text-zinc-400' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LinkedInNetworkTab() {
  const {
    imports,
    loading,
    contacts,
    contactsLoading,
    scores,
    scoresLoading,
    loadImports,
    loadContacts,
    loadScores,
    createImport,
  } = useLinkedInGraphImport()

  const [selectedImport, setSelectedImport] = useState<ArchiveImport | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const initialLoadDone = useRef(false)

  // Initial load
  useEffect(() => {
    if (initialLoadDone.current) return
    initialLoadDone.current = true
    loadImports()
    loadScores()
  }, [loadImports, loadScores])

  // Load contacts when an import is selected
  useEffect(() => {
    if (selectedImport) {
      loadContacts(selectedImport.id)
    }
  }, [selectedImport, loadContacts])

  // ---------------------------------------------------------------------------
  // File upload handler
  // ---------------------------------------------------------------------------

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.split('.').pop()?.toLowerCase()
    const fileType = ext === 'zip' ? 'zip' : 'csv'
    await createImport(file.name, fileType)

    // Reset file input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ---------------------------------------------------------------------------
  // Derived: trust tier counts from scores
  // ---------------------------------------------------------------------------

  const tierCounts = TRUST_TIERS.map((tier) => ({
    ...tier,
    count: scores.filter((s) => s.trust_tier === tier.key).length,
  }))

  // Derived: import summary
  const matched = selectedImport?.matched_records ?? 0
  const total = selectedImport?.total_records ?? 0
  const unmatched = total - matched

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 text-zinc-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Your LinkedIn relationship signal</h2>
          <p className="text-sm text-zinc-500">
            Import your LinkedIn data export to enrich CRM contacts with relationship context.
          </p>
        </div>
        <div>
          <Input
            ref={fileInputRef}
            type="file"
            accept=".csv,.zip"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4" />
            Upload Archive
          </Button>
        </div>
      </div>

      {/* Trust tier breakdown */}
      {!scoresLoading && scores.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {tierCounts.map((tier) => (
            <Card key={tier.key} className="border-zinc-800/60 bg-zinc-900/60">
              <CardContent className="py-4 flex items-center gap-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${tier.color}`}>
                  <Shield className={`w-4 h-4 ${tier.iconColor}`} />
                </div>
                <div>
                  <p className="text-xs text-zinc-500">{tier.label}</p>
                  <p className="text-lg font-semibold text-zinc-100">{tier.count}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Import history */}
      <Card className="border-zinc-800/60 bg-zinc-900/60">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Import History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {imports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="w-10 h-10 text-zinc-600 mb-4" />
              <p className="text-sm text-zinc-500 max-w-sm">
                No imports yet. Upload your LinkedIn data archive (.csv or .zip) to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {imports.map((imp) => (
                <button
                  key={imp.id}
                  type="button"
                  onClick={() => setSelectedImport(imp)}
                  className={`w-full flex items-center justify-between rounded-lg px-4 py-3 text-left transition-colors ${
                    selectedImport?.id === imp.id
                      ? 'bg-zinc-800 ring-1 ring-zinc-700'
                      : 'hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-zinc-500 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-zinc-200">{imp.file_name || 'Unnamed file'}</p>
                      <p className="text-xs text-zinc-500">
                        {new Date(imp.created_at).toLocaleDateString()} &middot; {imp.total_records} records
                      </p>
                    </div>
                  </div>
                  {statusBadge(imp.status)}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected import summary */}
      {selectedImport && (
        <Card className="border-zinc-800/60 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              Import Summary: {selectedImport.file_name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center">
                <p className="text-2xl font-semibold text-zinc-100">{total}</p>
                <p className="text-xs text-zinc-500">Total Contacts</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-semibold text-green-400">{matched}</p>
                <p className="text-xs text-zinc-500">Matched in CRM</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-semibold text-zinc-400">{unmatched}</p>
                <p className="text-xs text-zinc-500">Unmatched</p>
              </div>
            </div>

            {/* Contact list */}
            {contactsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 text-zinc-500 animate-spin" />
              </div>
            ) : contacts.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-6">No contacts found for this import.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800">
                    <TableHead className="text-zinc-400">Name</TableHead>
                    <TableHead className="text-zinc-400">Company</TableHead>
                    <TableHead className="text-zinc-400">Position</TableHead>
                    <TableHead className="text-zinc-400">Connected</TableHead>
                    <TableHead className="text-zinc-400">Match</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact: ImportContact) => (
                    <TableRow key={contact.id} className="border-zinc-800/60">
                      <TableCell className="text-zinc-200 font-medium">
                        {[contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unknown'}
                      </TableCell>
                      <TableCell className="text-zinc-400">{contact.company || '-'}</TableCell>
                      <TableCell className="text-zinc-400">{contact.position || '-'}</TableCell>
                      <TableCell className="text-zinc-500 text-xs">
                        {contact.connected_on
                          ? new Date(contact.connected_on).toLocaleDateString()
                          : '-'}
                      </TableCell>
                      <TableCell>{confidenceBadge(contact.match_confidence)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
