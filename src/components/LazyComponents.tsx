/**
 * Advanced Lazy Component Loader with Intelligent Preloading
 * 
 * This module provides optimized lazy loading with:
 * - Route-based preloading
 * - Component-level code splitting
 * - Loading state management
 * - Error boundaries
 */

import React, { Suspense, lazy } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import logger from '@/lib/utils/logger';

// Enhanced loading component with better UX
interface LoadingProps {
  height?: string | number;
  className?: string;
  variant?: 'skeleton' | 'spinner' | 'dots';
}

const ComponentLoader: React.FC<LoadingProps> = ({ 
  height = '400px', 
  className = '', 
  variant = 'skeleton' 
}) => {
  if (variant === 'spinner') {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ height }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (variant === 'dots') {
    return (
      <div className={`flex items-center justify-center space-x-2 ${className}`} style={{ height }}>
        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"></div>
        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
      </div>
    );
  }

  // Default skeleton
  return (
    <div className={`space-y-4 p-4 ${className}`} style={{ height }}>
      <Skeleton className="h-8 w-1/3" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
      <div className="grid grid-cols-3 gap-4 mt-8">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
};

// Table skeleton for data-heavy components
const TableLoader: React.FC<{ rows?: number; className?: string }> = ({ 
  rows = 5, 
  className = '' 
}) => (
  <div className={`space-y-3 ${className}`}>
    {/* Header */}
    <div className="flex space-x-4">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-16" />
    </div>
    {/* Rows */}
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex space-x-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
    ))}
  </div>
);

// Form skeleton for form-heavy components
const FormLoader: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`space-y-6 ${className}`}>
    <Skeleton className="h-8 w-48" />
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="flex space-x-2">
        <Skeleton className="h-10 w-20" />
        <Skeleton className="h-10 w-20" />
      </div>
    </div>
  </div>
);

// Chart skeleton (reuse from ChartLoader)
const ChartLoader: React.FC<{ height?: number; className?: string }> = ({ 
  height = 400, 
  className = '' 
}) => (
  <div className={`space-y-4 ${className}`}>
    <div className="flex items-center justify-between">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-8 w-24" />
    </div>
    <div className="relative">
      <Skeleton className="w-full" style={{ height: `${height}px` }} />
      <div className="absolute inset-0 p-4 space-y-2">
        {/* Y-axis labels */}
        <div className="absolute left-0 top-8 bottom-8 w-8 flex flex-col justify-between">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-3 w-6" />
          ))}
        </div>
        {/* Chart bars */}
        <div className="absolute left-12 right-4 top-8 bottom-12 flex items-end justify-between">
          {[...Array(7)].map((_, i) => (
            <Skeleton 
              key={i} 
              className="w-8" 
              style={{ height: `${Math.random() * 60 + 20}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  </div>
);

// Enhanced lazy component factory
interface LazyComponentOptions {
  loader: ComponentLoader;
  fallback?: React.ComponentType<any>;
  preloadDelay?: number;
  errorBoundary?: boolean;
}

const createLazyComponent = <T extends Record<string, any>>(
  importFn: () => Promise<{ default: React.ComponentType<T> }>,
  options: LazyComponentOptions = { loader: ComponentLoader }
) => {
  const LazyComponent = lazy(importFn);
  
  const WrappedComponent: React.FC<T> = (props) => {
    const { loader: LoaderComponent = ComponentLoader, fallback } = options;
    
    return (
      <Suspense fallback={fallback ? <fallback {...props} /> : <LoaderComponent />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };

  // Add preloading capability
  WrappedComponent.preload = () => {
    const delay = options.preloadDelay || 0;
    setTimeout(() => {
      importFn().catch(err => logger.warn('Failed to preload component:', err));
    }, delay);
  };

  return WrappedComponent;
};

// Heavy UI Components - Split into smaller chunks
export const LazyDataTable = createLazyComponent(
  () => import('@/components/ui/table'),
  { loader: () => <TableLoader />, preloadDelay: 1000 }
);

// Commented out for build - missing component
// export const LazyFormComponents = createLazyComponent(
//   () => import('@/components/ui/form'),
//   { loader: () => <FormLoader />, preloadDelay: 500 }
// );

// Heavy Third-party Components
export const LazyMotionDiv = createLazyComponent(
  () => import('framer-motion').then(mod => ({ default: mod.motion.div })),
  { loader: () => <ComponentLoader height="auto" variant="dots" />, preloadDelay: 2000 }
);

export const LazyAnimatePresence = createLazyComponent(
  () => import('framer-motion').then(mod => ({ default: mod.AnimatePresence })),
  { preloadDelay: 2000 }
);

// Feature-specific lazy components
export const LazyPipeline = createLazyComponent(
  () => import('@/components/Pipeline'),
  { loader: () => <ComponentLoader height="600px" />, preloadDelay: 1500 }
);

// Chart components now use direct imports for stability
// export const LazyChartComponents = createLazyComponent(
//   () => import('@/components/ChartLoader'),
//   { loader: () => <ChartLoader />, preloadDelay: 1000 }
// );

// Modal and Dialog Components
export const LazyModal = createLazyComponent(
  () => import('@/components/ui/dialog'),
  { loader: () => <ComponentLoader height="300px" variant="spinner" /> }
);

// Complex Form Components
export const LazyDealWizard = createLazyComponent(
  () => import('@/components/DealWizard'),
  { loader: () => <FormLoader />, preloadDelay: 2000 }
);

export const LazyEditDealModal = createLazyComponent(
  () => import('@/components/EditDealModal'),
  { loader: () => <FormLoader />, preloadDelay: 1500 }
);

// Admin Components
export const LazyAuditLogViewer = createLazyComponent(
  () => import('@/components/admin/AuditLogViewer'),
  { loader: () => <TableLoader rows={10} />, preloadDelay: 3000 }
);

// Route-specific preloading based on navigation patterns
export const useRoutePreloading = () => {
  React.useEffect(() => {
    const preloadTimer = setTimeout(() => {
      // Preload likely next routes based on current location
      const currentPath = window.location.pathname;
      
      if (currentPath === '/') {
        // From dashboard, users often go to pipeline or activity
        LazyPipeline.preload?.();
      } else if (currentPath === '/pipeline') {
        // From pipeline, users often edit deals
        LazyEditDealModal.preload?.();
        LazyDealWizard.preload?.();
      } else if (currentPath.includes('/platform')) {
        // Preload platform admin components
        LazyAuditLogViewer.preload?.();
      }
    }, 2000);

    return () => clearTimeout(preloadTimer);
  }, []);
};

// Component for intelligent preloading based on user interaction
export const IntelligentPreloader: React.FC = () => {
  useRoutePreloading();

  React.useEffect(() => {
    // Preload on user interaction (hover, focus, etc.)
    const preloadOnInteraction = () => {
      // LazyChartComponents.preload?.(); // Removed for stability
      LazyMotionDiv.preload?.();
    };

    const handleInteraction = () => {
      preloadOnInteraction();
      // Remove listeners after first interaction
      window.removeEventListener('mousemove', handleInteraction);
      window.removeEventListener('scroll', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };

    // Add listeners for user interaction
    window.addEventListener('mousemove', handleInteraction, { once: true });
    window.addEventListener('scroll', handleInteraction, { once: true });
    window.addEventListener('keydown', handleInteraction, { once: true });

    return () => {
      window.removeEventListener('mousemove', handleInteraction);
      window.removeEventListener('scroll', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, []);

  return null;
};

export { ComponentLoader, TableLoader, FormLoader, ChartLoader, createLazyComponent };