import { useEffect } from 'react';
import { MapView } from './map/MapView';
import { useGame } from './game/store';
import { TopBar } from './components/TopBar';
import { MapToolbar } from './components/MapToolbar';
import { CountryPanel } from './components/CountryPanel';
import { StatusBar } from './components/StatusBar';
import { HelpDialog } from './components/HelpDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { TOUR_SEEN_KEY, WelcomeTour } from './components/WelcomeTour';
import { ActionsDialog } from './components/ActionsDialog';
import { RankingsDialog } from './components/RankingsDialog';
import { SimulationDialog } from './components/SimulationDialog';
import { SimHud } from './components/SimHud';
import { WorldsDialog } from './components/WorldsDialog';
import { HistoryDialog } from './components/HistoryDialog';
import { readSetting } from './utils/settings';

export default function App() {
  const status = useGame((s) => s.status);
  const loadingMessage = useGame((s) => s.loadingMessage);
  const error = useGame((s) => s.error);
  const helpOpen = useGame((s) => s.helpOpen);
  const settingsOpen = useGame((s) => s.settingsOpen);
  const tourOpen = useGame((s) => s.tourOpen);
  const actionsOpen = useGame((s) => s.actionsOpen);
  const rankingsOpen = useGame((s) => s.rankingsOpen);
  const simView = useGame((s) => s.simView);
  const worldsOpen = useGame((s) => s.worldsOpen);
  const historyOpen = useGame((s) => s.historyOpen);
  const saveProblem = useGame((s) => s.saveProblem);

  // First visit: show the welcome tour once the map is ready.
  useEffect(() => {
    if (status === 'ready' && !readSetting(TOUR_SEEN_KEY, false)) useGame.getState().setTourOpen(true);
  }, [status]);

  return (
    <div className="app">
      <MapView />
      {status === 'ready' && (
        <>
          <TopBar />
          <MapToolbar />
          <CountryPanel />
          <StatusBar />
          <SimHud />
        </>
      )}
      {status !== 'ready' && (
        <div className="loading-screen">
          <img src={`${import.meta.env.BASE_URL}icons/logo.svg`} alt="" className="loading-logo" />
          <h1>Leighton’s Map Painter</h1>
          {status === 'loading' ? (
            <>
              <div className="spinner" aria-hidden />
              <p>{loadingMessage}</p>
            </>
          ) : (
            <>
              <p className="error-text">{error}</p>
              <button className="btn primary" onClick={() => window.location.reload()}>
                Try again
              </button>
            </>
          )}
        </div>
      )}
      {helpOpen && <HelpDialog />}
      {settingsOpen && <SettingsDialog />}
      {actionsOpen && <ActionsDialog />}
      {rankingsOpen && <RankingsDialog />}
      {simView && <SimulationDialog />}
      {worldsOpen && <WorldsDialog />}
      {historyOpen && <HistoryDialog />}
      {saveProblem && status === 'ready' && <div className="save-problem" role="alert">{saveProblem}</div>}
      {tourOpen && <WelcomeTour />}
    </div>
  );
}
