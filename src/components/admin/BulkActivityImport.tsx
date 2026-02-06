// src/components/admin/BulkActivityImport.tsx
import React from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { UploadCloud, Info } from 'lucide-react';
import logger from '@/lib/utils/logger';

// Define the expected column order for reference if needed elsewhere
const COLUMN_ORDER = [
  'id', 'user_id', 'type', 'status', 'priority', 'client_name', 'sales_rep',
  'details', 'amount', 'date', 'created_at', 'updated_at', 'quantity',
  'contact_identifier', 'contact_identifier_type'
];

// This component is now largely superseded by ActivityUploadModal.tsx
// It is kept here in case it's imported elsewhere or for future reference.
// The main upload functionality is now handled by the modal triggered from SalesTable.tsx.
function BulkActivityImport() {
  logger.warn("BulkActivityImport component rendered - functionality moved to ActivityUploadModal");

  return (
    <div className="space-y-4 p-4 mb-6 bg-gray-50 dark:bg-gray-900/50 backdrop-blur-xl rounded-lg border border-gray-200 dark:border-gray-800/50">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        <UploadCloud className="w-5 h-5" />
        Bulk Import Activities (Deprecated - Use Upload Button)
      </h3>
      <Alert variant="default">
        <Info className="h-4 w-4" />
        <AlertTitle>Feature Moved</AlertTitle>
        <AlertDescription>
          The bulk activity import is now handled via the "Upload" button in the main table header.
          This component area is deprecated.
        </AlertDescription>
      </Alert>
    </div>
  );
}

export default BulkActivityImport; 