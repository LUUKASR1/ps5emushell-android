/**
 * Testes do modelo da Home.
 *
 * Portados de `test/renderer/home-row.test.js` do PS5 Emu Shell original,
 * com as mesmas asserções — servem para provar que o porte não mudou o
 * comportamento (ordenação, filtros, faixa visível, offsets).
 *
 * Rodar com: npm test   (node --test)
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALL_FILTER,
  LIBRARY_ITEM_KEY,
  buildHomeChips,
  buildHomeItems,
  calculateCycledValue,
  calculateTileOffset,
  calculateVisibleRange,
  findItemIndex,
  resolveActiveFilter,
} from '../src/views/home/homeRowModel.ts';
import type { Game, GameStats } from '../src/store/types.ts';

const GAMES: Game[] = [
  { id: 'a', title: 'Zelda', system: 'nds', path: '/roms/a.nds', cover: null },
  { id: 'b', title: 'ape escape', system: 'psx', path: '/roms/b.iso', cover: null },
  { id: 'c', title: 'Crash', system: 'psx', path: '/roms/c.iso', cover: null },
];

const statsWith = (entries: Record<string, Partial<GameStats>>): Record<string, GameStats> => {
  const out: Record<string, GameStats> = {};
  for (const [id, partial] of Object.entries(entries)) {
    out[id] = {
      playTime: 0,
      playCount: 0,
      lastPlayed: null,
      lastSessionMs: null,
      favorite: false,
      ...partial,
    };
  }
  return out;
};

describe('buildHomeItems', () => {
  it('ordena por último jogado, depois por título, e anexa o tile da biblioteca', () => {
    const items = buildHomeItems({
      games: GAMES,
      filter: ALL_FILTER,
      gameStats: statsWith({ a: { lastPlayed: 5 } }),
    });
    assert.deepEqual(
      items.map((item) => item.key),
      ['a', 'b', 'c', LIBRARY_ITEM_KEY],
    );
  });

  it('filtra por sistema', () => {
    const items = buildHomeItems({ games: GAMES, filter: 'psx', gameStats: {} });
    assert.deepEqual(
      items.map((item) => item.key),
      ['b', 'c', LIBRARY_ITEM_KEY],
    );
  });

  it('não tem tile de biblioteca sem jogos', () => {
    assert.deepEqual(buildHomeItems({ games: [], filter: ALL_FILTER, gameStats: {} }), []);
  });
});

describe('buildHomeChips', () => {
  it('lista o chip "Todos" e só os sistemas que têm jogos', () => {
    const chips = buildHomeChips({
      games: GAMES,
      systems: [
        { id: 'psx', shortName: 'PSX' },
        { id: 'ps2', shortName: 'PS2' },
        { id: 'nds', shortName: 'NDS' },
      ],
    });
    assert.deepEqual(
      chips.map((chip) => [chip.id, chip.count]),
      [
        ['all', 3],
        ['psx', 2],
        ['nds', 1],
      ],
    );
  });
});

describe('helpers da fileira', () => {
  it('volta para "Todos" quando o sistema filtrado não tem jogos', () => {
    assert.equal(resolveActiveFilter('gc', GAMES), ALL_FILTER);
    assert.equal(resolveActiveFilter('psx', GAMES), 'psx');
  });

  it('encontra o índice do item ou cai no primeiro', () => {
    const items = [{ key: 'x' }, { key: 'y' }];
    assert.equal(findItemIndex(items, 'y'), 1);
    assert.equal(findItemIndex(items, 'z'), 0);
  });

  it('cicla valores nos dois sentidos', () => {
    assert.equal(calculateCycledValue(['a', 'b', 'c'], 'c', 1), 'a');
    assert.equal(calculateCycledValue(['a', 'b', 'c'], 'a', -1), 'c');
  });

  it('mantém dois tiles antes da seleção e o suficiente para encher a fileira', () => {
    assert.deepEqual(
      calculateVisibleRange({ selectedIndex: 5, itemCount: 40, rowWidth: 1000, stride: 128 }),
      { from: 3, to: 14 },
    );
  });

  it('empurra os tiles depois da seleção pelo tamanho ampliado', () => {
    const base = { selectedIndex: 2, stride: 128, selectedSize: 185.6, tileSize: 116 };
    assert.equal(calculateTileOffset({ ...base, index: 1 }), -128);
    assert.equal(calculateTileOffset({ ...base, index: 2 }), 0);
    assert.ok(Math.abs(calculateTileOffset({ ...base, index: 3 }) - 201.6) < 1e-9);
  });
});
