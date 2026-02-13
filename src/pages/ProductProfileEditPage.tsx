import { Helmet } from 'react-helmet-async';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
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
import { useProductProfile, useUpdateProductProfile } from '@/lib/hooks/useProductProfiles';

const CATEGORY_OPTIONS = [
  'SaaS',
  'Service',
  'Platform',
  'Hardware',
  'Consulting',
  'Other',
] as const;

export default function ProductProfileEditPage() {
  const navigate = useNavigate();
  const { id, productId } = useParams<{ id?: string; productId?: string }>();
  const resolvedProductId = productId ?? id;
  const { data: profile, isLoading } = useProductProfile(resolvedProductId);
  const updateMutation = useUpdateProductProfile();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [productUrl, setProductUrl] = useState('');

  const canSave = useMemo(() => Boolean(name.trim()), [name]);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name ?? '');
    setDescription(profile.description ?? '');
    setCategory(profile.category ?? '');
    setProductUrl(profile.product_url ?? '');
  }, [profile]);

  const handleSave = async () => {
    if (!profile || !canSave) return;
    await updateMutation.mutateAsync({
      id: profile.id,
      payload: {
        name: name.trim(),
        description: description.trim() || '',
        category: category || '',
        product_url: productUrl.trim() || '',
      },
    });
    navigate(`/profiles/products/${profile.id}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-8">
        <p className="text-[#64748B]">Product profile not found.</p>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Edit {profile.name} — Product Profile | 60</title>
      </Helmet>
      <div className="container mx-auto max-w-2xl px-3 sm:px-4 lg:px-6 py-6">
        <div className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 p-6 space-y-5">
          <h1 className="text-xl font-semibold text-[#1E293B] dark:text-gray-100">
            Edit Product Profile
          </h1>

          <div className="space-y-2">
            <Label htmlFor="pp-name">Name</Label>
            <Input
              id="pp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Product name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pp-description">Description</Label>
            <Textarea
              id="pp-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Brief description"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pp-category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="pp-category">
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

          <div className="space-y-2">
            <Label htmlFor="pp-url">Product URL</Label>
            <Input
              id="pp-url"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!canSave || updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
