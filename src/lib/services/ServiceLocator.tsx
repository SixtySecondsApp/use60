/**
 * Service Locator Pattern Implementation
 * Provides easy access to services while maintaining SOLID principles
 * Acts as a facade over the dependency injection container
 */

import React from 'react';
import { getService, hasService } from '../container/ServiceRegistration';
import { SERVICE_TOKENS } from '../container/DIContainer';
import {
  IDealService,
  IFinancialService,
  IValidationService,
  INotificationService,
  IPermissionService,
  IAuditService
} from '../interfaces/IBusinessServices';
import { IApplicationConfig } from '../interfaces/IConfiguration';
import { IRepository } from '../interfaces/IDataRepository';
import { DealWithRelationships } from '../hooks/deals/types/dealTypes';
import { OpsTableService } from './opsTableService';
import { supabase } from '@/lib/supabase/clientV2';

/**
 * Centralized service locator for business services
 * Follows Facade pattern to simplify service access
 */
export class ServiceLocator {
  private static instance: ServiceLocator;

  private constructor() {
    // Private constructor to enforce singleton
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ServiceLocator {
    if (!ServiceLocator.instance) {
      ServiceLocator.instance = new ServiceLocator();
    }
    return ServiceLocator.instance;
  }

  // Configuration Services
  get config(): IApplicationConfig {
    return getService<IApplicationConfig>(SERVICE_TOKENS.APPLICATION_CONFIG);
  }

  // Business Services
  get dealService(): IDealService {
    return getService<IDealService>(SERVICE_TOKENS.DEAL_SERVICE);
  }

  get financialService(): IFinancialService {
    return getService<IFinancialService>(SERVICE_TOKENS.FINANCIAL_SERVICE);
  }

  get validationService(): IValidationService {
    return getService<IValidationService>(SERVICE_TOKENS.VALIDATION_SERVICE);
  }

  get notificationService(): INotificationService {
    return getService<INotificationService>(SERVICE_TOKENS.NOTIFICATION_SERVICE);
  }

  get permissionService(): IPermissionService {
    return getService<IPermissionService>(SERVICE_TOKENS.PERMISSION_SERVICE);
  }

  get auditService(): IAuditService {
    return getService<IAuditService>(SERVICE_TOKENS.AUDIT_SERVICE);
  }

  // Repository Services
  get dealRepository(): IRepository<DealWithRelationships> {
    return getService<IRepository<DealWithRelationships>>(SERVICE_TOKENS.DEAL_REPOSITORY);
  }

  // Infrastructure Services
  get logger(): any {
    return hasService(SERVICE_TOKENS.LOGGER) 
      ? getService(SERVICE_TOKENS.LOGGER)
      : console; // Fallback to console
  }

  get cacheProvider(): any {
    return hasService(SERVICE_TOKENS.CACHE_PROVIDER)
      ? getService(SERVICE_TOKENS.CACHE_PROVIDER)
      : null;
  }

  // Ops Table Service (lazy singleton)
  private _opsTableService: OpsTableService | null = null;
  get opsTableService(): OpsTableService {
    if (!this._opsTableService) {
      this._opsTableService = new OpsTableService(supabase);
    }
    return this._opsTableService;
  }

  /**
   * Check if a specific feature is enabled
   */
  isFeatureEnabled(feature: string): boolean {
    return this.config.isFeatureEnabled(feature);
  }

  /**
   * Get business configuration values
   */
  getBusinessConfig(key: string, defaultValue?: any): any {
    switch (key) {
      case 'ltvMultiplier':
        return this.config.getLTVMultiplier();
      case 'defaultStages':
        return this.config.getDefaultStages();
      case 'maxDealValue':
        return this.config.getMaxDealValue();
      case 'minDealValue':
        return this.config.getMinDealValue();
      default:
        return defaultValue;
    }
  }

  /**
   * Validate service availability
   */
  validateServices(): string[] {
    const errors: string[] = [];
    
    try {
      this.config;
    } catch (error) {
      errors.push('Configuration service not available');
    }

    try {
      this.dealService;
    } catch (error) {
      errors.push('Deal service not available');
    }

    try {
      this.financialService;
    } catch (error) {
      errors.push('Financial service not available');
    }

    try {
      this.validationService;
    } catch (error) {
      errors.push('Validation service not available');
    }

    return errors;
  }

  /**
   * Get service health status
   */
  async getServiceHealth(): Promise<{
    healthy: boolean;
    services: Record<string, boolean>;
    errors: string[];
  }> {
    const errors = this.validateServices();
    const services: Record<string, boolean> = {};

    // Test each service
    services.config = hasService(SERVICE_TOKENS.APPLICATION_CONFIG);
    services.dealService = hasService(SERVICE_TOKENS.DEAL_SERVICE);
    services.financialService = hasService(SERVICE_TOKENS.FINANCIAL_SERVICE);
    services.validationService = hasService(SERVICE_TOKENS.VALIDATION_SERVICE);
    services.dealRepository = hasService(SERVICE_TOKENS.DEAL_REPOSITORY);

    const healthy = errors.length === 0 && Object.values(services).every(Boolean);

    return {
      healthy,
      services,
      errors
    };
  }
}

/**
 * Convenience function to get service locator instance
 */
export function getServices(): ServiceLocator {
  return ServiceLocator.getInstance();
}

/**
 * React Hook for accessing services in components
 * Follows Hook pattern for React integration
 */
export function useServices() {
  return ServiceLocator.getInstance();
}

/**
 * Higher-Order Component for injecting services
 * Follows Higher-Order Component pattern
 */
export function withServices<P extends object>(
  Component: React.ComponentType<P & { services: ServiceLocator }>
) {
  return function WithServicesComponent(props: P) {
    const services = ServiceLocator.getInstance();
    return <Component {...props} services={services} />;
  };
}

/**
 * Service-aware error boundary
 * Provides service access in error scenarios
 */
export class ServiceErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ComponentType<{ error: Error; services: ServiceLocator }> },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const services = ServiceLocator.getInstance();
    
    // Log error using service locator
    if (hasService(SERVICE_TOKENS.LOGGER)) {
      services.logger.error('React Error Boundary caught error:', error, errorInfo);
    }

    // Send error notification if service is available
    try {
      services.notificationService.sendTaskNotification('error-' + Date.now(), 'system');
    } catch (notificationError) {
    }
  }

  render() {
    if (this.state.hasError) {
      const services = ServiceLocator.getInstance();
      
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return <FallbackComponent error={this.state.error!} services={services} />;
      }

      return (
        <div className="error-boundary">
          <h2>Something went wrong.</h2>
          <details>
            <summary>Error details</summary>
            <pre>{this.state.error?.stack}</pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

// Re-export commonly used services for convenience
export { SERVICE_TOKENS } from '../container/DIContainer';