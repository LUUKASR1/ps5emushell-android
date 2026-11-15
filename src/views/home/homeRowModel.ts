/**
 * Modelo da fileira da Home — porte de `views/home/home-row.js`.
 *
 * O arquivo original é lógica pura (sem DOM), o que permitiu porte 1:1.
 * Mantido deliberadamente sem dependências para continuar testável isolado.
 */

import type { Game, GameStats, SystemDef } from '../../store/types';

// ─── Constantes de layout ─────────────────────────────────────────────────────

export const ALL_FILTER = 'all';
export const LIBRARY_ITEM_KEY = '__library';
export const TILE_GAP_PX = 12;
export const FOCUSED_TILE_SCALE = 1.6;
export const UNFOCUSED_TILE_SCALE = 1.3;
export const DEFAULT_TILE_SIZE_PX = 116;
export const TILES_BEFORE_SELECTION = 2;
export const SELECTED_TILE_EXTRA_GAP_PX = 4;
export const DIMMED_TILE_OPACITY = 0.55;

const LOCALE = 'pt-BR';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface HomeGameItem {
  kind: 'game';
  key: string;
  game: Game;
}

export interface HomeLibraryItem {
  kind: 'library';
  key: typeof LIBRARY_ITEM_KEY;
}

export type HomeItem = HomeGameItem | HomeLibraryItem;

export interface HomeChip {
  id: string;
  shortName: string;
  count: number;
}

export interface VisibleRange {
  from: number;
  to: number;
}

// ─── Ordenação e itens ────────────────────────────────────────────────────────

export const compareTitles = (first: Game, second: Game): number =>
  first.title.localeCompare(second.title, LOCALE, { sensitivity: 'base' });

export const buildHomeItems = ({
  games,
  filter,
  gameStats,
}: {
  games: Game[];
  filter: string;
  gameStats: Record<string, GameStats | undefined>;
}): HomeItem[] => {
  const readLastPlayed = (game: Game): number => {
    const played = gameStats[game.id]?.lastPlayed;
    // O original guardava lastPlayed como timestamp; sessões nunca jogadas
    // valem 0 para irem ao fim da fila.
    return typeof played === 'number' ? played : 0;
  };

  const visibleGames = games
    .filter((game) => filter === ALL_FILTER || game.system === filter)
    .sort((first, second) => {
      const firstPlayed = readLastPlayed(first);
      const secondPlayed = readLastPlayed(second);
      if (firstPlayed !== secondPlayed) return secondPlayed - firstPlayed;
      return compareTitles(first, second);
    });

  const gameItems: HomeItem[] = visibleGames.map((game) => ({
    kind: 'game',
    key: game.id,
    game,
  }));

  // O tile "Biblioteca" só aparece quando há algo para ver.
  return visibleGames.length
    ? [...gameItems, { kind: 'library', key: LIBRARY_ITEM_KEY }]
    : gameItems;
};

export const countGamesBySystem = (games: Game[]): Record<string, number> =>
  games.reduce<Record<string, number>>(
    (counts, game) => ({ ...counts, [game.system]: (counts[game.system] || 0) + 1 }),
    {},
  );

export const buildHomeChips = ({
  games,
  systems,
}: {
  games: Game[];
  systems: Pick<SystemDef, 'id' | 'shortName'>[];
}): HomeChip[] => {
  const counts = countGamesBySystem(games);
  return [
    { id: ALL_FILTER, shortName: 'Todos', count: games.length },
    ...systems
      .filter((system) => counts[system.id])
      .map((system) => ({
        id: system.id,
        shortName: system.shortName,
        count: counts[system.id] ?? 0,
      })),
  ];
};

// ─── Navegação / layout ───────────────────────────────────────────────────────

export const resolveActiveFilter = (filter: string, games: Game[]): string => {
  if (filter === ALL_FILTER) return filter;
  return games.some((game) => game.system === filter) ? filter : ALL_FILTER;
};

export const findItemIndex = (items: { key: string }[], key: string | undefined): number => {
  const index = items.findIndex((item) => item.key === key);
  return index >= 0 ? index : 0;
};

export const calculateCycledValue = <T>(values: T[], currentValue: T, step: number): T => {
  if (values.length === 0) return currentValue;
  const index = (values.indexOf(currentValue) + step + values.length) % values.length;
  return values[index] as T;
};

export const calculateVisibleRange = ({
  selectedIndex,
  itemCount,
  rowWidth,
  stride,
}: {
  selectedIndex: number;
  itemCount: number;
  rowWidth: number;
  stride: number;
}): VisibleRange => ({
  from: Math.max(0, selectedIndex - TILES_BEFORE_SELECTION),
  to: Math.min(itemCount - 1, selectedIndex + Math.ceil(rowWidth / stride) + 1),
});

export const calculateTileOffset = ({
  index,
  selectedIndex,
  stride,
  selectedSize,
  tileSize,
}: {
  index: number;
  selectedIndex: number;
  stride: number;
  selectedSize: number;
  tileSize: number;
}): number =>
  (index - selectedIndex) * stride +
  (index > selectedIndex ? selectedSize - tileSize + SELECTED_TILE_EXTRA_GAP_PX : 0);
