/**
 * Web Vitals Optimization and Monitoring
 * 
 * Implements Core Web Vitals optimization strategies:
 * - Largest Contentful Paint (LCP) < 2.5s
 * - First Input Delay (FID) < 100ms
 * - Cumulative Layout Shift (CLS) < 0.1
 * - First Contentful Paint (FCP) < 1.8s
 * - Time to Interactive (TTI) < 3.8s
 */

import React from 'react';
import { onCLS, onFCP, onLCP, onTTFB } from 'web-vitals';
import logger from '@/lib/utils/logger';
import { supabase } from '@/lib/supabase/clientV2';
import { ServiceWorkerManager } from '@/lib/utils/serviceWorkerUtils';

// Thresholds for Core Web Vitals
export const WEB_VITALS_THRESHOLDS = {
  LCP: { good: 2500, needs_improvement: 4000 },
  CLS: { good: 0.1, needs_improvement: 0.25 },
  FCP: { good: 1800, needs_improvement: 3000 },
  TTFB: { good: 800, needs_improvement: 1800 }
};

export interface WebVitalMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  entries: PerformanceEntry[];
  id: string;
}

export interface WebVitalsReport {
  lcp?: WebVitalMetric;
  cls?: WebVitalMetric;
  fcp?: WebVitalMetric;
  ttfb?: WebVitalMetric;
  timestamp: number;
  url: string;
  userAgent: string;
}

class WebVitalsOptimizer {
  private static instance: WebVitalsOptimizer;
  private metrics: Map<string, WebVitalMetric> = new Map();
  private observers: IntersectionObserver[] = [];
  private analyticsEnabled = false;

  static getInstance(): WebVitalsOptimizer {
    if (!WebVitalsOptimizer.instance) {
      WebVitalsOptimizer.instance = new WebVitalsOptimizer();
    }
    return WebVitalsOptimizer.instance;
  }

  // Initialize web vitals monitoring
  initializeMonitoring(enableAnalytics = false): void {
    this.analyticsEnabled = enableAnalytics;

    // Monitor all Core Web Vitals
    onLCP(this.handleMetric.bind(this));
    onCLS(this.handleMetric.bind(this));
    onFCP(this.handleMetric.bind(this));
    onTTFB(this.handleMetric.bind(this));

    // Initialize optimizations
    this.optimizeLCP();
    this.optimizeCLS();

    logger.log('🚀 Web Vitals monitoring initialized');
  }

  private handleMetric(metric: any): void {
    const webVitalMetric: WebVitalMetric = {
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      entries: metric.entries,
      id: metric.id
    };

    this.metrics.set(metric.name, webVitalMetric);

    if (this.analyticsEnabled) {
      this.sendToAnalytics(webVitalMetric);
    }

    // Log performance issues
    if (metric.rating !== 'good') {
      logger.warn(`⚠️ ${metric.name} needs improvement:`, {
        value: metric.value,
        rating: metric.rating,
        threshold: this.getThreshold(metric.name)
      });
    }
  }

  // LCP Optimization - Largest Contentful Paint
  private optimizeLCP(): void {
    // Preload critical resources
    this.preloadCriticalResources();
    
    // Optimize images with lazy loading and modern formats
    this.optimizeImages();
    
    // Enable resource hints
    this.addResourceHints();
  }

  // Performance optimizations for input delay
  private optimizePerformance(): void {
    // Break up long tasks
    this.breakUpLongTasks();
    
    // Use web workers for heavy computations
    this.initializeWebWorkers();
    
    // Optimize event listeners
    this.optimizeEventListeners();
  }

  // CLS Optimization - Cumulative Layout Shift
  private optimizeCLS(): void {
    // Set explicit dimensions for images and embeds
    this.setImageDimensions();
    
    // Reserve space for dynamic content
    this.reserveSpaceForDynamicContent();
    
    // Optimize font loading
    this.optimizeFontLoading();
  }

  private preloadCriticalResources(): void {
    // Vite already handles CSS splitting and injection — no runtime preloading needed.
    // Previous dynamic preloading caused "preloaded but not used" warnings because
    // stylesheets were already loaded as <link rel="stylesheet"> by Vite's build output.
  }

  private optimizeImages(): void {
    // Create intersection observer for lazy loading
    const imageObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            if (img.dataset.src) {
              img.src = img.dataset.src;
              img.classList.remove('lazy');
              imageObserver.unobserve(img);
            }
          }
        });
      },
      { rootMargin: '50px 0px' }
    );

    this.observers.push(imageObserver);

    // Observe all lazy images
    document.querySelectorAll('img[data-src]').forEach(img => {
      imageObserver.observe(img);
    });
  }

  private addResourceHints(): void {
    const hints = [
      { rel: 'dns-prefetch', href: '//fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true },
      { rel: 'dns-prefetch', href: '//api.sixty.com' }
    ];

    hints.forEach(hint => {
      const link = document.createElement('link');
      link.rel = hint.rel;
      link.href = hint.href;
      if (hint.crossorigin) {
        link.crossOrigin = 'anonymous';
      }
      document.head.appendChild(link);
    });
  }

  private breakUpLongTasks(): void {
    // Implement task scheduling for long operations
    const scheduler = (callback: () => void) => {
      if ('scheduler' in window && 'postTask' in (window as any).scheduler) {
        (window as any).scheduler.postTask(callback, { priority: 'user-blocking' });
      } else if ('requestIdleCallback' in window) {
        requestIdleCallback(callback);
      } else {
        setTimeout(callback, 0);
      }
    };

    // Export scheduler for use in components
    (window as any).optimizedScheduler = scheduler;
  }

  private initializeWebWorkers(): void {
    // Check if web workers are supported
    if (typeof Worker !== 'undefined') {
      // Create worker for heavy data processing
      const workerScript = `
        self.onmessage = function(e) {
          const { type, data } = e.data;
          
          switch(type) {
            case 'PROCESS_DATA':
              // Heavy data processing
              const result = processLargeDataset(data);
              self.postMessage({ type: 'DATA_PROCESSED', result });
              break;
              
            case 'CALCULATE_METRICS':
              // Metric calculations
              const metrics = calculateComplexMetrics(data);
              self.postMessage({ type: 'METRICS_CALCULATED', metrics });
              break;
          }
        };
        
        function processLargeDataset(data) {
          // Simulate heavy processing
          return data.map(item => ({
            ...item,
            processed: true,
            timestamp: Date.now()
          }));
        }
        
        function calculateComplexMetrics(data) {
          // Complex calculations
          return {
            total: data.length,
            sum: data.reduce((acc, item) => acc + (item.value || 0), 0),
            average: data.length > 0 ? data.reduce((acc, item) => acc + (item.value || 0), 0) / data.length : 0
          };
        }
      `;

      const blob = new Blob([workerScript], { type: 'application/javascript' });
      const worker = new Worker(URL.createObjectURL(blob));
      
      // Make worker globally available
      (window as any).dataProcessor = worker;
    }
  }

  private optimizeEventListeners(): void {
    // Use passive listeners for better performance
    const passiveEvents = ['scroll', 'wheel', 'touchstart', 'touchmove'];
    
    passiveEvents.forEach(eventType => {
      const originalAddEventListener = EventTarget.prototype.addEventListener;
      
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        if (passiveEvents.includes(type) && typeof options === 'undefined') {
          options = { passive: true };
        } else if (passiveEvents.includes(type) && typeof options === 'boolean') {
          options = { passive: true, capture: options };
        }
        
        return originalAddEventListener.call(this, type, listener, options);
      };
    });
  }

  private setImageDimensions(): void {
    // Automatically set dimensions for images without them
    document.querySelectorAll('img:not([width]):not([height])').forEach(img => {
      const image = img as HTMLImageElement;
      
      // Set loading="lazy" for better performance
      if (!image.loading) {
        image.loading = 'lazy';
      }
      
      // Add aspect-ratio CSS to prevent CLS
      if (!image.style.aspectRatio) {
        image.style.aspectRatio = 'auto';
      }
    });
  }

  private reserveSpaceForDynamicContent(): void {
    // Add placeholder classes for dynamic content
    const style = document.createElement('style');
    style.textContent = `
      .skeleton-loader {
        background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
        background-size: 200% 100%;
        animation: loading 1.5s infinite;
      }
      
      @keyframes loading {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      
      .content-placeholder {
        min-height: 200px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
    `;
    document.head.appendChild(style);
  }

  private optimizeFontLoading(): void {
    // Optimize font loading with proper preload and swap strategy
    const fontPreloadLink = document.createElement('link');
    fontPreloadLink.rel = 'preload';
    fontPreloadLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
    fontPreloadLink.as = 'style';
    fontPreloadLink.onload = () => {
      // Convert to stylesheet once loaded
      fontPreloadLink.onload = null;
      fontPreloadLink.rel = 'stylesheet';
    };
    
    // Fallback for browsers that don't support onload
    setTimeout(() => {
      if (fontPreloadLink.rel !== 'stylesheet') {
        fontPreloadLink.rel = 'stylesheet';
      }
    }, 100);
    
    document.head.appendChild(fontPreloadLink);
    
    // Add font-display optimization
    const style = document.createElement('style');
    style.textContent = `
      * {
        font-display: swap;
      }
      
      /* Fallback font stack matching Inter */
      body {
        font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      }
    `;
    document.head.appendChild(style);
  }

  private getThreshold(metricName: string): any {
    return WEB_VITALS_THRESHOLDS[metricName as keyof typeof WEB_VITALS_THRESHOLDS];
  }

  private async sendToAnalytics(metric: WebVitalMetric): Promise<void> {
    // Send to analytics service
    if (typeof gtag !== 'undefined') {
      (window as any).gtag('event', metric.name, {
        event_category: 'Web Vitals',
        event_label: metric.id,
        value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
        custom_map: { metric_rating: metric.rating }
      });
    }

    // Send to custom analytics via Supabase Edge Function
    try {
      await supabase.functions.invoke('analytics-web-vitals', {
        body: {
          ...metric,
          timestamp: Date.now(),
          url: window.location.href,
          userAgent: navigator.userAgent
        }
      });
      
      // Reset error tracking on successful request
      ServiceWorkerManager.resetApiErrorTracking();
      
    } catch (error) {
      // Track API errors for cache conflict detection
      ServiceWorkerManager.trackApiError();
      
      // Log but don't fail - analytics shouldn't block performance
      logger.warn('Failed to send web vitals to analytics:', error);
    }
  }

  // Get current metrics report
  getMetricsReport(): WebVitalsReport {
    return {
      lcp: this.metrics.get('LCP'),
      cls: this.metrics.get('CLS'),
      fcp: this.metrics.get('FCP'),
      ttfb: this.metrics.get('TTFB'),
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent
    };
  }

  // Clean up observers and listeners
  cleanup(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }
}

// Initialize singleton
export const webVitalsOptimizer = WebVitalsOptimizer.getInstance();

// Helper functions
export const measureWebVitals = (onPerfEntry?: (metric: WebVitalMetric) => void) => {
  if (onPerfEntry && onPerfEntry instanceof Function) {
    onCLS(onPerfEntry);
    onFCP(onPerfEntry);
    onLCP(onPerfEntry);
    onTTFB(onPerfEntry);
  }
};

// React hook for web vitals
export const useWebVitals = () => {
  const [metrics, setMetrics] = React.useState<WebVitalsReport>({
    timestamp: Date.now(),
    url: window.location.href,
    userAgent: navigator.userAgent
  });

  React.useEffect(() => {
    webVitalsOptimizer.initializeMonitoring(true);
    
    const updateMetrics = () => {
      setMetrics(webVitalsOptimizer.getMetricsReport());
    };

    const interval = setInterval(updateMetrics, 5000);
    
    return () => {
      clearInterval(interval);
      webVitalsOptimizer.cleanup();
    };
  }, []);

  return metrics;
};