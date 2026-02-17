/**
 * Realtime Subscription Monitor
 *
 * Global tracker to prevent subscription runaway and provide visibility
 * into active Realtime channels.
 *
 * Usage:
 * - Import and call trackSubscription() when creating channels
 * - Check getSubscriptionCount() to monitor health
 * - Set up alerts if count exceeds thresholds
 */

interface SubscriptionInfo {
  channel: string;
  table: string;
  createdAt: Date;
  source: string; // Hook or component name
}

class RealtimeMonitor {
  private subscriptions: Map<string, SubscriptionInfo> = new Map();
  private readonly WARNING_THRESHOLD = 10;
  private readonly ERROR_THRESHOLD = 25;
  private hasWarned = false;

  /**
   * Track a new subscription
   */
  track(channel: string, table: string, source: string) {
    this.subscriptions.set(channel, {
      channel,
      table,
      createdAt: new Date(),
      source,
    });

    this.checkThresholds();
  }

  /**
   * Remove a tracked subscription
   */
  untrack(channel: string) {
    this.subscriptions.delete(channel);
    this.hasWarned = false; // Reset warning flag when subscriptions decrease
  }

  /**
   * Get current subscription count
   */
  getCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Get detailed subscription info
   */
  getSubscriptions(): SubscriptionInfo[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Get subscriptions grouped by table
   */
  getByTable(): Record<string, number> {
    const grouped: Record<string, number> = {};
    this.subscriptions.forEach((info) => {
      grouped[info.table] = (grouped[info.table] || 0) + 1;
    });
    return grouped;
  }

  /**
   * Get subscriptions grouped by source
   */
  getBySource(): Record<string, number> {
    const grouped: Record<string, number> = {};
    this.subscriptions.forEach((info) => {
      grouped[info.source] = (grouped[info.source] || 0) + 1;
    });
    return grouped;
  }

  /**
   * Check if subscription count exceeds thresholds and warn
   */
  private checkThresholds() {
    const count = this.getCount();

    if (count >= this.ERROR_THRESHOLD) {
      console.error(
        `🚨 REALTIME OVERLOAD: ${count} active subscriptions! ` +
        `This will cause severe performance issues. ` +
        `Review subscription patterns immediately.`,
        {
          byTable: this.getByTable(),
          bySource: this.getBySource(),
        }
      );
    } else if (count >= this.WARNING_THRESHOLD && !this.hasWarned) {
      console.warn(
        `⚠️ High subscription count: ${count} active Realtime channels. ` +
        `Consider using the centralized useRealtimeHub for better performance.`,
        {
          byTable: this.getByTable(),
          bySource: this.getBySource(),
        }
      );
      this.hasWarned = true;
    }
  }

  /**
   * Print debug report
   */
  printReport() {
    console.log('=== Realtime Subscription Report ===');
    console.log(`Total subscriptions: ${this.getCount()}`);
    console.log('\nBy table:', this.getByTable());
    console.log('\nBy source:', this.getBySource());
    console.log('\nAll subscriptions:', this.getSubscriptions());
  }

  /**
   * Reset all tracking (for testing)
   */
  reset() {
    this.subscriptions.clear();
    this.hasWarned = false;
  }
}

// Singleton instance
export const realtimeMonitor = new RealtimeMonitor();

// Expose to window for debugging (dev only)
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).__realtimeMonitor = realtimeMonitor;
  console.log(
    '💡 Realtime monitor available: window.__realtimeMonitor.printReport()'
  );
}
