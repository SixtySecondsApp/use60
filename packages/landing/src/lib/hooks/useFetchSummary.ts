import { useState } from 'react'
import { supabase } from '@/lib/supabase/clientV2'

interface FetchSummaryResult {
  success: boolean
  summary: string | null
  sentiment_score: string | null
  coach_summary: string | null
  talk_time_rep_pct: number | null
  talk_time_customer_pct: number | null
  talk_time_judgement: string | null
  cached: boolean
  processing?: boolean
  error?: string
}

export function useFetchSummary() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSummary = async (meetingId: string): Promise<FetchSummaryResult | null> => {
    setLoading(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        throw new Error('No active session')
      }

      const response = await supabase.functions.invoke('fetch-router', {
        body: { action: 'summary', meetingId },
      })

      if (response.error) {
        throw response.error
      }

      const result = response.data as FetchSummaryResult

      if (!result.success) {
        if (result.processing) {
          setError('Summary is still being processed by Fathom. Please try again in a few minutes.')
        } else {
          setError(result.error || 'Failed to fetch summary')
        }
        return result
      }

      return result
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to fetch summary'
      setError(errorMessage)
      return null
    } finally {
      setLoading(false)
    }
  }

  return {
    fetchSummary,
    loading,
    error,
  }
}
