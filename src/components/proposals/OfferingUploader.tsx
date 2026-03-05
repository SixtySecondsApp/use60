import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/lib/supabase/clientV2';

export interface OfferingUploaderProps {
  orgId: string;
  onUploadComplete?: (assetId: string) => void;
  onAnalysisComplete?: (profileId: string) => void;
  className?: string;
}

type UploadState = 'idle' | 'dragging' | 'uploading' | 'analyzing' | 'complete' | 'error';

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];
const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function OfferingUploader({
  orgId,
  onUploadComplete,
  onAnalysisComplete,
  className,
}: OfferingUploaderProps) {
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      const ext = file.name.toLowerCase().split('.').pop();
      if (ext !== 'pdf' && ext !== 'docx' && ext !== 'pptx') {
        return 'Invalid file type. Only PDF, DOCX, or PPTX files are supported.';
      }
    }
    if (file.size > MAX_SIZE_BYTES) {
      return 'File too large. Maximum size: 25MB.';
    }
    return null;
  }, []);

  const handleUpload = useCallback(async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSelectedFile(file);
    setUploadState('uploading');
    setUploadProgress(0);
    setErrorMessage('');

    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error('Not authenticated');

      const ext = file.name.split('.').pop() || 'pdf';
      const assetId = crypto.randomUUID();
      const storagePath = `${orgId}/offerings/${assetId}.${ext}`;

      // Simulate upload progress since Supabase Storage upload doesn't expose progress natively
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 85) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);

      const { error: uploadError } = await supabase.storage
        .from('proposal-assets')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        });

      clearInterval(progressInterval);

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      setUploadProgress(100);

      // Create proposal_assets record
      const { data: asset, error: assetError } = await supabase
        .from('proposal_assets')
        .insert({
          id: assetId,
          org_id: orgId,
          asset_type: 'document',
          storage_path: storagePath,
          source: 'upload',
          file_name: file.name,
          file_size_bytes: file.size,
          mime_type: file.type,
          status: 'uploaded',
          created_by: userId,
        })
        .select('id')
        .single();

      if (assetError) {
        throw new Error('Failed to register uploaded document.');
      }

      onUploadComplete?.(asset.id);

      // Transition to analyzing state
      setUploadState('analyzing');

      const { data, error: invokeError } = await supabase.functions.invoke('offering-extract', {
        body: { asset_id: asset.id },
      });

      if (invokeError) {
        throw new Error(`Analysis failed: ${invokeError.message}`);
      }

      setUploadState('complete');
      toast.success(`${file.name} analysed successfully`);

      const profileId = (data as { profile_id?: string })?.profile_id ?? asset.id;
      onAnalysisComplete?.(profileId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to process document';
      setErrorMessage(message);
      setUploadState('error');
      toast.error(message);
    }
  }, [orgId, onUploadComplete, onAnalysisComplete, validateFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (uploadState === 'idle') {
      setUploadState('dragging');
    }
  }, [uploadState]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (uploadState === 'dragging') {
      setUploadState('idle');
    }
  }, [uploadState]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setUploadState('idle');

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
    if (uploadState === 'idle' || uploadState === 'dragging') {
      fileInputRef.current?.click();
    }
  }, [uploadState]);

  const handleRetry = useCallback(() => {
    if (selectedFile) {
      handleUpload(selectedFile);
    } else {
      setUploadState('idle');
      setErrorMessage('');
    }
  }, [selectedFile, handleUpload]);

  const handleReset = useCallback(() => {
    setUploadState('idle');
    setUploadProgress(0);
    setSelectedFile(null);
    setErrorMessage('');
  }, []);

  const isDropZoneActive = uploadState === 'idle' || uploadState === 'dragging';

  return (
    <div className={cn('space-y-3', className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.pptx"
        onChange={handleFileChange}
        className="hidden"
      />

      <div
        onClick={isDropZoneActive ? handleClick : undefined}
        onDragOver={isDropZoneActive ? handleDragOver : undefined}
        onDragLeave={isDropZoneActive ? handleDragLeave : undefined}
        onDrop={isDropZoneActive ? handleDrop : undefined}
        className={cn(
          'relative border-2 border-dashed rounded-lg p-10 transition-all',
          'flex flex-col items-center justify-center text-center',
          isDropZoneActive && 'cursor-pointer',
          uploadState === 'dragging'
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
            : uploadState === 'complete'
            ? 'border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-500/10'
            : uploadState === 'error'
            ? 'border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-500/10'
            : 'border-gray-300 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600',
          (uploadState === 'uploading' || uploadState === 'analyzing') &&
            'opacity-80 cursor-not-allowed'
        )}
      >
        {/* Idle / Dragging */}
        {isDropZoneActive && (
          <>
            <div
              className={cn(
                'p-3 rounded-full mb-3',
                uploadState === 'dragging'
                  ? 'bg-blue-500/20'
                  : 'bg-gray-100 dark:bg-gray-800'
              )}
            >
              {uploadState === 'dragging' ? (
                <FileText className="h-6 w-6 text-blue-500" />
              ) : (
                <Upload className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              )}
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {uploadState === 'dragging'
                ? 'Drop your sales collateral here'
                : 'Drop your sales collateral here'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Drag and drop or click to browse
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              PDF, DOCX, or PPTX — Max 25MB
            </p>
          </>
        )}

        {/* Uploading */}
        {uploadState === 'uploading' && (
          <>
            <div className="p-3 rounded-full mb-3 bg-blue-500/10">
              <Upload className="h-6 w-6 text-blue-500" />
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Uploading {selectedFile?.name}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
              {selectedFile ? formatFileSize(selectedFile.size) : ''}
            </p>
            <div className="w-full max-w-xs">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-right">
                {uploadProgress}%
              </p>
            </div>
          </>
        )}

        {/* Analyzing */}
        {uploadState === 'analyzing' && (
          <>
            <Loader2 className="h-10 w-10 text-blue-500 animate-spin mb-3" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Analyzing document...
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Extracting offering details — this may take a moment
            </p>
          </>
        )}

        {/* Complete */}
        {uploadState === 'complete' && (
          <>
            <CheckCircle className="h-10 w-10 text-green-500 mb-3" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Analysis complete
            </p>
            {selectedFile && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {selectedFile.name}
              </p>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="mt-3 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              Upload another file
            </Button>
          </>
        )}

        {/* Error */}
        {uploadState === 'error' && (
          <>
            <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Upload failed
            </p>
            <p className="text-xs text-red-500 dark:text-red-400 mt-1 max-w-xs">
              {errorMessage}
            </p>
            <div className="flex items-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                className="text-xs"
              >
                <RefreshCw className="h-3 w-3 mr-1.5" />
                Retry
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                Start over
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
