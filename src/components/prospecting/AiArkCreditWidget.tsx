import { Coins, Loader2 } from 'lucide-react';

interface AiArkCreditWidgetProps {
  creditsConsumed: number | null;
  isLoading?: boolean;
  className?: string;
}

/**
 * Shows AI Ark credit info.
 * AI Ark charges -2.5 credits/company request and -12.5 credits/people request.
 * Credits consumed come from the x-credit response header, passed through the edge function.
 */
export function AiArkCreditWidget({
  creditsConsumed,
  isLoading = false,
  className,
}: AiArkCreditWidgetProps) {
  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 text-xs text-zinc-500 ${className ?? ''}`}>
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Checking credits...</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 text-xs ${className ?? ''}`}>
      <Coins className="w-3 h-3 text-amber-400 shrink-0" />
      {creditsConsumed !== null ? (
        <span className="text-zinc-400">
          <span className="text-amber-400 font-medium">{Math.abs(creditsConsumed)}</span>
          {' '}credits consumed this session
        </span>
      ) : (
        <span className="text-zinc-500">Company: 2.5 credits/search · People: 12.5 credits/search</span>
      )}
    </div>
  );
}
