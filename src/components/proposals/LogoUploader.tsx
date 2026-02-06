import { useState, useRef, useCallback } from 'react';
import { Upload, X, Image, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { uploadProposalLogo } from '@/lib/services/proposalService';

export interface LogoUploaderProps {
  orgId: string;
  proposalId?: string;
  currentLogoUrl?: string;
  onLogoUploaded: (url: string, storagePath: string) => void;
  className?: string;
}

export default function LogoUploader({
  orgId,
  proposalId,
  currentLogoUrl,
  onLogoUploaded,
  className,
}: LogoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentLogoUrl || null);
  const [uploadedStoragePath, setUploadedStoragePath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
  const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Invalid file type. Allowed: PNG, JPG, SVG, WebP';
    }
    if (file.size > MAX_SIZE_BYTES) {
      return 'File too large. Maximum size: 2MB';
    }
    return null;
  }, []);

  const handleUpload = useCallback(async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsUploading(true);

    try {
      const result = await uploadProposalLogo(file, orgId, proposalId);

      // Create a local object URL for immediate preview
      const localPreviewUrl = URL.createObjectURL(file);
      setPreviewUrl(localPreviewUrl);
      setUploadedStoragePath(result.storage_path);

      onLogoUploaded(result.public_url || localPreviewUrl, result.storage_path);
      toast.success('Logo uploaded successfully');
    } catch (error: any) {
      const message = error?.message || 'Failed to upload logo';
      toast.error(message);
      setPreviewUrl(null);
      setUploadedStoragePath(null);
    } finally {
      setIsUploading(false);
    }
  }, [orgId, proposalId, onLogoUploaded, validateFile]);

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
    // Reset file input so the same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleUpload]);

  const handleClick = useCallback(() => {
    if (!isUploading) {
      fileInputRef.current?.click();
    }
  }, [isUploading]);

  const handleRemove = useCallback(() => {
    // Revoke local object URL if we created one
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setUploadedStoragePath(null);
    onLogoUploaded('', '');
  }, [previewUrl, onLogoUploaded]);

  return (
    <div className={cn('space-y-3', className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.svg,.webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Preview area */}
      {previewUrl ? (
        <div className="relative inline-block">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-900 inline-flex items-center gap-3">
            <div className="w-16 h-16 rounded-md overflow-hidden bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
              <img
                src={previewUrl}
                alt="Logo preview"
                className="max-w-full max-h-full object-contain"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Logo uploaded
              </span>
              {uploadedStoragePath && (
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                  {uploadedStoragePath.split('/').pop()}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRemove}
              className="ml-2 h-8 w-8 text-gray-400 hover:text-red-500"
              aria-label="Remove logo"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        /* Drop zone */
        <div
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'relative border-2 border-dashed rounded-lg p-8 transition-all cursor-pointer',
            'flex flex-col items-center justify-center text-center',
            isDragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
              : 'border-gray-300 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600',
            isUploading && 'opacity-50 cursor-not-allowed'
          )}
        >
          {isUploading ? (
            <Loader2 className="h-10 w-10 text-blue-500 animate-spin mb-3" />
          ) : (
            <div
              className={cn(
                'p-3 rounded-full mb-3',
                isDragging
                  ? 'bg-blue-500/20'
                  : 'bg-gray-100 dark:bg-gray-800'
              )}
            >
              {isDragging ? (
                <Image
                  className="h-6 w-6 text-blue-500"
                />
              ) : (
                <Upload
                  className="h-6 w-6 text-gray-400 dark:text-gray-500"
                />
              )}
            </div>
          )}

          {isUploading ? (
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Uploading logo...
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {isDragging ? 'Drop your logo here' : 'Drag and drop your logo here'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                or click to browse
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                PNG, JPG, SVG, or WebP - Max 2MB
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
