import type { CampaignStatus } from '@/lib/types/campaign';

export function campaignStatusLabel(status: CampaignStatus | number): string {
  switch (status) {
    case 0: return 'Draft';
    case 1: return 'Active';
    case 2: return 'Paused';
    case 3: return 'Completed';
    default: return 'Unknown';
  }
}

export function campaignStatusColor(status: CampaignStatus | number): string {
  switch (status) {
    case 1: return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
    case 2: return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
    case 3: return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    default: return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
  }
}

export function formatCampaignDate(dateStr?: string): string | null {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}
