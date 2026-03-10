import { useState, useCallback } from 'react';

export interface FollowUpDraft {
  id: string;
  meeting_id?: string;
  to_email: string;
  to_name?: string;
  subject: string;
  body: string;
  status: string;
  generated_at: string;
  [key: string]: unknown;
}

interface UseFollowUpDraftsOptions {
  orgId?: string;
  userId?: string;
  status?: string;
}

export function useFollowUpDrafts(options: UseFollowUpDraftsOptions) {
  const [drafts] = useState<FollowUpDraft[]>([]);
  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);

  const refetch = useCallback(() => {}, []);
  const updateDraftStatus = useCallback(async (_id: string, _status: string) => {}, []);

  return { drafts, isLoading, error, refetch, updateDraftStatus };
}
