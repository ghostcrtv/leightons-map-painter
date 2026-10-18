import { mapController } from '../game/mapController';
import { BRUSH_PX, useGame, type BrushSize, type Tool } from '../game/store';
import { IconBrush, IconBucket, IconEraser, IconGlobe, IconIsland, IconMinus, IconPlus, IconPointer, IconRedo, IconUndo } from './icons';

/**
 * Left toolbar: tools, undo/redo and map movement.
 * Land = new land from the sea (＋) or erosion (−).
 */
export function MapToolbar() {
  const tool = useGame((s) => s.tool);
  const ready = useGame((s) => s.territoryReady);
  const canUndo = useGame((s) => s.canUndo);
  const canRedo = useGame((s) => s.canRedo);
  const setTool = useGame((s) => s.setTool);

  const choose = (t: Tool) => {
    const st = useGame.getState();
    // Picking Paint with a country already selected: paint as that country.
    if ((t === 'paint' || t === 'land') && !st.painterId && st.selectedId) st.setPainter(st.selectedId);
    setTool(t);
    if (t !== 'select') st.setPanelCollapsed(true);
  };

  return (
    <div className="toolbar-wrap">
      <nav className="toolbar" aria-label="Map tools">
        <ToolButton label="Select" active={tool === 'select'} onClick={() => choose('select')}>
          <IconPointer />
        </ToolButton>
        <ToolButton label="Paint" active={tool === 'paint'} disabled={!ready} onClick={() => choose('paint')}>
          <IconBrush />
        </ToolButton>
        <ToolButton label="Erase" active={tool === 'erase'} disabled={!ready} onClick={() => choose('erase')}>
          <IconEraser />
        </ToolButton>
        <ToolButton label="Land" active={tool === 'land'} disabled={!ready} onClick={() => choose('land')}>
          <IconIsland />
        </ToolButton>
        <div className="toolbar-sep" />
        <ToolButton label="Undo" disabled={!canUndo} onClick={mapController.undo}>
          <IconUndo />
        </ToolButton>
        <ToolButton label="Redo" disabled={!canRedo} onClick={mapController.redo}>
          <IconRedo />
        </ToolButton>
        <div className="toolbar-sep" />
        <ToolButton label="Zoom in" onClick={mapController.zoomIn}>
          <IconPlus />
        </ToolButton>
        <ToolButton label="Zoom out" onClick={mapController.zoomOut}>
          <IconMinus />
        </ToolButton>
        <ToolButton label="Whole world" onClick={mapController.wholeWorld}>
          <IconGlobe />
        </ToolButton>
      </nav>
      {(tool === 'paint' || tool === 'erase' || tool === 'land') && <BrushPicker />}
    </div>
  );
}

const SIZES: { size: BrushSize; label: string }[] = [
  { size: 'S', label: 'Small' },
  { size: 'M', label: 'Medium' },
  { size: 'L', label: 'Large' },
  { size: 'F', label: 'Fill' },
];

/** Small / Medium / Large brush. The dot shows the real brush size on screen. */
function BrushPicker() {
  const brush = useGame((s) => s.brush);
  const setBrush = useGame((s) => s.setBrush);
  const tool = useGame((s) => s.tool);
  return (
    <div className="brush-picker" role="radiogroup" aria-label="Brush size">
      {SIZES.filter((x) => tool !== 'land' || x.size !== 'F').map(({ size, label }) => (
        <button
          key={size}
          role="radio"
          aria-checked={brush === size}
          aria-label={size === 'F' ? 'Fill a whole country' : `${label} brush`}
          title={size === 'F' ? 'Fill a whole country with one tap' : `${label} brush`}
          className={`brush-btn${brush === size ? ' active' : ''}${size === 'F' ? ' fill' : ''}`}
          onClick={() => setBrush(size)}
        >
          {size === 'F' ? (
            <IconBucket width={26} height={26} />
          ) : (
            <span className="brush-dot" style={{ width: Math.min(BRUSH_PX[size] * 1.1, 34), height: Math.min(BRUSH_PX[size] * 1.1, 34) }} />
          )}
          <span className="brush-label">{label}</span>
        </button>
      ))}
    </div>
  );
}

function ToolButton(props: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`tool-btn${props.active ? ' active' : ''}`}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
      aria-pressed={props.active}
      title={props.label}
    >
      {props.children}
      <span className="tool-label">{props.label}</span>
    </button>
  );
}
