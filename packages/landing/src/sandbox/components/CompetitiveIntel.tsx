/**
 * CompetitiveIntel
 *
 * Shows real competitive landscape data from enrichment.
 * Renders competitor cards with logos, names, and differentiators.
 * Hidden if no competitive data available.
 */

import { Swords } from 'lucide-react';

interface Competitor {
  name: string;
  domain: string;
  differentiators: string[];
}

interface CompetitiveIntelProps {
  companyName: string;
  competitors: Competitor[];
}

export function CompetitiveIntel({ companyName, competitors }: CompetitiveIntelProps) {
  if (!competitors || competitors.length === 0) return null;

  return (
    <div className="rounded-xl bg-gray-900/40 border border-gray-800/50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Swords className="w-4 h-4 text-amber-400" />
        <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
          Competitive Landscape
        </h3>
      </div>

      <div className="space-y-3">
        {competitors.slice(0, 3).map((comp) => (
          <div
            key={comp.domain}
            className="flex items-start gap-3 p-2.5 rounded-lg bg-gray-800/30 border border-gray-700/30"
          >
            <img
              src={`https://img.logo.dev/${comp.domain}?token=pk_SEEwPOLDTHG0lJRhBCDVKA&size=40&format=png`}
              alt=""
              className="w-8 h-8 rounded-md bg-gray-800 object-contain shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-200 font-medium">{comp.name}</p>
              <div className="mt-1 space-y-0.5">
                {comp.differentiators.slice(0, 2).map((diff, i) => (
                  <p key={i} className="text-xs text-gray-500 leading-relaxed">
                    <span className="text-amber-400/70 mr-1">vs {companyName}:</span>
                    {diff}
                  </p>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
