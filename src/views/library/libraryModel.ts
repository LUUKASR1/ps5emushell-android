/**
 * Modelo da Biblioteca — porte de `views/library/library-filters.js`.
 *
 * Lógica pura, sem DOM. Mantido alinhado ao original para que os testes
 * portados continuem valendo.
 */

import type { Game, GameStats } from '../../store/types';

// ─── Constantes ───────────────────────────────────────────────────────────────

export interface LibrarySort {
  id: 'az' | 'recent' | 'played' | 'added';
  label: string;
}

export const LIBRARY_SORTS: LibrarySort[] = [
  { id: 'az', label: 'Nome (A–Z)' },
  { id: 'recent', label: 'Jogados recentemente' },
  { id: 'played', label: 'Mais jogados' },
  { id: 'added', label: 'Adicionados recentemente' },
];

export const DEFAULT_LIBRARY_FILTER = 'all';
export const DEFAULT_LIBRARY_SORT: LibrarySort['id'] = 'az';

const SPECIAL_FILTERS = ['all', 'fav', 'recent'];
const LOCALE = 'pt-BR';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const compareTitles = (first: Game, second: Game): number =>
  first.title.localeCompare(second.title, LOCALE, { sensitivity: 'base' });

/**
 * Nome do arquivo usado na busca textual.
 * No original o objeto do jogo já trazia `file`; aqui derivamos do path quando
 * ausente para não obrigar o scanner a preencher os dois campos.
 */
const fileNameOf = (game: Game): string =>
  game.file ?? game.path.split('/').pop() ?? '';

const isGameInFilter = ({
  game,
  stats,
  filter,
  query,
}: {
  game: Game;
  stats: Partial<GameStats>;
  filter: string;
  query: string;
}): boolean => {
  if (filter === 'fav' && !stats.favorite) return false;
  if (filter === 'recent' && !stats.lastPlayed) return false;
  if (!SPECIAL_FILTERS.includes(filter) && game.system !== filter) return false;

  if (query) {
    const haystackTitle = game.title.toLowerCase();
    const haystackFile = fileNameOf(game).toLowerCase();
    if (!haystackTitle.includes(query) && !haystackFile.includes(query)) return false;
  }
  return true;
};

const buildSortKeys = (gameStats: Record<string, GameStats | undefined>) => ({
  recent: (game: Game): number => {
    const played = gameStats[game.id]?.lastPlayed;
    return typeof played === 'number' ? played : 0;
  },
  played: (game: Game): number => gameStats[game.id]?.playTime ?? 0,
  added: (game: Game): number => game.added ?? 0,
});

// ─── Filtro + ordenação ───────────────────────────────────────────────────────

export const filterLibraryGames = ({
  games,
  gameStats,
  filter,
  sort,
  query,
}: {
  games: Game[];
  gameStats: Record<string, GameStats | undefined>;
  filter: string;
  sort: LibrarySort['id'];
  query: string;
}): Game[] => {
  const normalizedQuery = query.trim().toLowerCase();
  const sortKeys = buildSortKeys(gameStats);

  // No filtro "recentes", ordenar por A–Z não faz sentido: cai para data.
  const effectiveSort: LibrarySort['id'] =
    filter === 'recent' && sort === DEFAULT_LIBRARY_SORT ? 'recent' : sort;

  const sortKey = effectiveSort === 'az' ? null : sortKeys[effectiveSort];
  const compareGames = sortKey
    ? (first: Game, second: Game) => sortKey(second) - sortKey(first) || compareTitles(first, second)
    : compareTitles;

  return games
    .filter((game) =>
      isGameInFilter({
        game,
        stats: gameStats[game.id] ?? {},
        filter,
        query: normalizedQuery,
      }),
    )
    .sort(compareGames);
};

export interface LibraryCounts {
  bySystem: Record<string, number>;
  favorites: number;
  recent: number;
}

export const countLibraryGames = ({
  games,
  gameStats,
}: {
  games: Game[];
  gameStats: Record<string, GameStats | undefined>;
}): LibraryCounts =>
  games.reduce<LibraryCounts>(
    (counts, game) => {
      const stats: Partial<GameStats> = gameStats[game.id] ?? {};
      return {
        bySystem: {
          ...counts.bySystem,
          [game.system]: (counts.bySystem[game.system] ?? 0) + 1,
        },
        favorites: counts.favorites + (stats.favorite ? 1 : 0),
        recent: counts.recent + (stats.lastPlayed ? 1 : 0),
      };
    },
    { bySystem: {}, favorites: 0, recent: 0 },
  );

export const findSortLabel = (sortId: LibrarySort['id']): string =>
  LIBRARY_SORTS.find((sort) => sort.id === sortId)?.label ?? LIBRARY_SORTS[0]!.label;

export const formatGameCount = (count: number): string =>
  `${count} ${count === 1 ? 'jogo' : 'jogos'}`;

// ─── Grade ────────────────────────────────────────────────────────────────────

/**
 * Navegação em grade. O original tratava isso no DOM com foco espacial;
 * aqui o mesmo movimento é calculado a partir do índice, o que é testável.
 */
export const moveInGrid = ({
  index,
  direction,
  columns,
  total,
}: {
  index: number;
  direction: 'left' | 'right' | 'up' | 'down';
  columns: number;
  total: number;
}): number => {
  if (total <= 0) return 0;
  const safeColumns = Math.max(1, columns);

  const next = (() => {
    switch (direction) {
      case 'left':
        return index - 1;
      case 'right':
        return index + 1;
      case 'up':
        return index - safeColumns;
      case 'down':
        return index + safeColumns;
      default:
        return index;
    }
  })();

  // Bordas laterais: não "pula" de linha ao passar do começo/fim.
  if (direction === 'left' && index % safeColumns === 0) return index;
  if (direction === 'right' && index % safeColumns === safeColumns - 1) return index;

  return Math.min(total - 1, Math.max(0, next));
};
