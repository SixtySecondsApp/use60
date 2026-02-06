// S3 Cost Metrics Component
// Displays storage costs, growth charts, and projections

import { useState } from 'react';
import { useS3Metrics } from '@/hooks/queries/useS3Metrics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, TrendingUp, HardDrive, Upload } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function S3CostMetrics() {
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  const { data, isLoading, error } = useS3Metrics(dateRange);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 GB';
    return `${bytes.toFixed(2)} GB`;
  };

  const exportCSV = () => {
    if (!data?.daily_breakdown) return;

    const csv = [
      ['Date', 'Storage (GB)', 'Uploads (GB)', 'Downloads (GB)', 'Cost (USD)'],
      ...data.daily_breakdown.map(d => [
        d.date,
        d.storage_gb.toFixed(2),
        d.upload_gb.toFixed(2),
        d.download_gb.toFixed(2),
        d.cost_usd.toFixed(4),
      ]),
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `s3-metrics-${data.start_date}-to-${data.end_date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading S3 metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-sm text-destructive">Failed to load S3 metrics: {error.message}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">S3 Storage & Costs</h2>
          <p className="text-sm text-muted-foreground">
            60 Notetaker permanent video storage metrics
          </p>
        </div>
        <Button onClick={exportCSV} variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Storage</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(data.latest_storage_gb)}</div>
            <p className="text-xs text-muted-foreground">
              Current total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Month Cost</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.current_month_cost)}</div>
            <p className="text-xs text-muted-foreground">
              This month (so far)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Next Month</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.next_month_projection)}</div>
            <p className="text-xs text-muted-foreground">
              Projected (+10% growth)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recordings</CardTitle>
            <Upload className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.total_records}</div>
            <p className="text-xs text-muted-foreground">
              Daily metrics
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Storage Growth Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Storage Growth Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.daily_breakdown.slice().reverse()}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis
                label={{ value: 'Storage (GB)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip
                labelFormatter={(value) => new Date(value).toLocaleDateString()}
                formatter={(value: number) => [formatBytes(value), 'Storage']}
              />
              <Line
                type="monotone"
                dataKey="storage_gb"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Cost Alert */}
      {data.current_month_cost > 50 && (
        <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4">
          <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
            ⚠️ Monthly cost exceeds $50 threshold
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Consider implementing S3 lifecycle policies to reduce costs (move to Glacier after 90 days)
          </p>
        </div>
      )}

      {/* AWS Console Link */}
      <div className="text-sm text-muted-foreground">
        <a
          href="https://console.aws.amazon.com/s3"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          Open AWS S3 Console →
        </a>
      </div>
    </div>
  );
}
