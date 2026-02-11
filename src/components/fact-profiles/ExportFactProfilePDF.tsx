/**
 * ExportFactProfilePDF -- "Download PDF" button for Fact Profiles.
 *
 * Opens a clean, print-optimized HTML page in a new browser window/tab and
 * auto-triggers `window.print()`. The user can then "Save as PDF" from the
 * browser print dialog. No external dependencies required -- pure browser APIs.
 */

import { useState, useCallback } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  FactProfile,
  CompanyOverviewSection,
  MarketPositionSection,
  ProductsServicesSection,
  TeamLeadershipSection,
  FinancialsSection,
  TechnologySection,
  IdealCustomerIndicatorsSection,
  RecentActivitySection,
} from '@/lib/types/factProfile';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ExportFactProfilePDFProps {
  profile: FactProfile;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm';
}

// ---------------------------------------------------------------------------
// HTML escape helper (XSS prevention)
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return str.replace(/[&<>"']/g, (c) => map[c] || c);
}

// ---------------------------------------------------------------------------
// Section renderers -- each returns an HTML string (or empty string)
// ---------------------------------------------------------------------------

function renderField(label: string, value: string | number | null | undefined): string {
  if (!value && value !== 0) return '';
  return `
    <div class="field">
      <div class="field-label">${escapeHtml(label)}</div>
      <div class="field-value">${escapeHtml(String(value))}</div>
    </div>`;
}

function renderTagList(label: string, tags: string[] | undefined): string {
  if (!tags || tags.length === 0) return '';
  const tagHtml = tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  return `
    <div class="field">
      <div class="field-label">${escapeHtml(label)}</div>
      <div class="tags">${tagHtml}</div>
    </div>`;
}

function renderOverview(s: CompanyOverviewSection | undefined): string {
  if (!s) return '';
  const hasData = !!(s.name || s.description || s.headquarters || s.founded_year || s.company_type || s.website);
  if (!hasData) return '';

  return `
    <h2>Company Overview</h2>
    ${s.description ? `<p class="description">${escapeHtml(s.description)}</p>` : ''}
    <div class="field-grid">
      ${renderField('Headquarters', s.headquarters)}
      ${renderField('Founded', s.founded_year ? String(s.founded_year) : null)}
      ${renderField('Company Type', s.company_type)}
      ${renderField('Website', s.website)}
    </div>`;
}

function renderMarket(s: MarketPositionSection | undefined): string {
  if (!s) return '';
  const hasData = !!(s.industry || s.target_market || s.market_size || s.sub_industries?.length || s.differentiators?.length || s.competitors?.length);
  if (!hasData) return '';

  return `
    <h2>Market Position</h2>
    <div class="field-grid">
      ${renderField('Industry', s.industry)}
      ${renderField('Target Market', s.target_market)}
      ${renderField('Market Size', s.market_size)}
    </div>
    ${renderTagList('Sub-Industries', s.sub_industries)}
    ${renderTagList('Differentiators', s.differentiators)}
    ${renderTagList('Competitors', s.competitors)}`;
}

function renderProducts(s: ProductsServicesSection | undefined): string {
  if (!s) return '';
  const hasData = !!(s.products?.length || s.key_features?.length || s.use_cases?.length || s.pricing_model);
  if (!hasData) return '';

  return `
    <h2>Products &amp; Services</h2>
    ${renderTagList('Products', s.products)}
    ${renderTagList('Key Features', s.key_features)}
    ${renderTagList('Use Cases', s.use_cases)}
    ${renderField('Pricing Model', s.pricing_model)}`;
}

function renderTeam(s: TeamLeadershipSection | undefined): string {
  if (!s) return '';
  const hasData = !!(s.employee_count || s.employee_range || s.key_people?.length || s.departments?.length || s.hiring_signals?.length);
  if (!hasData) return '';

  let peopleHtml = '';
  if (s.key_people && s.key_people.length > 0) {
    peopleHtml = `
      <div class="field">
        <div class="field-label">Key People</div>
        <div class="people-list">
          ${s.key_people
            .map(
              (p) => `
            <div class="person">
              <span class="person-name">${escapeHtml(p.name)}</span>
              ${p.title ? `<span class="person-title"> &mdash; ${escapeHtml(p.title)}</span>` : ''}
            </div>`
            )
            .join('')}
        </div>
      </div>`;
  }

  return `
    <h2>Team &amp; Leadership</h2>
    <div class="field-grid">
      ${renderField('Employee Count', s.employee_count)}
      ${renderField('Employee Range', s.employee_range)}
    </div>
    ${peopleHtml}
    ${renderTagList('Departments', s.departments)}
    ${renderTagList('Hiring Signals', s.hiring_signals)}`;
}

function renderFinancials(s: FinancialsSection | undefined): string {
  if (!s) return '';
  const hasData = !!(s.revenue_range || s.funding_status || s.total_raised || s.valuation || s.investors?.length || s.funding_rounds?.length);
  if (!hasData) return '';

  let roundsHtml = '';
  if (s.funding_rounds && s.funding_rounds.length > 0) {
    const rows = s.funding_rounds
      .map(
        (fr) => `
      <tr>
        <td>${escapeHtml(fr.round || '--')}</td>
        <td>${escapeHtml(fr.amount || '--')}</td>
        <td>${escapeHtml(fr.date || '--')}</td>
      </tr>`
      )
      .join('');

    roundsHtml = `
      <div class="field">
        <div class="field-label">Funding Rounds</div>
        <table>
          <thead>
            <tr>
              <th>Round</th>
              <th>Amount</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  return `
    <h2>Financials</h2>
    <div class="field-grid">
      ${renderField('Revenue Range', s.revenue_range)}
      ${renderField('Funding Status', s.funding_status)}
      ${renderField('Total Raised', s.total_raised)}
      ${renderField('Valuation', s.valuation)}
    </div>
    ${renderTagList('Investors', s.investors)}
    ${roundsHtml}`;
}

function renderTech(s: TechnologySection | undefined): string {
  if (!s) return '';
  const hasData = !!(s.tech_stack?.length || s.platforms?.length || s.integrations?.length);
  if (!hasData) return '';

  return `
    <h2>Technology</h2>
    ${renderTagList('Tech Stack', s.tech_stack)}
    ${renderTagList('Platforms', s.platforms)}
    ${renderTagList('Integrations', s.integrations)}`;
}

function renderICP(s: IdealCustomerIndicatorsSection | undefined): string {
  if (!s) return '';
  const hasData = !!(s.target_industries?.length || s.target_company_sizes?.length || s.target_roles?.length || s.buying_signals?.length || s.pain_points?.length || s.value_propositions?.length);
  if (!hasData) return '';

  return `
    <h2>Ideal Customer Indicators</h2>
    ${renderTagList('Target Industries', s.target_industries)}
    ${renderTagList('Target Company Sizes', s.target_company_sizes)}
    ${renderTagList('Target Roles', s.target_roles)}
    ${renderTagList('Buying Signals', s.buying_signals)}
    ${renderTagList('Pain Points', s.pain_points)}
    ${renderTagList('Value Propositions', s.value_propositions)}`;
}

function renderActivity(s: RecentActivitySection | undefined): string {
  if (!s) return '';
  const hasData = !!(s.news?.length || s.awards?.length || s.milestones?.length);
  if (!hasData) return '';

  let newsHtml = '';
  if (s.news && s.news.length > 0) {
    const items = s.news
      .map((item) => {
        const title = escapeHtml(item.title);
        const dateStr = item.date ? ` <span class="news-date">${escapeHtml(item.date)}</span>` : '';
        if (item.url) {
          return `<li><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${title}</a>${dateStr}</li>`;
        }
        return `<li>${title}${dateStr}</li>`;
      })
      .join('');

    newsHtml = `
      <div class="field">
        <div class="field-label">News</div>
        <ul class="news-list">${items}</ul>
      </div>`;
  }

  return `
    <h2>Recent Activity</h2>
    ${newsHtml}
    ${renderTagList('Awards', s.awards)}
    ${renderTagList('Milestones', s.milestones)}`;
}

// ---------------------------------------------------------------------------
// Approval badge
// ---------------------------------------------------------------------------

function renderApprovalBadge(profile: FactProfile): string {
  const status = profile.approval_status;
  if (status === 'draft') return '';

  const labels: Record<string, { text: string; cls: string }> = {
    pending_review: { text: 'Pending Review', cls: 'pending' },
    approved: {
      text: profile.approved_by ? `Approved by ${escapeHtml(profile.approved_by)}` : 'Approved',
      cls: 'approved',
    },
    changes_requested: { text: 'Changes Requested', cls: 'changes-requested' },
    archived: { text: 'Archived', cls: 'archived' },
  };

  const config = labels[status];
  if (!config) return '';

  return `<span class="status-badge ${config.cls}">${config.text}</span>`;
}

// ---------------------------------------------------------------------------
// Full HTML document generator
// ---------------------------------------------------------------------------

function generatePrintHTML(profile: FactProfile): string {
  const rd = profile.research_data;
  const overview = rd?.company_overview;
  const market = rd?.market_position;

  const companyName = escapeHtml(overview?.name || profile.company_name);
  const domain = profile.company_domain ? escapeHtml(profile.company_domain) : '';
  const tagline = overview?.tagline ? escapeHtml(overview.tagline) : '';

  // Build meta fragments
  const metaParts: string[] = [];
  if (domain) metaParts.push(domain);
  if (overview?.headquarters) metaParts.push(escapeHtml(overview.headquarters));
  if (overview?.founded_year) metaParts.push(`Founded ${overview.founded_year}`);
  if (overview?.company_type) metaParts.push(escapeHtml(overview.company_type));
  if (market?.industry) metaParts.push(escapeHtml(market.industry));
  const metaLine = metaParts.join(' &middot; ');

  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${companyName} — Fact Profile</title>
  <style>
    /* Reset & base */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1E293B;
      max-width: 780px;
      margin: 0 auto;
      padding: 40px 32px;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Header */
    .header { margin-bottom: 28px; }
    .company-row { display: flex; align-items: center; gap: 16px; margin-bottom: 8px; }
    .avatar {
      width: 52px; height: 52px;
      border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      background: #EFF6FF;
      color: #2563EB;
      font-size: 22px; font-weight: 700;
      flex-shrink: 0;
    }
    h1 { font-size: 24px; font-weight: 700; line-height: 1.2; }
    .tagline { color: #64748B; font-size: 14px; margin-top: 4px; }
    .meta { color: #64748B; font-size: 12px; margin-top: 6px; }

    /* Approval badge */
    .status-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px; font-weight: 500;
      margin-top: 8px;
    }
    .approved { background: #D1FAE5; color: #065F46; }
    .pending { background: #FEF3C7; color: #92400E; }
    .changes-requested { background: #FFEDD5; color: #9A3412; }
    .archived { background: #F1F5F9; color: #475569; }

    /* Sections */
    h2 {
      font-size: 15px; font-weight: 600;
      color: #1E293B;
      border-bottom: 1px solid #E2E8F0;
      padding-bottom: 8px;
      margin-top: 28px;
      margin-bottom: 14px;
    }

    /* Fields */
    .field { margin-bottom: 10px; }
    .field-label {
      font-weight: 600;
      font-size: 11px;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      margin-bottom: 3px;
    }
    .field-value { font-size: 13px; color: #1E293B; }
    .field-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 10px;
      margin-bottom: 10px;
    }
    .description {
      font-size: 13px;
      color: #334155;
      line-height: 1.6;
      margin-bottom: 12px;
    }

    /* Tags */
    .tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 3px; }
    .tag {
      display: inline-block;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 12px;
      padding: 2px 10px;
      font-size: 11px;
      color: #334155;
    }

    /* People */
    .people-list { margin-top: 4px; }
    .person { margin-bottom: 4px; font-size: 13px; }
    .person-name { font-weight: 600; color: #1E293B; }
    .person-title { color: #64748B; }

    /* Table */
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { text-align: left; padding: 6px 10px; font-size: 12px; border-bottom: 1px solid #E2E8F0; }
    th { font-weight: 600; color: #64748B; background: #F8FAFC; }
    td { color: #1E293B; }

    /* News */
    .news-list { list-style: none; margin-top: 4px; }
    .news-list li { font-size: 13px; padding: 4px 0; border-bottom: 1px solid #F1F5F9; }
    .news-list li:last-child { border-bottom: none; }
    .news-list a { color: #2563EB; text-decoration: none; }
    .news-date { color: #94A3B8; font-size: 11px; margin-left: 6px; }

    /* Footer */
    .footer {
      margin-top: 36px;
      padding-top: 14px;
      border-top: 1px solid #E2E8F0;
      color: #94A3B8;
      font-size: 11px;
      text-align: center;
    }

    /* Print adjustments */
    @media print {
      body { padding: 20px 16px; }
      h2 { break-after: avoid; }
      .field, .people-list, table { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-row">
      <div class="avatar">${companyName.charAt(0)}</div>
      <h1>${companyName}</h1>
    </div>
    ${tagline ? `<p class="tagline">${tagline}</p>` : ''}
    ${metaLine ? `<p class="meta">${metaLine}</p>` : ''}
    ${renderApprovalBadge(profile)}
  </div>

  ${renderOverview(rd?.company_overview)}
  ${renderMarket(rd?.market_position)}
  ${renderProducts(rd?.products_services)}
  ${renderTeam(rd?.team_leadership)}
  ${renderFinancials(rd?.financials)}
  ${renderTech(rd?.technology)}
  ${renderICP(rd?.ideal_customer_indicators)}
  ${renderActivity(rd?.recent_activity)}

  <div class="footer">
    Generated on ${escapeHtml(dateStr)} via 60${profile.version > 1 ? ` &middot; Version ${profile.version}` : ''}
  </div>

  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExportFactProfilePDF({
  profile,
  variant = 'outline',
  size = 'default',
}: ExportFactProfilePDFProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleExport = useCallback(() => {
    setIsGenerating(true);

    // Small delay to show the loading state before the new window steals focus
    setTimeout(() => {
      const html = generatePrintHTML(profile);
      const printWindow = window.open('', '_blank');

      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
      }

      setIsGenerating(false);
    }, 100);
  }, [profile]);

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleExport}
      disabled={isGenerating}
      className="gap-1.5"
    >
      {isGenerating ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      Download PDF
    </Button>
  );
}
