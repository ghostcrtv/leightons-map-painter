import { useGame } from '../game/store';
import { BADGES, isUnlocked, unlockedAt, unlockedCount } from '../game/achievements';
import { Modal } from './Modal';

export function BadgesDialog() {
  const setOpen = useGame((s) => s.setBadgesOpen);
  useGame((s) => s.badgeToast);
  return (
    <Modal title={`Badges · ${unlockedCount()} of ${BADGES.length}`} onClose={() => setOpen(false)} wide>
      <div className="badge-grid">
        {BADGES.map((b) => {
          const on = isUnlocked(b.id);
          return (
            <div key={b.id} className={`badge${on ? ' on' : ''}`}>
              <span className="badge-emoji" aria-hidden>
                {on ? b.emoji : '🔒'}
              </span>
              <strong>{b.name}</strong>
              <small>{on ? `Unlocked ${new Date(unlockedAt(b.id)).toLocaleDateString()}` : b.how}</small>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/** A small celebration when a badge is unlocked. */
export function BadgeToast() {
  const id = useGame((s) => s.badgeToast);
  const b = BADGES.find((x) => x.id === id);
  if (!b) return null;
  return (
    <button className="badge-toast" onClick={() => useGame.getState().setBadgesOpen(true)} aria-live="polite">
      <span className="badge-emoji">{b.emoji}</span>
      <span>
        <small>Badge unlocked!</small>
        <strong>{b.name}</strong>
      </span>
    </button>
  );
}
