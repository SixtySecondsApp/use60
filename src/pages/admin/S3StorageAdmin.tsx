// S3 Storage Admin Page
// Admin interface for monitoring S3 storage costs and usage

import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { S3CostMetrics } from '@/components/admin/S3CostMetrics';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';

export default function S3StorageAdmin() {
  const navigate = useNavigate();
  const { isAdmin } = useUserPermissions();

  if (!isAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">Admin access required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center px-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/platform/api-usage')}
            className="mr-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">S3 Storage & Costs</h1>
            <p className="text-sm text-muted-foreground">
              60 Notetaker permanent video storage
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="container max-w-7xl py-6">
          <S3CostMetrics />
        </div>
      </div>
    </div>
  );
}
