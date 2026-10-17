import { mapController } from '../game/mapController';
import { useGame } from '../game/store';
import { IconGlobe, IconMinus, IconPlus, IconPointer } from './icons';

/**
 * Left toolbar. Phase 1 has the Select tool and map movement.
 * Paint, Erase, Expand Land, Create Island, Undo and Redo join it in later phases.
 */
export function MapToolbar() {
  const tool = useGame((s) => s.tool);
  return (
    <nav className="toolbar" aria-label="Map tools">
      <ToolButton label="Select" active={tool === 'select'} onClick={() => {}}>
        <IconPointer />
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
  );
}

function ToolButton(props: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={`tool-btn${props.active ? ' active' : ''}`}
      onClick={props.onClick}
      aria-label={props.label}
      aria-pressed={props.active}
      title={props.label}
    >
      {props.children}
      <span className="tool-label">{props.label}</span>
    </button>
  );
}
