import { useEffect, useState } from "react";
import type { UiSettings } from "../../core/types";

export function OpacitySliders({
  ui,
  onChange,
  onClose,
}: {
  ui: UiSettings;
  onChange: (target: "window" | "hud", percent: number) => void;
  onClose?: () => void;
}) {
  const [windowPct, setWindowPct] = useState(ui.opacityWindow);
  const [hudPct, setHudPct] = useState(ui.opacityHud);

  useEffect(() => setWindowPct(ui.opacityWindow), [ui.opacityWindow]);
  useEffect(() => setHudPct(ui.opacityHud), [ui.opacityHud]);

  return (
    <section className="opacity-sliders">
      {onClose ? (
        <header className="opacity-head">
          <span>Visibilidade</span>
          <button type="button" className="win-btn" aria-label="Fechar" onClick={onClose}>
            ×
          </button>
        </header>
      ) : null}
      <label>
        <span>Janela {windowPct}%</span>
        <input
          type="range"
          min={20}
          max={100}
          step={1}
          value={windowPct}
          onInput={(event) => {
            const percent = Number((event.target as HTMLInputElement).value);
            setWindowPct(percent);
            onChange("window", percent);
          }}
        />
      </label>
      <label>
        <span>Barra {hudPct}%</span>
        <input
          type="range"
          min={20}
          max={100}
          step={1}
          value={hudPct}
          onInput={(event) => {
            const percent = Number((event.target as HTMLInputElement).value);
            setHudPct(percent);
            onChange("hud", percent);
          }}
        />
      </label>
    </section>
  );
}
