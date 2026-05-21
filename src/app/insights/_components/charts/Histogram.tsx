'use client';
// src/app/insights/_components/charts/Histogram.tsx

export interface HistogramBucket {
  label: string;
  count: number;
}

export interface HistogramProps {
  buckets: HistogramBucket[];
  isDark:  boolean;
}

export function Histogram({ buckets, isDark }: HistogramProps) {
  const barColor   = isDark ? '#2dd4bf' : '#1d4ed8';
  const labelColor = isDark ? '#a1a1aa' : '#a8a29e';
  const valueColor = isDark ? '#f4f4f5' : '#292524';

  const maxCount = Math.max(...buckets.map(b => b.count), 1);

  return (
    <div className="flex flex-col w-full gap-0.5">
      {/* Bar area */}
      <div className="flex items-end gap-1 w-full" style={{ height: '64px' }}>
        {buckets.map(({ label, count }) => {
          const heightPct = (count / maxCount) * 100;
          return (
            <div key={label} className="flex flex-col items-center justify-end flex-1 h-full gap-0.5">
              {/* Count label above bar */}
              <span className="text-[10px] leading-none tabular-nums"
                style={{ color: count > 0 ? valueColor : 'transparent' }}>
                {count}
              </span>
              {/* Bar */}
              <div className="w-full rounded-sm transition-all"
                style={{
                  height: `${Math.max(heightPct, count === 0 ? 3 : 4)}%`,
                  background: barColor,
                  opacity: count === 0 ? 0.15 : 0.85,
                  minHeight: '3px',
                }} />
            </div>
          );
        })}
      </div>

      {/* X labels — separate row, always same baseline */}
      <div className="flex gap-1 w-full">
        {buckets.map(({ label }) => (
          <div key={label} className="flex-1 flex items-center justify-center" style={{ height: '14px' }}>
            <span className="text-[10px] leading-none text-center truncate"
              style={{ color: labelColor }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
