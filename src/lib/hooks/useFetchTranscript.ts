import { useState } from 'react'
import { supabase } from '@/lib/supabase/clientV2'

interface FetchTranscriptResult {
  success: boolean
  transcript: string | null
  transcript_doc_url: string | null
  cached: boolean
  processing?: boolean
  error?: string
}

export function useFetchTranscript() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTranscript = async (meetingId: string): Promise<FetchTranscriptResult | null> => {
    setLoading(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        throw new Error('No active session')
      }

      const response = await supabase.functions.invoke('fetch-router', {
        body: { action: 'transcript', meetingId },
      })

      if (response.error) {
        throw response.error
      }

      const result = response.data as FetchTranscriptResult

      if (!result.success) {
        if (result.processing) {
          setError('Transcript is still being processed by Fathom. Please try again in a few minutes.')
        } else {
          setError(result.error || 'Failed to fetch transcript')
        }
        return result
      }

      return result
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to fetch transcript'
      setError(errorMessage)
      return null
    } finally {
      setLoading(false)
    }
  }

  return {
    fetchTranscript,
    loading,
    error,
  }
}
