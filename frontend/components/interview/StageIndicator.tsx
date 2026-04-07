'use client'

import type { InterviewStage } from '@/lib/types'

interface Props {
  currentStage: InterviewStage
  skipIntro: boolean
}

const STAGES: { key: InterviewStage; label: string }[] = [
  { key: 'intro', label: '自我介绍' },
  { key: 'project', label: '项目经历' },
  { key: 'skill', label: '技能考察' },
]

const STAGE_ORDER: Record<InterviewStage, number> = { intro: 0, project: 1, skill: 2, closing: 3 }

export function StageIndicator({ currentStage, skipIntro }: Props) {
  const visibleStages = skipIntro ? STAGES.filter((s) => s.key !== 'intro') : STAGES
  const currentOrder = STAGE_ORDER[currentStage]

  return (
    <div className="hidden sm:flex items-center gap-1 text-xs">
      {visibleStages.map((stage, i) => {
        const stageOrder = STAGE_ORDER[stage.key]
        const isDone = stageOrder < currentOrder
        // closing maps to the last visible stage staying active
        const isActive =
          stageOrder === currentOrder ||
          (currentStage === 'closing' && i === visibleStages.length - 1)

        return (
          <div key={stage.key} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-300">›</span>}
            <span
              className={`px-2 py-0.5 rounded-full transition-colors ${
                isActive
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : isDone
                  ? 'text-gray-400 line-through'
                  : 'text-gray-400'
              }`}
            >
              {stage.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
