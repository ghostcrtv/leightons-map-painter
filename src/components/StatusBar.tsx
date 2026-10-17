import { mapController } from '../game/mapController';
import { useGame } from '../game/store';

/**
 * Bottom strip. Normally shows the mode and a hint; while painting it becomes the
 * "painting as Germany" bar, with buttons to change country or finish.
 */
export function StatusBar() {
  const selectedId = useGame((s) => s.selectedId);
  const countries = useGame((s) => s.countries.length);
  const tool = useGame((s) => s.tool);
  const painter = useGame((s) => (s.painterId ? s.countryById.get(s.painterId) : undefined));
  const setTool = useGame((s) => s.setTool);
  const setPainter = useGame((s) => s.setPainter);

  if (tool === 'paint' || tool === 'erase') {
    const flag = painter ? mapController.flagUrl(painter.flag) : null;
    return (
      <footer className="statusbar paintbar" aria-live="polite">
        {tool === 'paint' && painter ? (
          <>
            {flag ? <img src={flag} alt="" className="mini-flag" /> : <span className="mini-flag disputed" />}
            <span className="paint-who">
              <small>Painting as</small>
              {painter.name}
            </span>
            <button className="bar-btn" onClick={() => setPainter(null)}>
              Change
            </button>
          </>
        ) : tool === 'paint' ? (
          <span className="paint-hint">Tap the country you want to paint with</span>
        ) : (
          <span className="paint-hint">
            <strong>Erase:</strong> drag over land to put back the real borders
          </span>
        )}
        <span className="paint-tip">Two fingers move the map</span>
        <button className="bar-btn done" onClick={() => setTool('select')}>
          Done
        </button>
      </footer>
    );
  }

  return (
    <footer className="statusbar" aria-live="polite">
      <span className="mode-pill">Sandbox</span>
      <span className="status-text">
        {selectedId ? 'Tap another country, or tap the ocean to close' : `Tap any of the ${countries} countries and territories`}
      </span>
    </footer>
  );
}
