import { Helmet } from 'react-helmet-async';
import { FileSearch } from 'lucide-react';

export default function SearchResultsPage() {
  return (
    <>
      <Helmet><title>Search Results | 60</title></Helmet>
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
        <FileSearch className="h-12 w-12" />
        <h1 className="text-xl font-semibold text-foreground">Search Results</h1>
        <p>No results to display. Use the search bar to find deals, contacts, and meetings.</p>
      </div>
    </>
  );
}
