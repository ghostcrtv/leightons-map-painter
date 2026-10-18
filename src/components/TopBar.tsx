import { useGame } from '../game/store';
import { CountrySearch } from './CountrySearch';
import { IconBolt, IconGear, IconHelp, IconWheel } from './icons';

export function TopBar() {
  const setHelpOpen = useGame((s) => s.setHelpOpen);
  const setSettingsOpen = useGame((s) => s.setSettingsOpen);
  const setActionsOpen = useGame((s) => s.setActionsOpen);
  const setSimView = useGame((s) => s.setSimView);
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
        <button className="icon-btn" onClick={() => setSimView('menu')} aria-label="Simulation: conflicts and disasters" title="Simulation">
          <IconBolt />
        </button>
        <button className="icon-btn" onClick={() => setActionsOpen(true)} aria-label="Actions: spin wheels and rankings" title="Actions">
          <IconWheel />
        </button>
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings" title="Settings">
          <IconGear />
        </button>
        <button className="help-btn" onClick={() => setHelpOpen(true)} aria-label="Help: how to play" title="How to play">
          <IconHelp width={24} height={24} strokeWidth={2.4} />
        </button>
      </div>
    </header>
  );
}
