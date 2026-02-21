import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Layers } from 'lucide-react';
import { ProspectingTabs, type ProspectingTab } from '@/components/prospecting/ProspectingTabs';
import { SavedSearches } from '@/components/prospecting/SavedSearches';
import { AiArkSearchWizard } from '@/components/prospecting/AiArkSearchWizard';
import { AiArkSimilaritySearch } from '@/components/prospecting/AiArkSimilaritySearch';
import { ApolloSearchWizard } from '@/components/ops/ApolloSearchWizard';
import { AiArkCreditWidget } from '@/components/prospecting/AiArkCreditWidget';

// ---------------------------------------------------------------------------
// Combined placeholder
// ---------------------------------------------------------------------------

function CombinedPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-700/50 bg-gradient-to-br from-blue-500/10 to-purple-500/10 mb-4">
        <Layers className="w-7 h-7 text-zinc-500" />
      </div>
      <h3 className="text-base font-semibold text-zinc-200 mb-2">Combined Search Coming Soon</h3>
      <p className="text-sm text-zinc-500 max-w-sm">
        Search across AI Ark and Apollo simultaneously, de-duplicate results, and import the best leads — all in one step.
      </p>
      <span className="mt-4 inline-block text-xs font-medium px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
        Coming in v2
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Ark inline panel
// ---------------------------------------------------------------------------

function AiArkInlinePanel({ onComplete, initialDomain }: { onComplete: (tableId: string) => void; initialDomain?: string }) {
  return (
    <div className="w-full">
      {/* Credit info row */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-zinc-800/60">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">AI Ark Company &amp; People Search</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Search 5K+ curated companies and contacts with technology stack, industry, and location filters.
          </p>
        </div>
        <AiArkCreditWidget creditsConsumed={null} />
      </div>

      {/* Wizard rendered as dialog — always open */}
      <AiArkSearchWizard
        open={true}
        onOpenChange={() => { /* inline — never closes */ }}
        onComplete={onComplete}
        initialDomain={initialDomain}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Similarity search inline panel
// ---------------------------------------------------------------------------

function SimilarityInlinePanel({ onComplete, initialDomain }: { onComplete: (tableId: string) => void; initialDomain?: string }) {
  return (
    <div className="w-full">
      <AiArkSimilaritySearch onComplete={onComplete} initialDomain={initialDomain} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Apollo inline panel
// ---------------------------------------------------------------------------

function ApolloInlinePanel({ onComplete }: { onComplete: (tableId: string) => void }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-zinc-800/60">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Apollo People Search</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Search Apollo&apos;s database of 275M+ contacts with advanced title, location, and seniority filters.
          </p>
        </div>
      </div>
      <ApolloSearchWizard
        open={true}
        onOpenChange={() => { /* inline — never closes */ }}
        onComplete={onComplete}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ProspectingHub() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<ProspectingTab>('ai_ark');

  // Read URL params set by "Find Similar" buttons on deal/contact cards
  // e.g. /prospecting?action=similarity&domain=acme.com
  const urlDomain = searchParams.get('domain') ?? undefined;
  const urlAction = searchParams.get('action');

  useEffect(() => {
    if (urlAction === 'similarity' && urlDomain) {
      setActiveTab('similar');
    } else if (urlDomain) {
      // domain param without action → open ai_ark tab with domain pre-filled
      setActiveTab('ai_ark');
    }
  }, [urlAction, urlDomain]);

  const handleComplete = (tableId: string) => {
    navigate(`/ops/${tableId}`);
  };

  return (
    <>
      <Helmet><title>Prospecting | 60</title></Helmet>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800/60 bg-gradient-to-br from-blue-500/20 to-purple-500/20">
            <Search className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100">Prospecting</h1>
            <p className="text-sm text-zinc-500">Find and import leads from premium data sources</p>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="mb-6">
          <ProspectingTabs activeTab={activeTab} onChange={setActiveTab} />
        </div>

        {/* Two-column layout: main content + sidebar */}
        <div className="flex gap-6 items-start">
          {/* Main content */}
          <div className="flex-1 min-w-0 rounded-xl border border-zinc-800/60 bg-zinc-900/60 p-6">
            {activeTab === 'ai_ark' && (
              <AiArkInlinePanel onComplete={handleComplete} initialDomain={urlAction !== 'similarity' ? urlDomain : undefined} />
            )}
            {activeTab === 'apollo' && (
              <ApolloInlinePanel onComplete={handleComplete} />
            )}
            {activeTab === 'similar' && (
              <SimilarityInlinePanel onComplete={handleComplete} initialDomain={urlAction === 'similarity' ? urlDomain : undefined} />
            )}
            {activeTab === 'combined' && (
              <CombinedPlaceholder />
            )}
          </div>

          {/* Sidebar */}
          <div className="w-72 shrink-0 space-y-6">
            <SavedSearches
              onSelect={(search) => {
                // Switch to the right tab when a saved search is selected
                if (search.provider === 'apollo') setActiveTab('apollo');
                else setActiveTab('ai_ark');
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
