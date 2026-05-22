'use client';
// src/app/insights/_components/charts/BoxPlot.tsx

export interface BoxPlotProps {
  min:    number;
  max:    number;
  avg:    number;
  p25:    number;
  p75:    number;
  isDark: boolean;
}

export function BoxPlot({ min, max, avg, p25, p75, isDark }: BoxPlotProps) {
  const barColor   = isDark ? '#2dd4bf' : '#1d4ed8';
  const avgColor   = isDark ? '#f97316' : '#ea580c';
  const labelColor = isDark ? '#a1a1aa' : '#a8a29e';

  const range    = max - min || 1;
  const toPct    = (v: number) => `${((v - min) / range) * 100}%`;
  const iqrLeft  = ((p25 - min) / range) * 100;
  const iqrWidth = ((p75 - p25) / range) * 100;
  const avgLeft  = ((avg - min) / range) * 100;

  return (
    <div className="flex flex-col w-full pr-5" style={{ gap: '1px' }}>

      {/* Upper label row: min, avg, max */}
      <div className="relative w-full" style={{ height: '14px' }}>
        <span className="absolute text-[10px] leading-none -translate-x-1/2"
          style={{ left: toPct(min), color: labelColor }}>{min}</span>
        <span className="absolute text-[10px] leading-none -translate-x-1/2 font-semibold"
          style={{ left: toPct(avg), color: avgColor }}>{avg}</span>
        <span className="absolute text-[10px] leading-none -translate-x-1/2"
          style={{ left: toPct(max), color: labelColor }}>{max}</span>
      </div>

      {/* Track */}
      <div className="relative w-full" style={{ height: '28px' }}>
        {/* Baseline */}
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
          style={{ background: isDark ? '#3f3f46' : '#e7e5e4' }} />

        {/* Left whisker */}
        <div className="absolute top-1/2 h-px -translate-y-1/2"
          style={{ left: toPct(min), width: `${iqrLeft}%`, background: barColor }} />

        {/* Right whisker */}
        <div className="absolute top-1/2 h-px -translate-y-1/2"
          style={{ left: toPct(p75), width: `${100 - iqrLeft - iqrWidth}%`, background: barColor }} />

        {/* Min cap */}
        <div className="absolute -translate-x-1/2"
          style={{ left: toPct(min), top: '15%', bottom: '15%', width: '2px', background: barColor }} />

        {/* Max cap */}
        <div className="absolute -translate-x-1/2"
          style={{ left: toPct(max), top: '15%', bottom: '15%', width: '2px', background: barColor }} />

        {/* IQR box fill */}
        <div className="absolute rounded"
          style={{ left: `${iqrLeft}%`, width: `${Math.max(iqrWidth, 1)}%`, background: barColor, opacity: 0.2, top: '3px', bottom: '3px' }} />

        {/* IQR box border */}
        <div className="absolute rounded"
          style={{ left: `${iqrLeft}%`, width: `${Math.max(iqrWidth, 1)}%`, border: `1.5px solid ${barColor}`, top: '3px', bottom: '3px' }} />

        {/* Avg diamond */}
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45"
          style={{ left: `${avgLeft}%`, width: '8px', height: '8px', background: avgColor }} />
      </div>

      {/* Lower label row: p25, p75 — two lines each */}
      <div className="relative w-full" style={{ height: '24px' }}>
        {iqrLeft > 8 && (
          <span className="absolute flex flex-col items-center -translate-x-1/2"
            style={{ left: toPct(p25), color: labelColor, gap: '1px' }}>
            <span className="text-[9px] leading-none">P25</span>
            <span className="text-[10px] leading-none">{p25}</span>
          </span>
        )}
        {iqrLeft + iqrWidth < 92 && (
          <span className="absolute flex flex-col items-center -translate-x-1/2"
            style={{ left: toPct(p75), color: labelColor, gap: '1px' }}>
            <span className="text-[9px] leading-none">P75</span>
            <span className="text-[10px] leading-none">{p75}</span>
          </span>
        )}
      </div>

    </div>
  );
}
