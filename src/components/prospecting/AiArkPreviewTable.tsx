import { ExternalLink } from 'lucide-react';
import type {
  NormalizedAiArkCompany,
  NormalizedAiArkContact,
} from '@/lib/services/aiArkSearchService';

// ---------------------------------------------------------------------------
// Company preview table
// ---------------------------------------------------------------------------

interface AiArkCompanyPreviewTableProps {
  companies: NormalizedAiArkCompany[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  allSelected: boolean;
}

export function AiArkCompanyPreviewTable({
  companies,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  allSelected,
}: AiArkCompanyPreviewTableProps) {
  if (companies.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 px-4 py-8 text-center text-sm text-zinc-500">
        No results
      </div>
    );
  }

  const hasTech = companies.some((c) => c.technologies && c.technologies.length > 0);
  const hasLocation = companies.some((c) => c.location);
  const hasEmployees = companies.some((c) => c.employee_count !== null);
  const hasFoundedYear = companies.some((c) => c.founded_year !== null);

  return (
    <div className="rounded-lg border border-zinc-700 overflow-hidden">
      <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-zinc-700 bg-zinc-800">
              <th className="px-3 py-2 text-left w-8">
                <input
                  type="checkbox"
                  checked={allSelected && companies.length > 0}
                  onChange={onSelectAll}
                  className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-700 accent-blue-500 cursor-pointer"
                />
              </th>
              <th className="px-3 py-2 text-left text-zinc-400 font-medium whitespace-nowrap">Company</th>
              <th className="px-3 py-2 text-left text-zinc-400 font-medium whitespace-nowrap">Industry</th>
              {hasLocation && <th className="px-3 py-2 text-left text-zinc-400 font-medium whitespace-nowrap">Location</th>}
              {hasEmployees && <th className="px-3 py-2 text-left text-zinc-400 font-medium whitespace-nowrap">Employees</th>}
              {hasFoundedYear && <th className="px-3 py-2 text-left text-zinc-400 font-medium whitespace-nowrap">Founded</th>}
              {hasTech && <th className="px-3 py-2 text-left text-zinc-400 font-medium whitespace-nowrap">Technologies</th>}
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => {
              const isSelected = selectedIds.has(company.ai_ark_id);
              return (
                <tr
                  key={company.ai_ark_id}
                  onClick={() => onToggleSelect(company.ai_ark_id)}
                  className={`border-b border-zinc-800 cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-500/10' : 'hover:bg-zinc-800/30'
                  }`}
                >
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(company.ai_ark_id)}
                      className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-700 accent-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      {company.domain && (
                        <img
                          src={`https://img.logo.dev/${company.domain}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=32&format=png`}
                          alt=""
                          className="w-4 h-4 rounded-sm object-contain shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                      <span className="text-zinc-200 font-medium">{company.company_name}</span>
                      {company.domain && (
                        <a
                          href={`https://${company.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-zinc-600 hover:text-blue-400 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-zinc-400 max-w-[160px] truncate">
                    {company.industry ?? '—'}
                  </td>
                  {hasLocation && (
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                      {company.location ?? '—'}
                    </td>
                  )}
                  {hasEmployees && (
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                      {company.employee_range ?? (company.employee_count ? company.employee_count.toLocaleString() : '—')}
                    </td>
                  )}
                  {hasFoundedYear && (
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                      {company.founded_year ?? '—'}
                    </td>
                  )}
                  {hasTech && (
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {(company.technologies ?? []).slice(0, 3).map((t) => (
                          <span
                            key={t}
                            className="text-[10px] bg-zinc-700/60 text-zinc-400 px-1.5 py-0.5 rounded"
                          >
                            {t}
                          </span>
                        ))}
                        {(company.technologies?.length ?? 0) > 3 && (
                          <span className="text-[10px] text-zinc-600">
                            +{(company.technologies?.length ?? 0) - 3}
                          </span>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// People preview table
// ---------------------------------------------------------------------------

interface AiArkPeoplePreviewTableProps {
  contacts: NormalizedAiArkContact[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  allSelected: boolean;
}

export function AiArkPeoplePreviewTable({
  contacts,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  allSelected,
}: AiArkPeoplePreviewTableProps) {
  if (contacts.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 px-4 py-8 text-center text-sm text-zinc-500">
        No results
      </div>
    );
  }

  const hasLocation = contacts.some((c) => c.location);
  const hasSeniority = contacts.some((c) => c.seniority);

  return (
    <div className="rounded-lg border border-zinc-700 overflow-hidden">
      <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-zinc-700 bg-zinc-800">
              <th className="px-3 py-2 text-left w-8">
                <input
                  type="checkbox"
                  checked={allSelected && contacts.length > 0}
                  onChange={onSelectAll}
                  className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-700 accent-blue-500 cursor-pointer"
                />
              </th>
              <th className="px-3 py-2 text-left text-zinc-400 font-medium whitespace-nowrap">Name</th>
              <th className="px-3 py-2 text-left text-zinc-400 font-medium whitespace-nowrap">Title</th>
              <th className="px-3 py-2 text-left text-zinc-400 font-medium whitespace-nowrap">Company</th>
              {hasSeniority && <th className="px-3 py-2 text-left text-zinc-400 font-medium whitespace-nowrap">Seniority</th>}
              {hasLocation && <th className="px-3 py-2 text-left text-zinc-400 font-medium whitespace-nowrap">Location</th>}
              <th className="px-3 py-2 text-left text-zinc-400 font-medium whitespace-nowrap">LinkedIn</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => {
              const isSelected = selectedIds.has(contact.ai_ark_id);
              return (
                <tr
                  key={contact.ai_ark_id}
                  onClick={() => onToggleSelect(contact.ai_ark_id)}
                  className={`border-b border-zinc-800 cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-500/10' : 'hover:bg-zinc-800/30'
                  }`}
                >
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(contact.ai_ark_id)}
                      className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-700 accent-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2 text-zinc-200 whitespace-nowrap font-medium">
                    {contact.full_name || `${contact.first_name} ${contact.last_name}`.trim()}
                  </td>
                  <td className="px-3 py-2 text-zinc-400 max-w-[160px] truncate">{contact.title ?? '—'}</td>
                  <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      {contact.current_company_domain && (
                        <img
                          src={`https://img.logo.dev/${contact.current_company_domain}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=32&format=png`}
                          alt=""
                          className="w-4 h-4 rounded-sm object-contain shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                      {contact.current_company ?? '—'}
                    </span>
                  </td>
                  {hasSeniority && (
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                      {contact.seniority ?? '—'}
                    </td>
                  )}
                  {hasLocation && (
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                      {contact.location ?? '—'}
                    </td>
                  )}
                  <td className="px-3 py-2 whitespace-nowrap">
                    {contact.linkedin_url ? (
                      <a
                        href={contact.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        Profile
                      </a>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
