/**
 * Shell Store — Zustand-based state management
 *
 * Mirrors the original PS5EmuShell vanilla JS store but adds typed actions
 * and integrates with the platform adapter layer for cross-platform data.
 */

import { create } from 'zustand';
import { createRomFileSystem } from '../library/androidFileSystem';
import { DEFAULT_SYSTEMS } from '../library/defaultSystems';
import { scanLibrary } from '../library/scanner';
import { DATA_FILES, readJson, scheduleWrite } from '../library/storage';
import type { AppState, Collection, Game, GameStats, ShellConfig, ViewId } from './types';
import { INITIAL_STATE } from './types';

/** Formato dos arquivos, igual ao do launcher de PC. */
interface StatsFile {
  games: Record<string, GameStats>;
}
interface LibraryFile {
  scannedAt: number;
  games: Game[];
}

const toStatsFile = (stats: Record<string, GameStats>): StatsFile => ({ games: stats });
const fromStatsFile = (file: StatsFile | null): Record<string, GameStats> => file?.games ?? {};

/** Configuração usada quando não há arquivo salvo (primeira execução). */
export const buildDefaultConfig = (): ShellConfig => ({
  systems: DEFAULT_SYSTEMS,
  emulators: [],
  appearance: { theme: 'dark', motionEnabled: true },
  paths: { roms: [], covers: '', saves: '' },
});

// ─── Actions Interface ────────────────────────────────────────────────────────

export interface ShellActions {
  // Initialization
  initialize: (data: Partial<AppState>) => void;
  /** Carrega config/stats/biblioteca do disco (ou padrão na primeira execução). */
  hydrate: () => Promise<void>;
  /** Atualiza e persiste a configuração. */
  saveConfig: (config: ShellConfig) => void;

  // Navigation
  setView: (view: ViewId) => void;

  // Library
  setGames: (games: Game[]) => void;
  /** Substitui a lista de coleções e persiste. */
  setCollections: (collections: Collection[]) => void;
  /** Varre as pastas de ROM configuradas e atualiza a biblioteca. */
  rescanLibrary: () => Promise<void>;

  // Game stats
  updateGameStats: (gameId: string, patch: Partial<GameStats>) => void;
  toggleFavorite: (gameId: string) => void;

  // Launch flow
  setLaunching: (isLaunching: boolean, gameId?: string | null) => void;
  setGameRunning: (isRunning: boolean, gameId?: string | null) => void;

  // Boot / Welcome
  dismissBoot: () => void;
  dismissWelcome: () => void;

  // Overlay
  setOverlayOpen: (isOpen: boolean) => void;

  // Pads
  setPadType: (padType: string | null) => void;
  updatePads: (pads: AppState['pads']) => void;

  // Appearance
  setAvatarUrl: (url: string | null) => void;
  setCoverProgress: (progress: number | null) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export type ShellStore = AppState & ShellActions;

export const useShellStore = create<ShellStore>((set, get) => ({
  ...INITIAL_STATE,

  initialize: (data) => {
    // Só reconstrói o índice se os jogos vierem no patch; caso contrário
    // preserva o que `hydrate` já carregou (initialize({ version }) é comum).
    const games = data.games ?? get().games;
    const gamesById = new Map<string, Game>(games.map((game) => [game.id, game]));

    set({
      ...data,
      games,
      gamesById,
      isBooting: false,
    });
  },

  hydrate: async () => {
    const [configFile, statsFile, libraryFile, collectionsFile] = await Promise.all([
      readJson<ShellConfig | null>(DATA_FILES.config, null),
      readJson<StatsFile | null>(DATA_FILES.stats, null),
      readJson<LibraryFile | null>(DATA_FILES.library, null),
      readJson<Collection[] | null>(DATA_FILES.collections, null),
    ]);

    const games = libraryFile?.games ?? [];
    const gamesById = new Map(games.map((game) => [game.id, game]));

    set({
      config: configFile ?? buildDefaultConfig(),
      stats: fromStatsFile(statsFile),
      games,
      gamesById,
      collections: collectionsFile ?? [],
      isBooting: false,
    });
  },

  saveConfig: (config) => {
    set({ config });
    scheduleWrite(DATA_FILES.config, () => get().config);
  },

  setView: (view) => set({ view }),

  setGames: (games) => {
    const gamesById = new Map<string, Game>();
    for (const game of games) {
      gamesById.set(game.id, game);
    }
    set({ games, gamesById });
  },

  setCollections: (collections) => {
    set({ collections });
    scheduleWrite(DATA_FILES.collections, () => get().collections);
  },

  rescanLibrary: async () => {
    const systems = get().config?.systems ?? [];
    if (systems.length === 0) {
      console.warn('[library] nenhum sistema configurado — nada para varrer');
      return;
    }

    set({ isScanning: true });
    try {
      const result = await scanLibrary({ systems, fs: createRomFileSystem() });
      get().setGames(result.games);

      // Guarda o resultado para a próxima abertura não precisar varrer de novo.
      scheduleWrite(DATA_FILES.library, () => ({
        scannedAt: result.scannedAt,
        games: get().games,
      }));

      if (result.unreadableSystems.length > 0) {
        console.warn(
          '[library] pastas ilegíveis (permissão?):',
          result.unreadableSystems.join(', '),
        );
      }
    } catch (error) {
      console.error('[library] varredura falhou', error);
    } finally {
      set({ isScanning: false });
    }
  },

  updateGameStats: (gameId, patch) => {
    const current = get().stats[gameId] || {
      playTime: 0,
      playCount: 0,
      lastPlayed: null,
      lastSessionMs: null,
      favorite: false,
    };
    set({
      stats: {
        ...get().stats,
        [gameId]: { ...current, ...patch },
      },
    });
    scheduleWrite(DATA_FILES.stats, () => toStatsFile(get().stats));
  },

  toggleFavorite: (gameId) => {
    const current = get().stats[gameId];
    const isFav = current?.favorite ?? false;
    get().updateGameStats(gameId, { favorite: !isFav });
  },

  setLaunching: (isLaunching, gameId = null) =>
    set({ isLaunching, runningGameId: gameId }),

  setGameRunning: (isRunning, gameId = null) =>
    set({ isGameRunning: isRunning, runningGameId: gameId, isLaunching: false }),

  dismissBoot: () => set({ isBooting: false }),

  dismissWelcome: () => set({ isWelcomeVisible: false }),

  setOverlayOpen: (isOpen) => set({ isOverlayOpen: isOpen }),

  setPadType: (padType) => set({ padType }),

  updatePads: (pads) => set({ pads }),

  setAvatarUrl: (url) => set({ avatarUrl: url }),

  setCoverProgress: (progress) => set({ coverProgress: progress }),
}));

// ─── Selectors (for optimized re-renders) ─────────────────────────────────────

export const selectGames = (state: ShellStore) => state.games;
export const selectConfig = (state: ShellStore) => state.config;
export const selectView = (state: ShellStore) => state.view;
export const selectIsBooting = (state: ShellStore) => state.isBooting;
export const selectIsLaunching = (state: ShellStore) => state.isLaunching;
export const selectBattery = (state: ShellStore) => state.stats;
export const selectGameStats = (gameId: string) => (state: ShellStore) =>
  state.stats[gameId];