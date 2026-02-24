/**
 * ProfileContextSelector — Cascading company + product profile dropdowns.
 *
 * Reusable component for selecting a FactProfile (company) and optionally
 * a ProductProfile. When a company is selected, the product dropdown filters
 * to that company's products. Clearing the company clears the product too
 * if it belongs to the previous company.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { Building2, Package, X, Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useFactProfiles } from '@/lib/hooks/useFactProfiles';
import {
  useProductProfiles,
  useProductProfilesByFactProfile,
} from '@/lib/hooks/useProductProfiles';
import { cn } from '@/lib/utils';
import type { FactProfile } from '@/lib/types/factProfile';
import type { ProductProfile } from '@/lib/types/productProfile';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProfileContextSelectorProps {
  organizationId: string;
  value?: {
    factProfileId?: string | null;
    productProfileId?: string | null;
  };
  onChange: (selection: {
    factProfileId: string | null;
    productProfileId: string | null;
    factProfile: FactProfile | null;
    productProfile: ProductProfile | null;
  }) => void;
  compact?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProfileContextSelector({
  organizationId,
  value,
  onChange,
  compact = false,
  className,
}: ProfileContextSelectorProps) {
  const selectedFactProfileId = value?.factProfileId ?? null;
  const selectedProductProfileId = value?.productProfileId ?? null;

  // Fetch company profiles
  const { data: factProfiles, isLoading: loadingFacts } =
    useFactProfiles(organizationId);

  // Fetch product profiles — scoped to company when selected, otherwise all org products
  const { data: productsByFact, isLoading: loadingProductsByFact } =
    useProductProfilesByFactProfile(selectedFactProfileId ?? undefined);
  const { data: allProducts, isLoading: loadingAllProducts } =
    useProductProfiles(selectedFactProfileId ? undefined : organizationId);

  const products = selectedFactProfileId ? productsByFact : allProducts;
  const loadingProducts = selectedFactProfileId
    ? loadingProductsByFact
    : loadingAllProducts;

  // Track previous fact profile to detect changes
  const prevFactProfileIdRef = useRef(selectedFactProfileId);

  // When company changes, clear product if it no longer belongs
  useEffect(() => {
    if (prevFactProfileIdRef.current === selectedFactProfileId) return;
    prevFactProfileIdRef.current = selectedFactProfileId;

    if (!selectedProductProfileId || !products) return;

    const productStillValid = products.some(
      (p) => p.id === selectedProductProfileId
    );
    if (!productStillValid) {
      const factProfile =
        factProfiles?.find((f) => f.id === selectedFactProfileId) ?? null;
      onChange({
        factProfileId: selectedFactProfileId,
        productProfileId: null,
        factProfile,
        productProfile: null,
      });
    }
  }, [
    selectedFactProfileId,
    selectedProductProfileId,
    products,
    factProfiles,
    onChange,
  ]);

  // Handlers
  const handleFactProfileChange = useCallback(
    (id: string) => {
      const factProfile = factProfiles?.find((f) => f.id === id) ?? null;
      onChange({
        factProfileId: id,
        productProfileId: selectedProductProfileId,
        factProfile,
        productProfile:
          products?.find((p) => p.id === selectedProductProfileId) ?? null,
      });
    },
    [factProfiles, products, selectedProductProfileId, onChange]
  );

  const handleClearFactProfile = useCallback(() => {
    onChange({
      factProfileId: null,
      productProfileId: null,
      factProfile: null,
      productProfile: null,
    });
  }, [onChange]);

  const handleProductProfileChange = useCallback(
    (id: string) => {
      const productProfile = products?.find((p) => p.id === id) ?? null;
      const factProfile =
        factProfiles?.find((f) => f.id === selectedFactProfileId) ?? null;
      onChange({
        factProfileId: selectedFactProfileId,
        productProfileId: id,
        factProfile,
        productProfile,
      });
    },
    [products, factProfiles, selectedFactProfileId, onChange]
  );

  const handleClearProductProfile = useCallback(() => {
    const factProfile =
      factProfiles?.find((f) => f.id === selectedFactProfileId) ?? null;
    onChange({
      factProfileId: selectedFactProfileId,
      productProfileId: null,
      factProfile,
      productProfile: null,
    });
  }, [factProfiles, selectedFactProfileId, onChange]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const labelClass = compact
    ? 'sr-only'
    : 'text-xs font-medium text-slate-500 dark:text-gray-400 flex items-center gap-1.5';

  return (
    <div
      className={cn(
        compact ? 'flex items-center gap-2' : 'flex flex-col gap-3',
        className
      )}
    >
      {/* Company Profile Dropdown */}
      <div className={compact ? 'flex items-center gap-1.5' : 'space-y-1.5'}>
        <label className={labelClass}>
          <Building2 className="h-3.5 w-3.5" />
          Company Profile
        </label>
        <div className="flex items-center gap-1">
          <Select
            value={selectedFactProfileId ?? ''}
            onValueChange={handleFactProfileChange}
          >
            <SelectTrigger
              className={cn(
                compact ? 'h-8 text-xs w-[180px]' : 'h-9 text-sm'
              )}
            >
              <div className="flex items-center gap-1.5 truncate">
                {compact && <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                <SelectValue placeholder="Select company profile..." />
              </div>
            </SelectTrigger>
            <SelectContent>
              {loadingFacts ? (
                <div className="flex items-center justify-center py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                </div>
              ) : factProfiles?.length ? (
                factProfiles.map((fp) => (
                  <SelectItem key={fp.id} value={fp.id}>
                    <div className="flex items-center gap-2">
                      <span className="truncate">{fp.company_name}</span>
                      {fp.research_data?.market_position?.industry && (
                        <span className="text-xs text-slate-400 dark:text-gray-500 truncate">
                          {fp.research_data.market_position.industry}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))
              ) : (
                <div className="px-2 py-3 text-center text-xs text-slate-400">
                  No company profiles
                </div>
              )}
            </SelectContent>
          </Select>
          {selectedFactProfileId && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={handleClearFactProfile}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Product Profile Dropdown */}
      <div className={compact ? 'flex items-center gap-1.5' : 'space-y-1.5'}>
        <label className={labelClass}>
          <Package className="h-3.5 w-3.5" />
          Product
        </label>
        <div className="flex items-center gap-1">
          <Select
            value={selectedProductProfileId ?? ''}
            onValueChange={handleProductProfileChange}
            disabled={loadingProducts}
          >
            <SelectTrigger
              className={cn(
                compact ? 'h-8 text-xs w-[180px]' : 'h-9 text-sm'
              )}
            >
              <div className="flex items-center gap-1.5 truncate">
                {compact && <Package className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                <SelectValue
                  placeholder={loadingProducts ? 'Loading...' : 'All products'}
                />
              </div>
            </SelectTrigger>
            <SelectContent>
              {loadingProducts ? (
                <div className="flex items-center justify-center py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                </div>
              ) : products?.length ? (
                products.map((pp) => (
                  <SelectItem key={pp.id} value={pp.id}>
                    <div className="flex items-center gap-2">
                      <span className="truncate">{pp.name}</span>
                      {pp.category && (
                        <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                          {pp.category}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))
              ) : (
                <div className="px-2 py-3 text-center text-xs text-slate-400">
                  No products
                </div>
              )}
            </SelectContent>
          </Select>
          {selectedProductProfileId && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={handleClearProductProfile}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
