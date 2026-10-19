import { useState } from 'react';
import { mapController } from '../game/mapController';
import { useGame } from '../game/store';
import { Modal } from './Modal';
import { sound } from '../audio/sound';

export function SettingsDialog() {
  const s = useGame();
  const [confirm, setConfirm] = useState(false);
  const [soundOn, setSoundOn] = useState(sound.enabled);
  const [volume, setVolume] = useState(sound.volume);
  const changed = s.territoryReady && mapController.worldChanged();
  return (
    <Modal title="Settings" onClose={() => s.setSettingsOpen(false)}>
      <Toggle label="Show country names" checked={s.showLabels} onChange={s.setShowLabels} />
      <Toggle label="Show capital cities" hint="Yellow stars, when you zoom in" checked={s.showCapitals} onChange={s.setShowCapitals} />
      <Toggle label="Show borders" checked={s.showBorders} onChange={s.setShowBorders} />
      <Toggle label="Day and night" hint="Night slowly moves around the world; cities light up" checked={s.showNight} onChange={s.setShowNight} />
      <Toggle
        label="🤪 Crazy disasters"
        hint="Zombies, aliens, dragons, giant spiders and more can strike"
        checked={s.crazyDisasters}
        onChange={s.setCrazyDisasters}
      />
      <Toggle
        label="Sound effects"
        hint="Battles, disasters, wheels and the paint bucket"
        checked={soundOn}
        onChange={(v) => {
          sound.setEnabled(v);
          setSoundOn(v);
        }}
      />
      {soundOn && (
        <label className="volume">
          <span>Volume</span>
          <input
            id="sound-volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => {
              sound.setVolume(Number(e.target.value));
              setVolume(Number(e.target.value));
            }}
            onPointerUp={() => sound.play('boom')}
          />
        </label>
      )}
      <div className="settings-section">
        <h3>World</h3>
        {!confirm ? (
          <button className="btn danger" disabled={!changed} onClick={() => setConfirm(true)}>
            Reset whole world
          </button>
        ) : (
          <div className="confirm" role="alertdialog" aria-label="Reset whole world?">
            <p>Put every country back to its real borders? You can still undo it.</p>
            <div className="confirm-buttons">
              <button className="btn secondary" onClick={() => setConfirm(false)}>
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  mapController.resetWorld();
                  setConfirm(false);
                }}
              >
                Reset world
              </button>
            </div>
          </div>
        )}
        {!changed && <p className="muted">The world matches the real Earth.</p>}
      </div>
      <p className="muted small-print">
        Map data: Natural Earth (public domain). Flags: flag-icons (MIT licence). Country sizes are approximate.{' '}
        <a href="./privacy.html" target="_blank" rel="noopener">
          Privacy
        </a>{' '}
        ·{' '}
        <a href="./third-party-notices.txt" target="_blank" rel="noopener">
          Licences
        </a>
      </p>
    </Modal>
  );
}

function Toggle(props: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <span>
        {props.label}
        {props.hint && <small className="toggle-hint">{props.hint}</small>}
      </span>
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <i aria-hidden />
    </label>
  );
}
