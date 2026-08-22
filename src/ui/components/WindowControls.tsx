export function WindowControls({
  onMin,
  onMax,
  onClose,
}: {
  onMin: () => void;
  onMax: () => void;
  onClose: () => void;
}) {
  return (
    <div className="win-controls">
      <button type="button" className="win-btn" aria-label="Minimizar" onClick={onMin}>
        –
      </button>
      <button type="button" className="win-btn" aria-label="Maximizar" onClick={onMax}>
        □
      </button>
      <button type="button" className="win-btn close" aria-label="Fechar" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
