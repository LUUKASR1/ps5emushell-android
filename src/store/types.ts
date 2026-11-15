/**
 * Shell State Types
 *
 * TypeScript definitions for the application state, derived from the
 * original PS5EmuShell vanilla JS store structure.
 */

import type { PadInfo } from '../platform/types';

// ─── Game & Library ───────────────────────────────────────────────────────────

export interface GameStats {
  playTime: number;
  playCount: number;
  lastPlayed: string | null;
  lastSessionMs: number | null;
  favorite: boolean;
}

export interface Game {
  id: string;
  title: string;
  system: string;
  path: string;
  cover: string | null;
  region?: string;
  native?: boolean;
  base?: string;
  /** Nome do arquivo, usado na busca textual (derivado do path se ausente). */
  file?: string;
  /** Timestamp de quando entrou na biblioteca (ordenação "adicionados"). */
  added?: number;
}

/** Coleção de jogos agrupados por nome (ver views/collections/collectionModel). */
export interface Collection {
  id: string;
  name: string;
  games: string[];
  created: number;
}

export interface SystemDef {
  id: string;
  name: string;
  shortName: string;
  color: string;
  enabled: boolean;
  romDirs: string[];
  /** Extensões aceitas pelo emulador, com ou sem ponto. */
  extensions?: string[];
  /** Nomes de arquivo que representam um jogo em pasta (ex.: EBOOT.BIN). */
  gameFiles?: string[];
}

export interface EmulatorDef {
  id: string;
  name: string;
  systems: string[];
  path?: string;
}

// ─── Controller / Input ──────────────────────────────────────────────────────

export interface XInputState {
  available: boolean;
  count: number;
}

/**
 * No Electron original o estado de controles era `{ slots, unassigned }`,
 * porque o hub precisava atribuir jogadores manualmente entre XInput e HID.
 * No Android o input adapter entrega uma lista plana de PadInfo, então o store
 * guarda essa lista diretamente.
 */
export type PadsState = PadInfo[];

// ─── Configuration ───────────────────────────────────────────────────────────

export interface ShellConfig {
  systems: SystemDef[];
  emulators: EmulatorDef[];
  appearance: {
    theme: 'dark' | 'light';
    accentColor?: string;
    motionEnabled: boolean;
  };
  paths: {
    roms: string[];
    covers: string;
    saves: string;
  };
}

export interface OptimizeProfile {
  id: string;
  name: string;
  processes: string[];
  trimMemory: boolean;
}

// ─── App State ────────────────────────────────────────────────────────────────

export type ViewId = 'home' | 'library' | 'collections' | 'trophies' | 'settings';

export interface AppState {
  config: ShellConfig | null;
  stats: Record<string, GameStats>;
  games: Game[];
  gamesById: Map<string, Game>;
  collections: Collection[];
  view: ViewId;
  isGameRunning: boolean;
  runningGameId: string | null;
  isLaunching: boolean;
  isBooting: boolean;
  isWelcomeVisible: boolean;
  isOverlayOpen: boolean;
  xinput: XInputState;
  pads: PadsState | null;
  padType: string | null;
  paths: Record<string, string>;
  version: string;
  defaultSystems: SystemDef[];
  defaultOptimize: OptimizeProfile | null;
  coverProgress: number | null;
  avatarUrl: string | null;
  /** Varredura de ROMs em andamento. */
  isScanning: boolean;
}

export const INITIAL_STATE: AppState = {
  config: null,
  stats: {},
  games: [],
  gamesById: new Map(),
  collections: [],
  view: 'home',
  isGameRunning: false,
  runningGameId: null,
  isLaunching: false,
  isBooting: true,
  isWelcomeVisible: false,
  isOverlayOpen: false,
  xinput: { available: false, count: 0 },
  pads: null,
  padType: null,
  paths: {},
  version: '',
  defaultSystems: [],
  defaultOptimize: null,
  coverProgress: null,
  avatarUrl: null,
  isScanning: false,
};