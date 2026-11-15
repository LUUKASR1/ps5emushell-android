/**
 * Modelo de Coleções — porte de `views/collections/collection-rules.js`.
 *
 * Lógica pura, sem DOM e sem I/O. As coleções são listas de ids de jogos
 * agrupadas por nome; a "regra" do original nada mais é do que casar o nome da
 * coleção com o título/base dos jogos para sugerir inclusões.
 */

import type { Collection, Game } from '../../store/types';

const LOCALE = 'pt-BR';
const MATCH_PREVIEW_COUNT = 6;
const MAX_MOSAIC_COVERS = 4;

export type { Collection };

export const formatGameCount = (count: number): string =>
  `${count} ${count === 1 ? 'jogo' : 'jogos'}`;

export const formatCollectionCount = (count: number): string =>
  `${count} ${count === 1 ? 'coleção' : 'coleções'}`;

/** Mantém a ordem da coleção e descarta ids que não existem mais. */
export const listCollectionGames = (
  gamesById: Map<string, Game>,
  collection: Collection | null | undefined,
): Game[] =>
  collection
    ? collection.games
        .map((gameId) => gamesById.get(gameId))
        .filter((game): game is Game => Boolean(game))
    : [];

export const buildCollection = ({
  name,
  gameIds,
  now,
}: {
  name: string;
  gameIds: string[];
  now: number;
}): Collection => ({
  id: `c${now.toString(36)}`,
  name,
  games: gameIds,
  created: now,
});

/** Jogos cujo título ou nome de arquivo casa com o nome da coleção. */
export const findNameMatches = (games: Game[], collection: Collection): Game[] => {
  const query = collection.name.toLowerCase();
  return games.filter(
    (game) =>
      !collection.games.includes(game.id) &&
      (game.title.toLowerCase().includes(query) ||
        (game.base ?? '').toLowerCase().includes(query)),
  );
};

export const formatMatchPreview = (matches: Game[]): string =>
  `${matches
    .slice(0, MATCH_PREVIEW_COUNT)
    .map((game) => game.title)
    .join(', ')}${matches.length > MATCH_PREVIEW_COUNT ? '…' : ''}`;

export const withGameToggled = (
  collection: Collection,
  gameId: string,
  isIncluded?: boolean,
): Collection => {
  const hasGame = collection.games.includes(gameId);
  const shouldInclude = isIncluded === undefined ? !hasGame : isIncluded;

  if (shouldInclude && !hasGame) {
    return { ...collection, games: [...collection.games, gameId] };
  }
  if (!shouldInclude && hasGame) {
    return { ...collection, games: collection.games.filter((id) => id !== gameId) };
  }
  return collection;
};

/**
 * Reordena os ids para que os já existentes venham primeiro (na ordem atual) e
 * os novos depois. Preserva a curadoria do usuário ao reabrir o seletor.
 */
export const mergePickedGameIds = (
  currentIds: string[],
  selectedIds: Set<string>,
): string[] => [
  ...currentIds.filter((gameId) => selectedIds.has(gameId)),
  ...[...selectedIds].filter((gameId) => !currentIds.includes(gameId)),
];

export const withCollectionReplaced = (
  collections: Collection[],
  nextCollection: Collection,
): Collection[] =>
  collections.map((collection) =>
    collection.id === nextCollection.id ? nextCollection : collection,
  );

export const sortGamesByTitle = (games: Game[]): Game[] =>
  [...games].sort((first, second) =>
    first.title.localeCompare(second.title, LOCALE, { sensitivity: 'base' }),
  );

/** Capas para o mosaico da coleção (até 4, como no original). */
export const listMosaicCovers = (games: Game[], isCoverArtEnabled: boolean): string[] =>
  isCoverArtEnabled
    ? games
        .map((game) => game.cover)
        .filter((cover): cover is string => Boolean(cover))
        .slice(0, MAX_MOSAIC_COVERS)
    : [];

export const formatSystemNames = (
  games: Game[],
  findShortName: (systemId: string) => string | undefined,
): string =>
  [...new Set(games.map((game) => findShortName(game.system)).filter(Boolean))].join(' · ');

/** Remove uma coleção pelo id. */
export const withoutCollection = (
  collections: Collection[],
  collectionId: string,
): Collection[] => collections.filter((collection) => collection.id !== collectionId);
