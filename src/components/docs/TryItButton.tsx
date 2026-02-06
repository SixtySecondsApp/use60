import { useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';

interface TryItButtonProps {
  tableId: string;
  query?: string;
  label?: string;
}

export function TryItButton({ tableId, query, label = 'Try It' }: TryItButtonProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    const searchParams = new URLSearchParams();
    if (query) {
      searchParams.set('query', query);
    }
    navigate(`/ops/${tableId}?${searchParams.toString()}`);
  };

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700
        text-white font-medium rounded-lg transition-colors"
    >
      <span>{label}</span>
      <ExternalLink className="w-4 h-4" />
    </button>
  );
}
