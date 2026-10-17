import { useGame } from '../game/store';

/** Bottom strip: current mode and a hint about what to do next. */
export function StatusBar() {
  const selectedId = useGame((s) => s.selectedId);
  const countries = useGame((s) => s.countries.length);
  return (
    <footer className="statusbar" aria-live="polite">
      <span className="mode-pill">Sandbox</span>
      <span className="status-text">
        {selectedId ? 'Tap another country, or tap the ocean to close' : `Tap any of the ${countries} countries and territories`}
      </span>
    </footer>
  );
}
