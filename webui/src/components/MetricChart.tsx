import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';
import type { MetricPoint } from '../types';

interface MetricChartProps {
  data: MetricPoint[];
  label: string;
  unit?: string;
  color?: string;
  variant?: 'line' | 'area';
  showGrid?: boolean;
  height?: number;
  thresholds?: {
    warning: number;
    critical: number;
  };
}

export function MetricChart({
  data,
  label,
  unit = '%',
  color = 'var(--color-accent-primary)',
  variant = 'area',
  showGrid = true,
  height = 200,
  thresholds = { warning: 60, critical: 80 }
}: MetricChartProps) {
  // Transform data for recharts
  const chartData = useMemo(() => {
    return data.map((point, index) => ({
      index,
      value: Math.round(point.value * 10) / 10,
      timestamp: new Date(point.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    }));
  }, [data]);

  // Determine current value and color based on thresholds
  const currentValue = chartData.length > 0 ? chartData[chartData.length - 1].value : 0;
  const valueColor = useMemo(() => {
    if (currentValue >= thresholds.critical) return 'var(--color-error)';
    if (currentValue >= thresholds.warning) return 'var(--color-warning)';
    return 'var(--color-success)';
  }, [currentValue, thresholds]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label: tooltipLabel }: any) => {
    if (active && payload && payload.length) {
      return (
        <div 
          className="panel rounded px-2 py-1 shadow-lg"
          style={{ padding: '0.5rem' }}
        >
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{payload[0].payload.timestamp}</p>
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
            {payload[0].value}{unit}
          </p>
        </div>
      );
    }
    return null;
  };

  if (chartData.length === 0) {
    return (
      <div 
        className="flex items-center justify-center panel"
        style={{ height }}
      >
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Collecting data...</p>
      </div>
    );
  }

  const ChartComponent = variant === 'area' ? AreaChart : LineChart;
  const DataComponent = variant === 'area' ? Area : Line;

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{label}</span>
        <span 
          className="text-lg font-bold"
          style={{ color: valueColor }}
        >
          {currentValue}{unit}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ChartComponent data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          {showGrid && (
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="var(--color-border-muted)" 
              opacity={0.5}
            />
          )}
          <XAxis 
            dataKey="index" 
            tick={false}
            axisLine={{ stroke: 'var(--color-border-muted)' }}
            tickLine={false}
          />
          <YAxis 
            domain={[0, 100]}
            tick={{ fill: 'var(--color-text-secondary)', fontSize: 10 }}
            axisLine={{ stroke: 'var(--color-border-muted)' }}
            tickLine={false}
            tickFormatter={(value) => `${value}`}
          />
          <Tooltip content={<CustomTooltip />} />
          {variant === 'area' ? (
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              fill={color}
              fillOpacity={0.2}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ) : (
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          )}
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  );
}
