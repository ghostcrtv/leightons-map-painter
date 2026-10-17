import { useGame } from '../game/store';
import { CountrySearch } from './CountrySearch';
import { IconGear, IconHelp } from './icons';

export function TopBar() {
  const setHelpOpen = useGame((s) => s.setHelpOpen);
  const setSettingsOpen = useGame((s) => s.setSettingsOpen);
  return (
    <header className="topbar">
      <div className="brand">
        <img src={`${import.meta.env.BASE_URL}icons/logo.svg`} alt="" className="brand-logo" />
        <h1 className="brand-title">
          Leighton’s <span>Map Painter</span>
        </h1>
      </div>
      <CountrySearch />
      <div className="topbar-actions">
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings" title="Settings">
          <IconGear />
        </button>
        <button className="icon-btn help-btn" onClick={() => setHelpOpen(true)} aria-label="How to play" title="How to play">
          <IconHelp />
          <span className="btn-label">Help</span>
        </button>
      </div>
    </header>
  );
}
