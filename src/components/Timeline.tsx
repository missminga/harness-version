import { useEffect, useRef } from 'react';

import type { StoryStep } from '../model/types';

interface TimelineProps {
  steps: StoryStep[];
  index: number;
  onPick: (index: number) => void;
}

export function Timeline({ steps, index, onPick }: TimelineProps) {
  const current = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    current.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [index]);

  return (
    <div className="timeline" role="list">
      {steps.map((step, stepIndex) => {
        const on = stepIndex === index;
        return (
          <button
            key={step.id}
            ref={on ? current : undefined}
            type="button"
            role="listitem"
            aria-current={on ? 'step' : undefined}
            className={on ? 'is-on' : stepIndex < index ? 'is-past' : ''}
            onClick={() => onPick(stepIndex)}
          >
            <span>{String(stepIndex + 1).padStart(2, '0')}</span>
            {step.title}
          </button>
        );
      })}
    </div>
  );
}
