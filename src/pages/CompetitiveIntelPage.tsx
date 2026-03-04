import { Helmet } from 'react-helmet-async';
import { Swords } from 'lucide-react';

export default function CompetitiveIntelPage() {
  return (
    <>
      <Helmet><title>Competitive Intelligence | 60</title></Helmet>
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
        <Swords className="h-12 w-12" />
        <h1 className="text-xl font-semibold text-foreground">Competitive Intelligence</h1>
        <p>Coming soon — battlecards, competitor tracking, and win/loss positioning.</p>
      </div>
    </>
  );
}
