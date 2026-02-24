/**
 * FathomUserMapping Component
 *
 * A table component for mapping Fathom users (by email) to Sixty users.
 * Allows admins to link Fathom emails with Sixty accounts for correct meeting attribution.
 */

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Check, AlertCircle, Mail, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useFathomUserMappings,
  useUpdateFathomUserMapping,
  useDeleteFathomUserMapping,
  type FathomUserMapping as FathomUserMappingType,
} from '@/lib/hooks/useFathomSettings';
import { useOrgMembers } from '@/lib/hooks/useOrgMembers';

interface FathomUserMappingProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function FathomUserMapping({ onRefresh, isRefreshing }: FathomUserMappingProps) {
  const { data: mappings, isLoading: mappingsLoading, refetch } = useFathomUserMappings();
  const { data: orgMembers, isLoading: membersLoading } = useOrgMembers();
  const updateMapping = useUpdateFathomUserMapping();
  const deleteMapping = useDeleteFathomUserMapping();

  const isLoading = mappingsLoading || membersLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleMappingChange = (fathomUserEmail: string, sixtyUserId: string | null) => {
    updateMapping.mutate(
      { fathomUserEmail, sixtyUserId },
      {
        onSuccess: (data) => {
          const backfilled = (data as any)?.meetingsBackfilled || 0;
          toast.success(`User mapping saved${backfilled > 0 ? ` (${backfilled} meetings updated)` : ''}`);
        },
        onError: (e: any) => toast.error(e?.message || 'Failed to save user mapping'),
      }
    );
  };

  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh();
    }
    refetch();
  };

  const handleDelete = (mappingId: string, email: string) => {
    if (confirm(`Are you sure you want to delete the mapping for ${email}?`)) {
      deleteMapping.mutate(mappingId, {
        onSuccess: () => {
          toast.success('Mapping deleted');
        },
        onError: (e: any) => toast.error(e?.message || 'Failed to delete mapping'),
      });
    }
  };

  const getStatusBadge = (mapping: FathomUserMappingType) => {
    if (mapping.sixty_user_id) {
      return (
        <Badge variant="default" className="bg-green-600">
          <Check className="h-3 w-3 mr-1" />
          {mapping.is_auto_matched ? 'Auto-matched' : 'Mapped'}
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="border-yellow-500 text-yellow-600">
        <AlertCircle className="h-3 w-3 mr-1" />
        Unmapped
      </Badge>
    );
  };

  const getMappedUserName = (userId: string | null) => {
    if (!userId) return null;
    const member = orgMembers?.find((m) => m.user_id === userId);
    return member?.name || member?.email || userId;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Map Fathom users to Sixty users for correct meeting attribution
        </p>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing || mappingsLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing || mappingsLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fathom User</TableHead>
              <TableHead>Sixty User</TableHead>
              <TableHead className="w-[150px]">Status</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(!mappings || mappings.length === 0) ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  <div className="flex flex-col items-center gap-2">
                    <Mail className="h-8 w-8 text-muted-foreground/50" />
                    <p>No Fathom users found yet.</p>
                    <p className="text-xs">Users will appear here after meetings are synced from Fathom.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              mappings.map((mapping) => (
                <TableRow key={mapping.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{mapping.fathom_user_email}</span>
                      {mapping.fathom_user_name && (
                        <span className="text-xs text-muted-foreground">{mapping.fathom_user_name}</span>
                      )}
                      {mapping.last_seen_at && (
                        <span className="text-xs text-muted-foreground">
                          Last seen: {new Date(mapping.last_seen_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={mapping.sixty_user_id || 'unmapped'}
                      onValueChange={(value) =>
                        handleMappingChange(mapping.fathom_user_email, value === 'unmapped' ? null : value)
                      }
                      disabled={updateMapping.isPending}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Select user">
                          {mapping.sixty_user_id 
                            ? getMappedUserName(mapping.sixty_user_id) 
                            : <span className="text-muted-foreground">Not mapped</span>}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unmapped">
                          <span className="text-muted-foreground">Not mapped</span>
                        </SelectItem>
                        {orgMembers?.map((member) => (
                          <SelectItem key={member.user_id} value={member.user_id}>
                            <div className="flex flex-col">
                              <span>{member.name || member.email}</span>
                              {member.name && (
                                <span className="text-xs text-muted-foreground">{member.email}</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>{getStatusBadge(mapping)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(mapping.id, mapping.fathom_user_email)}
                      disabled={deleteMapping.isPending}
                      className="h-8 w-8 p-0 hover:bg-red-100 dark:hover:bg-red-900/30"
                    >
                      <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {mappings && mappings.length > 0 && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Badge variant="default" className="bg-green-600">
              <Check className="h-3 w-3 mr-1" />
              Mapped
            </Badge>
            <span>{mappings.filter((m) => m.sixty_user_id).length}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-yellow-500 text-yellow-600">
              <AlertCircle className="h-3 w-3 mr-1" />
              Unmapped
            </Badge>
            <span>{mappings.filter((m) => !m.sixty_user_id).length}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default FathomUserMapping;












