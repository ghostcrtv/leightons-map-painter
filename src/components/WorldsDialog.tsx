import { useEffect, useRef, useState } from 'react';
import { useGame } from '../game/store';
import type { WorldMeta } from '../worlds/model';
import {
  createWorld, deleteWorld, duplicateWorld, exportAll, exportWorld, importBackup, listWorlds, openWorld, renameWorld,
} from '../worlds/session';
import { readTextFile } from '../utils/files';
import { isBusy } from '../sim/runner';
import { Modal } from './Modal';

/** Saved worlds: open, make, rename, copy, delete, and back up to a file. */
export function WorldsDialog() {
  const setOpen = useGame((s) => s.setWorldsOpen);
  const current = useGame((s) => s.world);
  const [worlds, setWorlds] = useState<WorldMeta[] | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => void listWorlds().then(setWorlds);
  useEffect(refresh, [current?.id, current?.name]);

  const busyGuard = () => {
    if (isBusy()) {
      setMessage({ text: 'Wait for the simulation to finish first.', bad: true });
      return true;
    }
    return false;
  };

  const when = (t: number) => {
    const d = new Date(t);
    const today = new Date();
    return d.toDateString() === today.toDateString()
      ? `Today ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
      : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  };

  return (
    <Modal title="Worlds" onClose={() => setOpen(false)} wide>
      <p className="muted">Every world is saved on this device automatically. Make backup files to keep them extra safe.</p>

      {creating ? (
        <form
          className="world-new"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busyGuard()) return;
            await createWorld(newName || 'New World');
            setCreating(false);
            setNewName('');
            setOpen(false);
          }}
        >
          <input
            id="new-world-name"
            autoFocus
            maxLength={40}
            placeholder="Name your new world…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button className="btn primary" type="submit">
            Start
          </button>
          <button className="btn secondary" type="button" onClick={() => setCreating(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="sheet-buttons">
          <button className="btn primary" onClick={() => setCreating(true)}>
            ＋ New world
          </button>
          <button className="btn secondary" onClick={() => fileRef.current?.click()}>
            Open a backup file
          </button>
          <button className="btn secondary" onClick={() => exportAll()}>
            Back up all worlds
          </button>
          <input
            ref={fileRef}
            id="world-file"
            type="file"
            accept=".json,application/json,text/plain"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              const r = await importBackup(await readTextFile(f));
              setMessage(r.error ? { text: r.error, bad: true } : { text: `Added ${r.count} world${r.count === 1 ? '' : 's'} from the backup.` });
              refresh();
            }}
          />
        </div>
      )}
      {message && <p className={`sheet-msg${message.bad ? ' bad' : ''}`}>{message.text}</p>}

      <ul className="world-list">
        {(worlds ?? []).map((w) => {
          const isCurrent = w.id === current?.id;
          return (
            <li key={w.id} className={`world-row${isCurrent ? ' current' : ''}`}>
              {renaming === w.id ? (
                <form
                  className="world-rename"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await renameWorld(w.id, nameDraft);
                    setRenaming(null);
                    refresh();
                  }}
                >
                  <input id={`rename-${w.id}`} autoFocus maxLength={40} value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
                  <button className="btn primary" type="submit">
                    Save
                  </button>
                </form>
              ) : (
                <div className="world-info">
                  <strong>
                    {w.name}
                    {isCurrent && <em className="playing-tag">Playing</em>}
                  </strong>
                  <small>
                    {w.year > 0 ? `Year ${w.year} · ` : ''}
                    {w.changes === 0 ? 'Real Earth' : `${w.changes} change${w.changes === 1 ? '' : 's'}`} · saved {when(w.updatedAt)}
                  </small>
                </div>
              )}
              {confirmDelete === w.id ? (
                <div className="world-actions">
                  <span className="danger-text">Delete forever?</span>
                  <button className="btn secondary" onClick={() => setConfirmDelete(null)}>
                    Keep
                  </button>
                  <button
                    className="btn danger"
                    onClick={async () => {
                      if (busyGuard()) return;
                      await deleteWorld(w.id);
                      setConfirmDelete(null);
                      refresh();
                    }}
                  >
                    Delete
                  </button>
                </div>
              ) : (
                renaming !== w.id && (
                  <div className="world-actions">
                    {!isCurrent && (
                      <button
                        className="btn primary"
                        onClick={async () => {
                          if (busyGuard()) return;
                          await openWorld(w.id);
                          setOpen(false);
                        }}
                      >
                        Play
                      </button>
                    )}
                    <button
                      className="chip"
                      onClick={() => {
                        setRenaming(w.id);
                        setNameDraft(w.name);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      className="chip"
                      onClick={async () => {
                        await duplicateWorld(w.id);
                        refresh();
                      }}
                    >
                      Copy
                    </button>
                    <button className="chip" onClick={() => exportWorld(w.id)}>
                      Back up
                    </button>
                    <button className="chip danger-chip" onClick={() => setConfirmDelete(w.id)}>
                      Delete
                    </button>
                  </div>
                )
              )}
            </li>
          );
        })}
      </ul>
      {worlds === null && <p className="muted">Loading worlds…</p>}
    </Modal>
  );
}
