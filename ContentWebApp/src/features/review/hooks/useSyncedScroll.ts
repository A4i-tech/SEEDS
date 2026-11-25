import { useRef } from 'react';

type Frame = HTMLDivElement | null;

export interface FrameSync {
  viewportRef: (element: Frame) => void;
  onScroll: () => void;
}

const range = (frame: HTMLDivElement) => frame.scrollHeight - frame.clientHeight;

export function useSyncedScroll() {
  const frames = useRef<[Frame, Frame]>([null, null]);
  const driven = useRef<Frame>(null);

  const frame = (index: 0 | 1): FrameSync => ({
    viewportRef: (element) => {
      frames.current[index] = element;
    },
    onScroll: () => {
      const source = frames.current[index];
      const target = frames.current[index === 0 ? 1 : 0];
      if (!source || !target) return;
      if (driven.current === source) {
        driven.current = null;
        return;
      }
      if (range(source) <= 0 || range(target) <= 0) return;
      const next = (source.scrollTop / range(source)) * range(target);
      if (Math.abs(target.scrollTop - next) < 1) return;
      driven.current = target;
      target.scrollTop = next;
    },
  });

  const reset = () => {
    for (const element of frames.current) if (element) element.scrollTop = 0;
  };

  return { frame, reset };
}
