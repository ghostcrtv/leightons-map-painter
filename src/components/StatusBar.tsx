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
  const fill = useGame((s) => s.brush === 'F');
  const setTool = useGame((s) => s.setTool);
  const setPainter = useGame((s) => s.setPainter);
  const landMode = useGame((s) => s.landMode);
  const setLandMode = useGame((s) => s.setLandMode);
  useGame((s) => s.territoryVersion);

  if (tool === 'land') {
    const flag = painter ? mapController.flagUrl(painter.flag) : null;
    const coastal = painter ? mapController.isCoastal(painter.id) : false;
    return (
      <footer className="statusbar paintbar landbar" aria-live="polite">
        <div className="seg" role="radiogroup" aria-label="Land tool">
          <button role="radio" aria-checked={landMode === 'add'} className={landMode === 'add' ? 'on' : ''} onClick={() => setLandMode('add')}>
            ＋ Land
          </button>
          <button role="radio" aria-checked={landMode === 'erode'} className={landMode === 'erode' ? 'on erode' : ''} onClick={() => setLandMode('erode')}>
            − Erode
          </button>
        </div>
        {landMode === 'erode' ? (
          <span className="paint-hint">Drag over land: it sinks into the sea</span>
        ) : painter ? (
          <>
            {flag ? <img src={flag} alt="" className="mini-flag" /> : <span className="mini-flag disputed" />}
            <span className="paint-who">
              <small>{coastal ? 'New land for' : 'No coast! Pick a country by the sea'}</small>
              {painter.name}
            </span>
            <button className="bar-btn" onClick={() => setPainter(null)}>
              Change
            </button>
          </>
        ) : (
          <span className="paint-hint">Tap a country by the sea, then drag over water</span>
        )}
        <button className="bar-btn done" onClick={() => setTool('select')}>
          Done
        </button>
      </footer>
    );
  }

  if (tool === 'paint' || tool === 'erase') {
    const flag = painter ? mapController.flagUrl(painter.flag) : null;
    return (
      <footer className="statusbar paintbar" aria-live="polite">
        {tool === 'paint' && painter ? (
          <>
            {flag ? <img src={flag} alt="" className="mini-flag" /> : <span className="mini-flag disputed" />}
            <span className="paint-who">
              <small>{fill ? 'Tap a country to give it to' : 'Painting as'}</small>
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
            <strong>Erase:</strong>{' '}
            {fill ? 'tap a country to put all of it back' : 'drag over land to put back the real borders'}
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
