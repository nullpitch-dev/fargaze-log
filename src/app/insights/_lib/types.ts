// src/app/insights/_lib/types.ts

export type TimeMode = 'month' | 'week' | 'day' | 'period';
export type WidgetSize = 'sm' | 'md' | 'lg';
export type WidgetFloor = 0 | 1 | 2 | 3 | 4;
export type WidgetViewMode = 'summary' | 'trend';
export type SleepMetric = 'duration' | 'bedtime' | 'waketime' | 'quality';

export interface GlobalFilter {
  timeMode: TimeMode;
  timePeriod: string;
  dateFrom: string;
  dateTo: string;
  crossActivities: string[];
}

export interface WidgetProps {
  globalFilter: GlobalFilter;
}
