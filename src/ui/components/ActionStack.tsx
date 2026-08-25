import { useEffect, useRef, useState } from "react";

type Item = {
  id: string;
  text: string;
  live: boolean;
  hideAt: number;
  fadeMs: number;
  fading: boolean;
  goneAt: number;
};

const MAX = 6;
const ENTER_MS = 100;
const HOLD_MS = 1000;
const LEAVE_MS = 500;
const FORCE_MS = 100;

export function ActionStack({ text }: { text: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const prev = useRef("");

  useEffect(() => {
    const next = text.trim();
    if (next === prev.current) return;
    prev.current = next;
    const now = Date.now();

    setItems((list) => {
      const demoted = list.map((item) =>
        item.live
          ? {
              ...item,
              live: false,
              hideAt: now + HOLD_MS,
              fadeMs: LEAVE_MS,
              fading: false,
              goneAt: 0,
            }
          : item,
      );
      const stacked = next
        ? [
            {
              id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
              text: next,
              live: true,
              hideAt: Number.POSITIVE_INFINITY,
              fadeMs: 0,
              fading: false,
              goneAt: 0,
            },
            ...demoted,
          ]
        : demoted;

      while (stacked.length > MAX) {
        const last = stacked[stacked.length - 1];
        if (last.fading && last.fadeMs === FORCE_MS) {
          stacked.pop();
          continue;
        }
        stacked[stacked.length - 1] = {
          ...last,
          live: false,
          hideAt: now,
          fadeMs: FORCE_MS,
          fading: true,
          goneAt: now + FORCE_MS,
        };
        if (stacked.length === MAX + 1) break;
        stacked.pop();
      }
      return stacked;
    });
  }, [text]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      const now = Date.now();
      setItems((list) => {
        let changed = false;
        const next: Item[] = [];
        for (const item of list) {
          if (item.live) {
            next.push(item);
            continue;
          }
          if (!item.fading && now >= item.hideAt) {
            changed = true;
            next.push({ ...item, fading: true, goneAt: now + item.fadeMs });
            continue;
          }
          if (item.fading && now >= item.goneAt) {
            changed = true;
            continue;
          }
          next.push(item);
        }
        return changed ? next : list;
      });
    }, 40);
    return () => window.clearInterval(tick);
  }, []);

  if (!items.length) return <span>—</span>;

  return (
    <ul className="action-stack">
      {items.map((item) => (
        <li
          key={item.id}
          className={`action-item${item.live ? " live" : ""}${item.fading ? " fading" : ""}`}
          style={{ ["--fade" as string]: `${item.fadeMs || ENTER_MS}ms` }}
        >
          {item.text}
        </li>
      ))}
    </ul>
  );
}
