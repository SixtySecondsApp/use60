import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  uploadAndParseDocument,
  type TemplateExtraction,
} from '@/lib/services/proposalService';

export interface TemplateUploaderProps {
  orgId: string;
  onExtractionComplete: (extraction: TemplateExtraction, assetId: string, fileName: string) => void;
  className?: string;
}

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

export default function TemplateUploader({
  orgId,
  onExtractionComplete,
  className,
}: TemplateUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      // Also check extension as fallback
      const ext = file.name.toLowerCase().split('.').pop();
      if (ext !== 'pdf' && ext !== 'docx') {
        return 'Invalid file type. Only .docx and .pdf files are supported.';
      }
    }
    if (file.size > MAX_SIZE_BYTES) {
      return 'File too large. Maximum size: 15MB.';
    }
    return null;
  }, []);

  const handleUpload = useCallback(async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsProcessing(true);
    setStatusMessage('Uploading document...');

    try {
      setStatusMessage('Analysing document structure...');
      const { extraction, assetId } = await uploadAndParseDocument(file, orgId);

      toast.success(`Found ${extraction.sections.length} sections in ${file.name}`);
      onExtractionComplete(extraction, assetId, file.name);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to process document';
      toast.error(message);
    } finally {
      setIsProcessing(false);
      setStatusMessage('');
    }
  }, [orgId, onExtractionComplete, validateFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleUpload(file);
    }
  }, [handleUpload]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleUpload]);

  const handleClick = useCallback(() => {
    if (!isProcessing) {
      fileInputRef.current?.click();
    }
  }, [isProcessing]);

  return (
    <div className={cn('space-y-3', className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,.pdf"
        onChange={handleFileChange}
        className="hidden"
      />

      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'relative border-2 border-dashed rounded-lg p-10 transition-all cursor-pointer',
          'flex flex-col items-center justify-center text-center',
          isDragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
            : 'border-gray-300 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600',
          isProcessing && 'opacity-70 cursor-not-allowed'
        )}
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-10 w-10 text-blue-500 animate-spin mb-3" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {statusMessage}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              This may take a moment...
            </p>
          </>
        ) : (
          <>
            <div
              className={cn(
                'p-3 rounded-full mb-3',
                isDragging
                  ? 'bg-blue-500/20'
                  : 'bg-gray-100 dark:bg-gray-800'
              )}
            >
              {isDragging ? (
                <FileText className="h-6 w-6 text-blue-500" />
              ) : (
                <Upload className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              )}
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {isDragging ? 'Drop your proposal here' : 'Upload an example proposal'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Drag and drop or click to browse
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              .docx or .pdf — Max 15MB
            </p>
          </>
        )}
      </div>
    </div>
  );
}
