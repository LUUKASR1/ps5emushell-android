/**
 * App Shell — Root Component
 *
 * Wires together the platform adapter layer, state store, and view routing.
 * Mirrors the original PS5EmuShell main.js initialization sequence:
 * 1. Initialize platform adapters (battery, perf, input)
 * 2. Load initial data from native bridge or mock
 * 3. Run boot sequence animation
 * 4. Render active view based on navigation state
 */

import { useEffect, useMemo } from 'react';
import { PlatformProvider, hasNativeBridge, usePlatform } from './platform';
import { buildDefaultConfig, useShellStore } from './store/shellStore';
import { CollectionsView } from './views/collections/CollectionsView';
import { HomeView } from './views/home/HomeView';
import { LibraryView } from './views/library/LibraryView';
import { TrophiesView } from './views/trophies/TrophiesView';
import { SettingsView } from './views/settings/SettingsView';

const VERSION = '0.10.0-android';

// ─── View Components ─────────────────────────────────────────────────────────


// ─── Topbar Component ─────────────────────────────────────────────────────────

function Topbar() {
  const view = useShellStore((s) => s.view);
  const setView = useShellStore((s) => s.setView);
  const battery = usePlatform().battery;
  const pads = usePlatform().pads;

  const clock = useMemo(() => {
    const now = new Date();
    return now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }, []);

  return (
    <header className="topbar">
      <div className="brand" title="PS5 Emu Shell">
        <span className="brand-mark">
          <i /><i /><i /><i />
        </span>
      </div>

      <nav className="tabs">
        {(['home', 'library', 'collections', 'trophies'] as const).map((v) => (
          <button
            key={v}
            className={`tab focusable ${view === v ? 'active' : ''}`}
            onClick={() => setView(v)}
          >
            {v === 'home' ? 'Jogos' : v === 'library' ? 'Biblioteca' : v === 'collections' ? 'Coleções' : 'Troféus'}
          </button>
        ))}
      </nav>

      <div className="top-right">
        <button className="icon-btn focusable" title="Adicionar jogo" onClick={() => console.log('add')} />
        <button className="icon-btn focusable" title="Buscar" onClick={() => console.log('search')} />
        <button className="icon-btn focusable" title="Configurações" onClick={() => setView('settings')} />
        <button className="icon-btn focusable" title="Energia" onClick={() => console.log('power')} />

        {battery && battery.level >= 0 && (
          <div className="battery" title={battery.charging ? 'Carregando' : 'Bateria'}>
            <span className="bat-pct">{battery.level}%</span>
            <span className="bat-bar">
              <i style={{ width: `${battery.level}%` }} />
            </span>
          </div>
        )}

        <div className="clock">{clock}</div>

        {pads.filter((pad) => pad.state?.connected).length > 0 && (
          <div
            className="pad-indicator"
            title={`${pads.filter((pad) => pad.state?.connected).length} controle(s) conectado(s)`}
          >
            🎮
          </div>
        )}
      </div>
    </header>
  );
}

// ─── Boot Screen ──────────────────────────────────────────────────────────────

function BootScreen() {
  const isBooting = useShellStore((s) => s.isBooting);
  const dismissBoot = useShellStore((s) => s.dismissBoot);

  useEffect(() => {
    if (!isBooting) return;
    const timer = setTimeout(dismissBoot, 2200);
    return () => clearTimeout(timer);
  }, [isBooting, dismissBoot]);

  if (!isBooting) return null;

  return (
    <div className="boot-screen">
      <div className="boot-logo">
        <span className="shape s1" />
        <span className="shape s2" />
        <span className="shape s3" />
        <span className="shape s4" />
      </div>
    </div>
  );
}

// ─── Launch Overlay ───────────────────────────────────────────────────────────

function LaunchOverlay() {
  const isLaunching = useShellStore((s) => s.isLaunching);
  const runningGameId = useShellStore((s) => s.runningGameId);
  const gamesById = useShellStore((s) => s.gamesById);

  if (!isLaunching || !runningGameId) return null;

  const game = gamesById.get(runningGameId);

  return (
    <div className="launch-layer">
      <div className="launch-art" />
      <div className="launch-info">
        <div className="spinner" />
        <div className="launch-title">{game?.title ?? 'Carregando...'}</div>
        <div className="launch-sub">Iniciando emulador...</div>
      </div>
    </div>
  );
}

// ─── View Router ──────────────────────────────────────────────────────────────

function ViewRouter() {
  const view = useShellStore((s) => s.view);

  switch (view) {
    case 'home':
      return <HomeView />;
    case 'library':
      return <LibraryView />;
    case 'collections':
      return <CollectionsView />;
    case 'trophies':
      return <TrophiesView />;
    case 'settings':
      return <SettingsView />;
    default:
      return <HomeView />;
  }
}

// ─── Inner App (has access to PlatformProvider context) ───────────────────────

function AppInner() {
  const { isReady, battery, pads } = usePlatform();
  const initialize = useShellStore((s) => s.initialize);
  const hydrate = useShellStore((s) => s.hydrate);
  const updatePads = useShellStore((s) => s.updatePads);
  const isBooting = useShellStore((s) => s.isBooting);

  // Carrega o estado salvo e, se a biblioteca estiver vazia, varre as ROMs.
  useEffect(() => {
    if (!isReady) return;

    const boot = async () => {
      // No web não há disco: parte da configuração padrão em memória.
      if (!hasNativeBridge()) {
        initialize({ config: buildDefaultConfig(), version: VERSION });
        return;
      }

      await hydrate();

      const state = useShellStore.getState();
      state.initialize({ version: VERSION });

      // Aplica o tema salvo antes de desenhar, para não piscar escuro->claro.
      document.documentElement.dataset.theme = state.config?.appearance.theme ?? 'dark';

      if (state.games.length === 0) {
        void state.rescanLibrary();
      }
    };

    void boot();
  }, [isReady, initialize, hydrate]);

  // Sync pad state from platform adapter to store
  useEffect(() => {
    if (pads) updatePads(pads);
  }, [pads, updatePads]);

  return (
    <div className={`app-shell ${isBooting ? 'booting' : ''}`}>
      <BootScreen />
      {!isBooting && (
        <>
          <Topbar />
          <main className="views-container">
            <ViewRouter />
          </main>
          <LaunchOverlay />
          <div id="hints" />
          <div id="toasts" />
          <div id="modal-layer" className="hidden" />
        </>
      )}
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <PlatformProvider>
      <AppInner />
    </PlatformProvider>
  );
}