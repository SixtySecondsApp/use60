/**
 * Application Configuration Implementation
 * Follows Dependency Inversion Principle - provides concrete implementation of configuration abstractions
 * Follows Single Responsibility Principle - centralized configuration management
 */

import { IApplicationConfig } from '@/lib/interfaces/IConfiguration';

export class ApplicationConfig implements IApplicationConfig {
  private config: Record<string, any> = {};
  private initialized = false;

  constructor() {
    this.loadConfiguration();
  }

  // Database Configuration
  getConnectionString(): string {
    return this.getEnvValueInternal('VITE_SUPABASE_URL', '');
  }

  getMaxConnections(): number {
    return parseInt(this.getEnvValueInternal('MAX_DB_CONNECTIONS', '10'));
  }

  getConnectionTimeout(): number {
    return parseInt(this.getEnvValueInternal('DB_CONNECTION_TIMEOUT', '30000'));
  }

  getQueryTimeout(): number {
    return parseInt(this.getEnvValueInternal('DB_QUERY_TIMEOUT', '60000'));
  }

  isReadOnlyMode(): boolean {
    return this.getEnvValueInternal('READ_only_mode', 'false') === 'true';
  }

  // Feature Flags
  isFeatureEnabled(feature: string): boolean {
    return this.getConfigValue(`features.${feature}.enabled`, false);
  }

  getFeatureConfig<T>(feature: string): T | null {
    return this.getConfigValue(`features.${feature}.config`, null);
  }

  getAllFeatures(): Record<string, boolean> {
    return this.getConfigValue('features', {});
  }

  // Environment Configuration
  isDevelopment(): boolean {
    return this.getEnvironmentName() === 'development';
  }

  isProduction(): boolean {
    return this.getEnvironmentName() === 'production';
  }

  isTest(): boolean {
    return this.getEnvironmentName() === 'test';
  }

  getEnvironmentName(): string {
    return this.getEnvValueInternal('NODE_ENV', 'development');
  }

  getApiBaseUrl(): string {
    return this.getEnvValueInternal('VITE_API_BASE_URL', 'https://api.example.com');
  }

  // Security Configuration
  getJWTSecret(): string {
    return this.getEnvValueInternal('JWT_SECRET', 'default-secret-change-in-production');
  }

  getPasswordHashRounds(): number {
    return parseInt(this.getEnvValueInternal('PASSWORD_HASH_ROUNDS', '12'));
  }

  getRateLimitWindow(): number {
    return parseInt(this.getEnvValueInternal('RATE_LIMIT_WINDOW', '900000')); // 15 minutes
  }

  getRateLimitMaxRequests(): number {
    return parseInt(this.getEnvValueInternal('RATE_LIMIT_MAX_REQUESTS', '100'));
  }

  isSecurityAuditEnabled(): boolean {
    return this.getEnvValueInternal('SECURITY_AUDIT_ENABLED', 'true') === 'true';
  }

  // Business Configuration
  getLTVMultiplier(): number {
    return parseFloat(this.getConfigValue('business.ltv_multiplier', '3'));
  }

  getDefaultStages(): string[] {
    return this.getConfigValue('business.default_stages', ['SQL', 'Opportunity', 'Verbal', 'Signed']);
  }

  getMaxDealValue(): number {
    return parseFloat(this.getConfigValue('business.max_deal_value', '1000000'));
  }

  getMinDealValue(): number {
    return parseFloat(this.getConfigValue('business.min_deal_value', '0'));
  }

  getDefaultTaskPriority(): string {
    return this.getConfigValue('business.default_task_priority', 'medium');
  }

  // Integration Configuration
  getSlackWebhookUrl(): string | null {
    return this.getEnvValueInternal('SLACK_WEBHOOK_URL', null);
  }

  getSlackChannels(): Record<string, string> {
    return this.getConfigValue('integrations.slack.channels', {
      deals: 'deals-updates',
      activities: 'activity-log',
      alerts: 'alerts'
    });
  }

  getEmailProvider(): string {
    return this.getConfigValue('integrations.email.provider', 'smtp');
  }

  getNotificationSettings(): Record<string, boolean> {
    return this.getConfigValue('integrations.notifications', {
      email: true,
      slack: false,
      push: true
    });
  }

  // Performance Configuration
  getCacheTimeout(): number {
    return parseInt(this.getConfigValue('performance.cache_timeout', '3600000')); // 1 hour
  }

  getMaxPageSize(): number {
    return parseInt(this.getConfigValue('performance.max_page_size', '1000'));
  }

  getDefaultPageSize(): number {
    return parseInt(this.getConfigValue('performance.default_page_size', '50'));
  }

  isCompressionEnabled(): boolean {
    return this.getConfigValue('performance.compression_enabled', true);
  }

  getRequestTimeout(): number {
    return parseInt(this.getConfigValue('performance.request_timeout', '30000')); // 30 seconds
  }

  // Configuration Management
  validateConfig(): string[] {
    const errors: string[] = [];

    // Validate required environment variables
    if (!this.getConnectionString()) {
      errors.push('VITE_SUPABASE_URL is required');
    }

    if (!this.getEnvValueInternal('VITE_SUPABASE_ANON_KEY', '')) {
      errors.push('VITE_SUPABASE_ANON_KEY is required');
    }

    // Validate business rules
    if (this.getLTVMultiplier() <= 0) {
      errors.push('LTV multiplier must be positive');
    }

    if (this.getMaxDealValue() <= this.getMinDealValue()) {
      errors.push('Max deal value must be greater than min deal value');
    }

    // Validate performance settings
    if (this.getMaxPageSize() < this.getDefaultPageSize()) {
      errors.push('Max page size must be greater than or equal to default page size');
    }

    return errors;
  }

  async reloadConfig(): Promise<void> {
    this.loadConfiguration();
    this.initialized = true;
  }

  // Private helper methods
  private loadConfiguration(): void {
    // Load default configuration
    this.config = {
      features: {
        deal_splitting: {
          enabled: true,
          config: {
            admin_only: true,
            max_splits: 10
          }
        },
        smart_tasks: {
          enabled: true,
          config: {
            auto_create: true,
            default_priority: 'medium'
          }
        },
        proposal_confirmation: {
          enabled: true,
          config: {
            required_for_stage_transition: true
          }
        },
        financial_validation: {
          enabled: true,
          config: {
            strict_mode: false
          }
        },
        autonomous_copilot: {
          enabled: false,
          config: {
            max_iterations: 10,
            model: 'claude-sonnet-4-20250514'
          }
        }
      },
      business: {
        ltv_multiplier: 3,
        default_stages: ['SQL', 'Opportunity', 'Verbal', 'Signed'],
        max_deal_value: 1000000,
        min_deal_value: 0,
        default_task_priority: 'medium'
      },
      performance: {
        cache_timeout: 3600000, // 1 hour
        max_page_size: 1000,
        default_page_size: 50,
        compression_enabled: true,
        request_timeout: 30000
      },
      integrations: {
        slack: {
          channels: {
            deals: 'deals-updates',
            activities: 'activity-log',
            alerts: 'alerts'
          }
        },
        email: {
          provider: 'smtp'
        },
        notifications: {
          email: true,
          slack: false,
          push: true
        }
      }
    };

    // Override with environment-specific config if available
    this.loadEnvironmentOverrides();
  }

  private loadEnvironmentOverrides(): void {
    // In a real app, this might load from a config file or remote source
    // For now, we'll just merge some environment-based overrides
    if (this.isProduction()) {
      this.config.performance.cache_timeout = 7200000; // 2 hours in production
      this.config.integrations.notifications.slack = true;
    }

    if (this.isDevelopment()) {
      this.config.features.development_tools = {
        enabled: true,
        config: {
          debug_logging: true,
          mock_data: false
        }
      };
    }
  }

  /**
   * Get environment value (public method for service registration)
   */
  getEnvValue(key: string, defaultValue: string | null = null): string {
    return this.getEnvValueInternal(key, defaultValue);
  }

  private getEnvValueInternal(key: string, defaultValue: string | null = null): string {
    // In browser environment, use import.meta.env
    if (typeof window !== 'undefined') {
      return (import.meta.env as any)[key] || defaultValue || '';
    }
    
    // In Node.js environment, use process.env
    return process.env[key] || defaultValue || '';
  }

  private getConfigValue(path: string, defaultValue: any = null): any {
    const keys = path.split('.');
    let current = this.config;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return defaultValue;
      }
    }

    return current;
  }

  /**
   * Get configuration section for debugging
   */
  getConfigSection(section: string): any {
    return this.getConfigValue(section, {});
  }

  /**
   * Check if configuration is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Update feature flag at runtime
   */
  updateFeatureFlag(feature: string, enabled: boolean): void {
    if (!this.config.features) {
      this.config.features = {};
    }
    
    if (!this.config.features[feature]) {
      this.config.features[feature] = {};
    }
    
    this.config.features[feature].enabled = enabled;
  }

  /**
   * Update business configuration at runtime
   */
  updateBusinessConfig(key: string, value: any): void {
    if (!this.config.business) {
      this.config.business = {};
    }
    
    this.config.business[key] = value;
  }
}