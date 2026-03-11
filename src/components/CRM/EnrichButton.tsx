import React, { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { enrichContact, enrichCompany, type EnrichmentResult } from '@/lib/services/geminiEnrichmentService';
import type { Contact, Company } from '@/lib/database/models';
import { useCreditGatedAction } from '@/lib/hooks/useCreditGatedAction';

interface EnrichButtonProps {
  type: 'contact' | 'company';
  record: Contact | Company;
  onEnriched?: (data: any) => void;
  className?: string;
}

/**
 * EnrichButton Component
 * 
 * Provides AI-powered enrichment for contacts and companies using Gemini.
 * Shows loading state and handles success/error notifications.
 */
export function EnrichButton({ type, record, onEnriched, className }: EnrichButtonProps) {
  const [isEnriching, setIsEnriching] = useState(false);
  const actionName = type === 'contact' ? 'contact_enrichment' : 'company_enrichment';
  const { execute: executeEnrichGated } = useCreditGatedAction(actionName, 3);

  const handleEnrich = async () => {
    await executeEnrichGated(async () => {
    setIsEnriching(true);

    try {
      let result: EnrichmentResult<any>;

      if (type === 'contact') {
        result = await enrichContact(record as Contact);
      } else {
        result = await enrichCompany(record as Company);
      }

      if (result.success && result.data) {
        toast.success(
          `Successfully enriched ${type} with ${Object.keys(result.data).length} fields`,
          {
            description: result.confidence
              ? `Confidence: ${Math.round(result.confidence * 100)}%`
              : undefined,
          }
        );

        if (onEnriched) {
          onEnriched(result.data);
        }
      } else {
        toast.error(
          result.error || `Failed to enrich ${type}`,
          {
            description: 'Please try again or check your API configuration.',
          }
        );
      }
    } catch (error) {
      toast.error(
        `Error enriching ${type}`,
        {
          description: error instanceof Error ? error.message : 'An unexpected error occurred',
        }
      );
    } finally {
      setIsEnriching(false);
    }
    });
  };

  return (
    <Button
      onClick={handleEnrich}
      disabled={isEnriching}
      variant="outline"
      size="sm"
      className={className}
    >
      {isEnriching ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Enriching...
        </>
      ) : (
        <>
          <Sparkles className="w-4 h-4 mr-2" />
          Enrich with AI
        </>
      )}
    </Button>
  );
}

export default EnrichButton;



