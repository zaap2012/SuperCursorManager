import { useEffect, useRef, useState } from "react";

const TWEEN_MS = 1000;
const HOLD_MS = 300;

export type FlashDir = "up" | "down" | null;

export function useSmoothNumber(target: number): { value: number; flash: FlashDir } {
  const [value, setValue] = useState(target);
  const [flash, setFlash] = useState<FlashDir>(null);
  const valueRef = useRef(target);
  const frameRef = useRef(0);
  const holdRef = useRef(0);

  useEffect(() => {
    const from = valueRef.current;
    const to = target;
    if (!Number.isFinite(to)) return;
    if (Math.abs(to - from) < 0.01) {
      valueRef.current = to;
      setValue(to);
      return;
    }

    const dir: FlashDir = to > from ? "up" : "down";
    setFlash(dir);
    window.clearTimeout(holdRef.current);
    cancelAnimationFrame(frameRef.current);

    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / TWEEN_MS);
      const eased = 1 - (1 - t) ** 3;
      const next = from + (to - from) * eased;
      valueRef.current = next;
      setValue(next);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      valueRef.current = to;
      setValue(to);
      holdRef.current = window.setTimeout(() => setFlash(null), HOLD_MS);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameRef.current);
      window.clearTimeout(holdRef.current);
    };
  }, [target]);

  return { value, flash };
}
