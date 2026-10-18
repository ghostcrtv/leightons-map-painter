import { useEffect, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { drawFlag, FLAG_COLORS, FLAG_SYMBOLS } from '../custom/flag';
import { freeSlot } from '../custom/customs';
import { currentWorld, updateCurrentWorld } from '../worlds/session';
import { cleanName, type FlagDesign } from '../worlds/model';
import { getTerritory } from '../territory/session';
import { mapController } from '../game/mapController';
import { Modal } from './Modal';
import { unlock } from '../game/achievements';

const LAYOUTS: { id: FlagDesign['layout']; label: string }[] = [
  { id: 'h', label: 'Stripes ☰' },
  { id: 'v', label: 'Stripes ‖' },
  { id: 'cross', label: 'Cross ✚' },
  { id: 'diag', label: 'Diagonal ◩' },
  { id: 'plain', label: 'Plain ▢' },
];

const NAME_IDEAS = ['Leightonland', 'Dino Island', 'Thunder Republic', 'Kingdom of Awesome', 'Lava Land', 'New Atlantis', 'Shark Bay Empire'];

/** Create (or edit) your own country: name, capital and a flag. */
export function CountryDesigner() {
  const editor = useGame((s) => s.designer);
  const setDesigner = useGame((s) => s.setDesigner);
  const editing = editor?.id ? currentWorld()?.customs.find((c) => c.id === editor.id) : undefined;
  const [name, setName] = useState(editing?.name ?? '');
  const [capital, setCapital] = useState(editing?.capital ?? '');
  const [flag, setFlag] = useState<FlagDesign>(editing?.flag ?? { layout: 'h', colors: ['#2d7ff9', '#ffffff', '#e8463a'], symbol: '⭐' });
  const [slot, setSlot] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const placeholder = useRef(NAME_IDEAS[Math.floor(Math.random() * NAME_IDEAS.length)]);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) drawFlag(ctx, flag, c.width, c.height);
  }, [flag]);

  const stripes = flag.layout === 'plain' ? 1 : flag.layout === 'cross' || flag.layout === 'diag' ? Math.min(3, Math.max(2, flag.colors.length)) : flag.colors.length;
  const setColor = (i: number, col: string) => {
    const colors = [...flag.colors];
    colors[i] = col;
    setFlag({ ...flag, colors });
  };
  const setStripeCount = (n: number) => {
    const colors = [...flag.colors];
    while (colors.length < n) colors.push(FLAG_COLORS[(colors.length * 3) % FLAG_COLORS.length]);
    setFlag({ ...flag, colors: colors.slice(0, n) });
    setSlot(Math.min(slot, n - 1));
  };
  const hasLand = !!editing && (getTerritory()?.statsFor(editing.id)?.currentKm2 ?? 0) > 0;

  const save = () => {
    const w = currentWorld();
    if (!w) return;
    const finalName = cleanName(name) || placeholder.current;
    const design: FlagDesign = { ...flag, colors: flag.colors.slice(0, Math.max(1, stripes)) };
    if (editing) {
      updateCurrentWorld((x) => {
        const c = x.customs.find((k) => k.id === editing.id);
        if (c) Object.assign(c, { name: finalName, capital: cleanName(capital) || undefined, flag: design });
      });
      setDesigner(null);
      return;
    }
    const id = freeSlot(w);
    if (!id) return;
    updateCurrentWorld((x) => x.customs.push({ id, name: finalName, capital: cleanName(capital) || undefined, flag: design }));
    unlock('new-nation');
    setDesigner(null);
    // Straight to painting its first land.
    const st = useGame.getState();
    st.select(id);
    st.setPainter(id);
    st.setTool('paint');
    st.setPanelCollapsed(true);
  };

  const full = !editing && !!currentWorld() && !freeSlot(currentWorld()!);

  return (
    <Modal title={editing ? `Edit ${editing.name}` : 'Create your own country'} onClose={() => setDesigner(null)} wide>
      <div className="designer">
        <div className="designer-preview">
          <canvas ref={canvas} width={240} height={180} className="flag-preview" aria-label="Your flag" />
          <strong>{cleanName(name) || placeholder.current}</strong>
          {capital && <small>★ {capital}</small>}
        </div>
        <div className="designer-fields">
          <label className="nation-select">
            <span className="field-label">Country name</span>
            <input id="custom-name" className="text-input" maxLength={40} placeholder={placeholder.current} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="nation-select">
            <span className="field-label">Capital city (optional)</span>
            <input id="custom-capital" className="text-input" maxLength={40} placeholder="e.g. Rex City" value={capital} onChange={(e) => setCapital(e.target.value)} />
          </label>
        </div>
      </div>

      <h3 className="actions-heading">Flag pattern</h3>
      <div className="chips">
        {LAYOUTS.map((l) => (
          <button key={l.id} className={`chip${flag.layout === l.id ? ' on' : ''}`} onClick={() => setFlag({ ...flag, layout: l.id })}>
            {l.label}
          </button>
        ))}
        {(flag.layout === 'h' || flag.layout === 'v') &&
          [2, 3, 4].map((n) => (
            <button key={n} className={`chip${stripes === n ? ' on' : ''}`} onClick={() => setStripeCount(n)}>
              {n} stripes
            </button>
          ))}
      </div>

      <h3 className="actions-heading">Colours</h3>
      <div className="chips">
        {Array.from({ length: Math.max(1, stripes) }, (_, i) => (
          <button key={i} className={`chip color-slot${slot === i ? ' on' : ''}`} onClick={() => setSlot(i)}>
            <i style={{ background: flag.colors[i] ?? '#888' }} /> {flag.layout === 'cross' ? ['Background', 'Cross', 'Inner cross'][i] : flag.layout === 'diag' ? ['Top', 'Bottom', 'Band'][i] : `Colour ${i + 1}`}
          </button>
        ))}
      </div>
      <div className="swatches">
        {FLAG_COLORS.map((col) => (
          <button key={col} className={`swatch${flag.colors[slot] === col ? ' on' : ''}`} style={{ background: col }} aria-label={`Colour ${col}`} onClick={() => setColor(slot, col)} />
        ))}
      </div>

      <h3 className="actions-heading">Symbol</h3>
      <div className="swatches symbols">
        {FLAG_SYMBOLS.map((sym) => (
          <button key={sym || 'none'} className={`swatch sym${(flag.symbol ?? '') === sym ? ' on' : ''}`} onClick={() => setFlag({ ...flag, symbol: sym || undefined })}>
            {sym || '∅'}
          </button>
        ))}
      </div>

      {full && <p className="sheet-msg bad">This world already has 24 custom countries — that’s the most one world can have.</p>}
      <div className="sim-buttons designer-buttons">
        <button className="btn primary big-go" disabled={full} onClick={save}>
          {editing ? 'Save' : '🏳️ Create & paint its land'}
        </button>
        {editing && !confirmDelete && (
          <button className="btn secondary" disabled={hasLand} onClick={() => setConfirmDelete(true)}>
            Delete country
          </button>
        )}
        {confirmDelete && editing && (
          <button
            className="btn danger"
            onClick={() => {
              updateCurrentWorld((x) => (x.customs = x.customs.filter((c) => c.id !== editing.id)));
              useGame.getState().select(null);
              setDesigner(null);
            }}
          >
            Yes, delete {editing.name}
          </button>
        )}
      </div>
      {editing && hasLand && <p className="muted small-print">To delete it, first Reset its borders on its country card (that gives its land back).</p>}
      {!editing && (
        <p className="muted small-print">
          After you create it, paint its land onto the map (it takes land from whoever owns it), or use the Land tool’s ＋ to build it a brand-new
          island in the sea.
        </p>
      )}
      {editing && (
        <p className="muted small-print">
          <button className="chip" onClick={() => mapController.flyTo(editing.id)}>
            Show on map
          </button>
        </p>
      )}
    </Modal>
  );
}
