/**
 * Testes do modelo da Biblioteca.
 *
 * Portados de `test/renderer/library-filters.test.js` do projeto original,
 * com as mesmas asserções, mais os casos de navegação em grade (que no
 * original viviam no DOM e por isso não tinham teste).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  countLibraryGames,
  filterLibraryGames,
  formatGameCount,
  moveInGrid,
} from '../src/views/library/libraryModel.ts';
import type { LibrarySort } from '../src/views/library/libraryModel.ts';
import type { Game, GameStats } from '../src/store/types.ts';

const GAMES: Game[] = [
  { id: 'a', title: 'Zelda', file: 'zelda.nds', system: 'nds', added: 1, path: '/r/a.nds', cover: null },
  { id: 'b', title: 'ape escape', file: 'ape.bin', system: 'psx', added: 3, path: '/r/b.bin', cover: null },
  { id: 'c', title: 'Crash', file: 'crash.bin', system: 'psx', added: 2, path: '/r/c.bin', cover: null },
];

const STATS: Record<string, Partial<GameStats>> = {
  a: { favorite: true, lastPlayed: 10, playTime: 5 },
  c: { lastPlayed: 20, playTime: 50 },
};

const listIds = (options: {
  filter?: string;
  sort?: LibrarySort['id'];
  query?: string;
}): string[] =>
  filterLibraryGames({
    games: GAMES,
    gameStats: STATS,
    filter: 'all',
    sort: 'az',
    query: '',
    ...options,
  }).map((game) => game.id);

describe('filterLibraryGames', () => {
  it('ordena por título por padrão', () => {
    assert.deepEqual(listIds({}), ['b', 'c', 'a']);
  });

  it('filtra favoritos, jogados e por sistema', () => {
    assert.deepEqual(listIds({ filter: 'fav' }), ['a']);
    assert.deepEqual(listIds({ filter: 'psx' }), ['b', 'c']);
  });

  it('ordena o filtro de recentes por data quando a ordem é por nome', () => {
    assert.deepEqual(listIds({ filter: 'recent' }), ['c', 'a']);
  });

  it('aplica a ordenação escolhida', () => {
    assert.deepEqual(listIds({ sort: 'played' }), ['c', 'a', 'b']);
    assert.deepEqual(listIds({ sort: 'added' }), ['b', 'c', 'a']);
  });

  it('busca por título e por nome de arquivo, sem diferenciar caixa', () => {
    assert.deepEqual(listIds({ query: '  CRASH ' }), ['c']);
    assert.deepEqual(listIds({ query: 'ape.bin' }), ['b']);
  });
});

describe('countLibraryGames', () => {
  it('conta por sistema, favoritos e jogados', () => {
    assert.deepEqual(countLibraryGames({ games: GAMES, gameStats: STATS }), {
      bySystem: { nds: 1, psx: 2 },
      favorites: 1,
      recent: 2,
    });
  });
});

describe('formatGameCount', () => {
  it('usa o singular para um jogo', () => {
    assert.equal(formatGameCount(1), '1 jogo');
    assert.equal(formatGameCount(3), '3 jogos');
  });
});

describe('moveInGrid', () => {
  const grid = (index: number, direction: 'left' | 'right' | 'up' | 'down') =>
    moveInGrid({ index, direction, columns: 4, total: 10 });

  it('anda na horizontal', () => {
    assert.equal(grid(5, 'left'), 4);
    assert.equal(grid(5, 'right'), 6);
  });

  it('não atravessa a linha ao passar da borda', () => {
    // índice 4 é a primeira coluna: esquerda não deve ir para a linha de cima
    assert.equal(grid(4, 'left'), 4);
    // índice 7 é a última coluna de uma grade de 4
    assert.equal(grid(7, 'right'), 7);
  });

  it('anda na vertical por uma linha inteira', () => {
    assert.equal(grid(5, 'up'), 1);
    assert.equal(grid(5, 'down'), 9);
  });

  it('trava no fim da lista', () => {
    assert.equal(grid(8, 'down'), 9);
  });
});
