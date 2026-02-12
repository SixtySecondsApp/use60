import React, { useState } from 'react';
import { Package, Plus, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateProductProfile } from '@/lib/hooks/useProductProfiles';
import { supabase } from '@/lib/supabase/clientV2';
import type { ProductProfile } from '@/lib/types/productProfile';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_OPTIONS = [
  'SaaS',
  'Service',
  'Platform',
  'Hardware',
  'Consulting',
  'Other',
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NewProductProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  userId: string;
  factProfileId?: string;
  onCreated?: (profile: ProductProfile, shouldResearch: boolean) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewProductProfileDialog({
  open,
  onOpenChange,
  organizationId,
  userId,
  factProfileId,
  onCreated,
}: NewProductProfileDialogProps) {
  const createMutation = useCreateProductProfile();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingWithResearch, setIsCreatingWithResearch] = useState(false);

  // Reset form when dialog opens/closes
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setName('');
      setDescription('');
      setCategory('');
      setProductUrl('');
      setIsCreating(false);
      setIsCreatingWithResearch(false);
    }
    onOpenChange(nextOpen);
  };

  const createProfile = async (shouldResearch: boolean) => {
    if (!name.trim()) {
      toast.error('Product name is required');
      return;
    }
    if (!organizationId) {
      toast.error('No active organization');
      return;
    }
    if (!userId) {
      toast.error('Not authenticated');
      return;
    }

    const setter = shouldResearch ? setIsCreatingWithResearch : setIsCreating;
    setter(true);

    try {
      const profile = await createMutation.mutateAsync({
        organization_id: organizationId,
        created_by: userId,
        name: name.trim(),
        description: description.trim() || undefined,
        category: category || undefined,
        product_url: productUrl.trim() || undefined,
        fact_profile_id: factProfileId,
      });

      handleOpenChange(false);
      onCreated?.(profile, shouldResearch);

      if (shouldResearch) {
        void supabase.functions
          .invoke('research-product-profile', {
            body: {
              action: 'research',
              product_profile_id: profile.id,
              organization_id: organizationId,
            },
          })
          .then(({ error }) => {
            if (error) {
              toast.error('Profile created but research failed to start: ' + error.message);
            }
          })
          .catch(() => {
            toast.error('Profile created but research failed to start');
          });
      }
    } catch {
      // Error toast is already handled by the mutation's onError
    } finally {
      setter(false);
    }
  };

  const isSubmitting = isCreating || isCreatingWithResearch;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#1E293B] dark:text-gray-100">
            <Package className="h-5 w-5" />
            New Product Profile
          </DialogTitle>
          <DialogDescription>
            Create a profile for a product or service to research its market positioning, competitors, and value propositions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Product Name */}
          <div className="space-y-2">
            <Label htmlFor="product-name">
              Product Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="product-name"
              placeholder="e.g. Salesforce CRM"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="product-description">Description</Label>
            <Textarea
              id="product-description"
              placeholder="Brief description of the product or service..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              rows={3}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="product-category">Category</Label>
            <Select value={category} onValueChange={setCategory} disabled={isSubmitting}>
              <SelectTrigger id="product-category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Product URL */}
          <div className="space-y-2">
            <Label htmlFor="product-url">Product URL</Label>
            <Input
              id="product-url"
              placeholder="https://example.com"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              disabled={isSubmitting}
            />
            <p className="text-xs text-[#94A3B8] dark:text-gray-500">
              Optional. Helps improve research accuracy.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => createProfile(false)}
            disabled={isSubmitting || !name.trim()}
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Create
              </>
            )}
          </Button>
          <Button
            onClick={() => createProfile(true)}
            disabled={isSubmitting || !name.trim()}
            className="bg-brand-blue hover:bg-brand-blue/90 text-white"
          >
            {isCreatingWithResearch ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Create & Research
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
