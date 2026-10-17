import { useGame } from '../game/store';
import { Modal } from './Modal';

export function SettingsDialog() {
  const s = useGame();
  return (
    <Modal title="Settings" onClose={() => s.setSettingsOpen(false)}>
      <Toggle label="Show country names" checked={s.showLabels} onChange={s.setShowLabels} />
      <Toggle label="Show borders" checked={s.showBorders} onChange={s.setShowBorders} />
      <p className="muted small-print">
        Map data: Natural Earth (public domain). Flags: flag-icons (MIT licence). Country sizes are approximate.
      </p>
    </Modal>
  );
}

function Toggle(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <span>{props.label}</span>
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <i aria-hidden />
    </label>
  );
}
