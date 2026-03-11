import { useState, useCallback } from 'react'
import { useAuth } from '@/lib/contexts/AuthContext'
import { useOrgStore } from '@/lib/stores/orgStore'
import { toast } from 'sonner'
import {
  linkedinGraphImportService,
  ArchiveImport,
  ImportContact,
  RelationshipScore,
} from '@/lib/services/linkedinGraphImportService'

export function useLinkedInGraphImport() {
  const { user, isAuthenticated } = useAuth()
  const activeOrgId = useOrgStore((s) => s.activeOrgId)

  // Imports
  const [imports, setImports] = useState<ArchiveImport[]>([])
  const [loading, setLoading] = useState(false)

  // Contacts for a selected import
  const [contacts, setContacts] = useState<ImportContact[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)

  // Relationship scores
  const [scores, setScores] = useState<RelationshipScore[]>([])
  const [scoresLoading, setScoresLoading] = useState(false)

  // ---------------------------------------------------------------------------
  // Load all imports for the org
  // ---------------------------------------------------------------------------

  const loadImports = useCallback(async () => {
    if (!isAuthenticated || !user) return
    try {
      setLoading(true)
      const result = await linkedinGraphImportService.listImports()
      setImports(result)
    } catch (e: any) {
      toast.error(e.message || 'Failed to load imports')
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, user])

  // ---------------------------------------------------------------------------
  // Load contacts for a specific import
  // ---------------------------------------------------------------------------

  const loadContacts = useCallback(async (importId: string) => {
    if (!isAuthenticated || !user) return
    try {
      setContactsLoading(true)
      const result = await linkedinGraphImportService.getImportContacts(importId)
      setContacts(result)
    } catch (e: any) {
      toast.error(e.message || 'Failed to load import contacts')
    } finally {
      setContactsLoading(false)
    }
  }, [isAuthenticated, user])

  // ---------------------------------------------------------------------------
  // Load relationship scores for the org
  // ---------------------------------------------------------------------------

  const loadScores = useCallback(async () => {
    if (!isAuthenticated || !user || !activeOrgId) return
    try {
      setScoresLoading(true)
      const result = await linkedinGraphImportService.getRelationshipScores(activeOrgId)
      setScores(result)
    } catch (e: any) {
      toast.error(e.message || 'Failed to load relationship scores')
    } finally {
      setScoresLoading(false)
    }
  }, [isAuthenticated, user, activeOrgId])

  // ---------------------------------------------------------------------------
  // Create a new import record
  // ---------------------------------------------------------------------------

  const createImport = useCallback(async (fileName: string, fileType: string) => {
    if (!isAuthenticated || !user || !activeOrgId) {
      toast.error('Not authenticated or no org selected')
      return null
    }
    try {
      const result = await linkedinGraphImportService.createImport(activeOrgId, fileName, fileType)
      toast.success('Import started')
      setImports((prev) => [result, ...prev])
      return result
    } catch (e: any) {
      toast.error(e.message || 'Failed to create import')
      return null
    }
  }, [isAuthenticated, user, activeOrgId])

  return {
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
  }
}
