import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PipelineTemplatesGallery from '@/components/ops/PipelineTemplatesGallery';

export default function PipelineGalleryPage() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <button
        onClick={() => navigate('/ops')}
        className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Ops
      </button>
      <PipelineTemplatesGallery
        onPipelineCreated={(tableId) => navigate(`/ops/${tableId}`)}
      />
    </div>
  );
}
