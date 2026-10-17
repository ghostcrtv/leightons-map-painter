import { useEffect, useRef, type ReactNode } from 'react';
import { IconClose } from './icons';

export function Modal(props: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  // Listen once, and always call the latest onClose (re-adding the listener on every
  // render could drop the very key press that caused the render).
  const onClose = useRef(props.onClose);
  onClose.current = props.onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`modal${props.wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={props.title}>
        <div className="modal-head">
          <h2>{props.title}</h2>
          <button className="icon-btn small" onClick={props.onClose} aria-label="Close">
            <IconClose width={18} height={18} />
          </button>
        </div>
        <div className="modal-body">{props.children}</div>
      </div>
    </div>
  );
}
