'use client'

interface TimerBarProps {
  elapsedSec: number
  totalSec: number
}

/**
 * Interview progress bar.
 * Shows: [██████░░░░] 35 / 90 min
 */
export function TimerBar({ elapsedSec, totalSec }: TimerBarProps) {
  const elapsedMin = Math.floor(elapsedSec / 60)
  const totalMin = Math.floor(totalSec / 60)
  const pct = Math.min(100, (elapsedSec / totalSec) * 100)

  const barColor =
    pct >= 90 ? 'bg-red-500' :
    pct >= 70 ? 'bg-amber-400' :
    'bg-blue-500'

  return (
    <div className="w-full max-w-lg space-y-1">
      <div className="flex justify-between text-xs text-gray-400">
        <span>面试进度</span>
        <span className={pct >= 90 ? 'text-red-500 font-medium' : ''}>
          {elapsedMin} / {totalMin} min
        </span>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
