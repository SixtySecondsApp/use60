import { useSearchParams } from 'react-router-dom';
import type { StatusFilter } from '@/lib/types/campaign';

const VALID_STATUSES: StatusFilter[] = ['all', 0, 1, 2, 3];

export function useCampaignFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawStatus = searchParams.get('status');
  const numStatus = rawStatus !== null ? Number(rawStatus) : NaN;
  const status: StatusFilter =
    rawStatus === 'all' || rawStatus === null
      ? 'all'
      : VALID_STATUSES.includes(numStatus as StatusFilter)
      ? (numStatus as StatusFilter)
      : 'all';

  function setStatus(s: StatusFilter) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (s === 'all') {
          next.delete('status');
        } else {
          next.set('status', String(s));
        }
        return next;
      },
      { replace: true }
    );
  }

  return { status, setStatus };
}
