/**
 * Pipeline utility functions
 */

import type { PipelineDeal } from './hooks/usePipelineData';

/**
 * Export deals to CSV and trigger browser download.
 */
export function exportDealsToCSV(deals: PipelineDeal[], filename = 'pipeline-export.csv') {
  const headers = [
    'Company',
    'Deal Name',
    'Value',
    'Stage',
    'Health Status',
    'Health Score',
    'Risk Level',
    'Probability (%)',
    'Days in Stage',
    'Close Date',
    'Owner',
    'Status',
  ];

  const escape = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = deals.map((deal) => {
    const ownerName = deal.split_users?.[0]?.full_name || '';
    return [
      escape(deal.company),
      escape(deal.name),
      escape(deal.value),
      escape(deal.stage_name),
      escape(deal.health_status),
      escape(deal.health_score),
      escape(deal.risk_level),
      escape(deal.probability),
      escape(deal.days_in_current_stage),
      escape(deal.close_date),
      escape(ownerName),
      escape(deal.status),
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
