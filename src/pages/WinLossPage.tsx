import { Helmet } from 'react-helmet-async';
import { Trophy } from 'lucide-react';

export default function WinLossPage() {
  return (
    <>
      <Helmet><title>Win / Loss Analysis | 60</title></Helmet>
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
        <Trophy className="h-12 w-12" />
        <h1 className="text-xl font-semibold text-foreground">Win / Loss Analysis</h1>
        <p>Coming soon — track win rates, loss reasons, and competitive patterns.</p>
      </div>
    </>
  );
}
