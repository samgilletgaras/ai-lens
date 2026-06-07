import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const PERIOD_WEEKS = 52;

export function ActivityHeatmap({ activity }: { activity: Record<string, number> }) {
  const [offset, setOffset] = useState(0);

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const anchor = new Date(today);
  anchor.setDate(anchor.getDate() - offset * PERIOD_WEEKS * 7);

  const start = new Date(anchor);
  start.setDate(start.getDate() - PERIOD_WEEKS * 7);
  start.setDate(start.getDate() - start.getDay());
  start.setHours(0, 0, 0, 0);

  const startStr = start.toISOString().slice(0, 10);
  const anchorStr = anchor.toISOString().slice(0, 10);

  const weeks: ({ date: string; count: number } | null)[][] = [];
  const cursor = new Date(start);
  while (cursor <= anchor) {
    const week: ({ date: string; count: number } | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(cursor);
      day.setDate(day.getDate() + d);
      if (day > anchor) {
        week.push(null);
      } else {
        const dateStr = day.toISOString().slice(0, 10);
        week.push({ date: dateStr, count: activity[dateStr] || 0 });
      }
    }
    weeks.push(week);
    cursor.setDate(cursor.getDate() + 7);
  }

  const windowCounts = Object.entries(activity)
    .filter(([d]) => d >= startStr && d <= anchorStr)
    .map(([, v]) => v);
  const maxCount = Math.max(...windowCounts, 1);
  const totalSessions = windowCounts.reduce((s, v) => s + v, 0);
  const activeDays = windowCounts.filter(v => v > 0).length;

  const canGoNext = offset > 0;
  const canGoPrev = Object.keys(activity).some(d => d < startStr);

  function cellColor(count: number) {
    if (count === 0) return 'bg-lens-border';
    const r = count / maxCount;
    if (r < 0.2) return 'bg-lens-heat-1';
    if (r < 0.4) return 'bg-lens-heat-2';
    if (r < 0.65) return 'bg-lens-heat-3';
    if (r < 0.85) return 'bg-lens-heat-4';
    return 'bg-lens-heat-5';
  }

  const monthLabels: Record<number, string> = {};
  weeks.forEach((week, i) => {
    const first = week.find(d => d !== null);
    if (!first) return;
    const d = new Date(first.date);
    const prev = i > 0 ? weeks[i - 1].find(x => x !== null) : null;
    if (!prev || new Date(prev.date).getMonth() !== d.getMonth()) {
      monthLabels[i] = d.toLocaleDateString([], { month: 'short' });
    }
  });

  const periodLabel = offset === 0
    ? 'last 12 months'
    : `${start.toLocaleDateString([], { month: 'short', year: 'numeric' })} – ${anchor.toLocaleDateString([], { month: 'short', year: 'numeric' })}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-wider text-lens-text-dim">Activity — {periodLabel}</div>
        <div className="flex items-center gap-3">
          <div className="text-[10px] text-lens-text-dim">
            <span className="text-lens-text-body">{totalSessions}</span> sessions · <span className="text-lens-text-body">{activeDays}</span> active days
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setOffset(o => o + 1)}
              disabled={!canGoPrev}
              title="Previous 12 months"
              className="p-0.5 rounded hover:bg-lens-border disabled:opacity-25 disabled:cursor-not-allowed text-lens-text-sub hover:text-lens-text transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setOffset(o => o - 1)}
              disabled={!canGoNext}
              title="Next 12 months"
              className="p-0.5 rounded hover:bg-lens-border disabled:opacity-25 disabled:cursor-not-allowed text-lens-text-sub hover:text-lens-text transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-0 min-w-0">
          <div className="flex gap-[3px] mb-1">
            {weeks.map((_, i) => (
              <div key={i} className="w-[11px] shrink-0 text-[8px] text-lens-text-faint leading-none overflow-visible whitespace-nowrap">
                {monthLabels[i] || ''}
              </div>
            ))}
          </div>
          {[0, 1, 2, 3, 4, 5, 6].map(dayIdx => (
            <div key={dayIdx} className="flex gap-[3px] mb-[3px] last:mb-0">
              {weeks.map((week, wi) => {
                const cell = week[dayIdx];
                if (!cell) return <div key={wi} className="w-[11px] h-[11px] shrink-0" />;
                return (
                  <div
                    key={wi}
                    title={`${cell.date}: ${cell.count} session${cell.count !== 1 ? 's' : ''}`}
                    className={`w-[11px] h-[11px] shrink-0 rounded-[2px] ${cellColor(cell.count)}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 justify-end">
        {([
          { color: 'bg-lens-border',  lo: 0,                               hi: 0 },
          { color: 'bg-lens-heat-1', lo: 1,                               hi: Math.max(1, Math.floor(maxCount * 0.2)) },
          { color: 'bg-lens-heat-2', lo: Math.floor(maxCount * 0.2) + 1,  hi: Math.floor(maxCount * 0.4) },
          { color: 'bg-lens-heat-3', lo: Math.floor(maxCount * 0.4) + 1,  hi: Math.floor(maxCount * 0.65) },
          { color: 'bg-lens-heat-4', lo: Math.floor(maxCount * 0.65) + 1, hi: Math.floor(maxCount * 0.85) },
          { color: 'bg-lens-heat-5', lo: Math.floor(maxCount * 0.85) + 1, hi: maxCount },
        ] as { color: string; lo: number; hi: number }[])
          .filter((band, i) => i === 0 || band.lo <= maxCount)
          .map((band, i) => {
            const label = band.lo === 0 ? '0'
              : band.lo === band.hi ? String(band.lo)
              : band.hi >= maxCount ? `${band.lo}+`
              : `${band.lo}–${band.hi}`;
            return (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <div className={`w-[11px] h-[11px] rounded-[2px] ${band.color}`} />
                <span className="text-[8px] text-lens-text-faint tabular-nums">{label}</span>
              </div>
            );
          })}
        <span className="text-[9px] text-lens-text-faint ml-0.5">sessions</span>
      </div>
    </div>
  );
}
