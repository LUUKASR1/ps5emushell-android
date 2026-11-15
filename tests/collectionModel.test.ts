/**
 * Testes do modelo de Coleções.
 *
 * Portados de `test/renderer/collection-rules.test.js` do projeto original,
 * com as mesmas asserções onde a API é equivalente.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCollection,
  findNameMatches,
  formatCollectionCount,
  formatGameCount,
  formatMatchPreview,
  formatSystemNames,
  listCollectionGames,
  listMosaicCovers,
  mergePickedGameIds,
  withCollectionReplaced,
  withGameToggled,
  withoutCollection,
} from '../src/views/collections/collectionModel.ts';
import type { Collection } from '../src/views/collections/collectionModel.ts';
import type { Game } from '../src/store/types.ts';

const game = (id: string, title: string, system = 'psx', cover: string | null = null): Game => ({
  id,
  title,
  system,
  path: `/roms/${id}.iso`,
  cover,
  base: title,
});

describe('contagens', () => {
  it('usa singular e plural', () => {
    assert.equal(formatGameCount(1), '1 jogo');
    assert.equal(formatGameCount(3), '3 jogos');
    assert.equal(formatCollectionCount(1), '1 coleção');
    assert.equal(formatCollectionCount(0), '0 coleções');
  });
});

describe('buildCollection', () => {
  it('deriva o id do horário de criação', () => {
    assert.deepEqual(buildCollection({ name: 'NFS', gameIds: ['g1'], now: 36 }), {
      id: 'c10',
      name: 'NFS',
      games: ['g1'],
      created: 36,
    });
  });
});

describe('listCollectionGames', () => {
  it('mantém a ordem da coleção e descarta jogos ausentes', () => {
    const byId = new Map([
      ['a', game('a', 'A')],
      ['b', game('b', 'B')],
    ]);
    const collection: Collection = { id: 'c1', name: 'X', games: ['b', 'z', 'a'], created: 0 };

    assert.deepEqual(
      listCollectionGames(byId, collection).map((entry) => entry.id),
      ['b', 'a'],
    );
  });
});

describe('findNameMatches', () => {
  it('encontra por título e por nome de arquivo, sem repetir os já incluídos', () => {
    const games = [
      game('1', 'Need for Speed Heat'),
      game('2', 'Need for Speed Most Wanted'),
      game('3', 'Gran Turismo'),
    ];
    const collection: Collection = { id: 'c1', name: 'need for speed', games: ['1'], created: 0 };

    assert.deepEqual(
      findNameMatches(games, collection).map((entry) => entry.id),
      ['2'],
    );
  });

  it('prévia corta em 6 e sinaliza com reticências', () => {
    const matches = Array.from({ length: 8 }, (_, index) => game(String(index), `Jogo ${index}`));
    const preview = formatMatchPreview(matches);
    assert.ok(preview.endsWith('…'));
    assert.equal(preview.split(',').length, 6);
  });
});

describe('withGameToggled', () => {
  const base: Collection = { id: 'c1', name: 'X', games: ['a'], created: 0 };

  it('alterna sem argumento', () => {
    assert.deepEqual(withGameToggled(base, 'a').games, []);
    assert.deepEqual(withGameToggled(base, 'b').games, ['a', 'b']);
  });

  it('respeita inclusão explícita e é idempotente', () => {
    assert.deepEqual(withGameToggled(base, 'a', true), base);
    assert.deepEqual(withGameToggled(base, 'b', false), base);
  });
});

describe('mergePickedGameIds', () => {
  it('preserva a ordem dos existentes e acrescenta os novos ao fim', () => {
    assert.deepEqual(mergePickedGameIds(['a', 'b', 'c'], new Set(['c', 'a', 'd'])), [
      'a',
      'c',
      'd',
    ]);
  });
});

describe('withCollectionReplaced / withoutCollection', () => {
  const collections: Collection[] = [
    { id: 'c1', name: 'A', games: [], created: 1 },
    { id: 'c2', name: 'B', games: [], created: 2 },
  ];

  it('substitui pelo id', () => {
    const updated = { id: 'c2', name: 'B2', games: [], created: 2 };
    assert.deepEqual(withCollectionReplaced(collections, updated)[1], updated);
  });

  it('remove pelo id', () => {
    assert.deepEqual(
      withoutCollection(collections, 'c1').map((entry) => entry.id),
      ['c2'],
    );
  });
});

describe('listMosaicCovers / formatSystemNames', () => {
  it('limita o mosaico a 4 capas e respeita a preferência', () => {
    const games = Array.from({ length: 6 }, (_, index) =>
      game(String(index), `J${index}`, 'psx', `/c/${index}.png`),
    );
    assert.equal(listMosaicCovers(games, true).length, 4);
    assert.deepEqual(listMosaicCovers(games, false), []);
  });

  it('lista sistemas únicos', () => {
    const games = [game('1', 'A', 'psx'), game('2', 'B', 'ps2'), game('3', 'C', 'psx')];
    const shortNames: Record<string, string> = { psx: 'PSX', ps2: 'PS2' };
    assert.equal(formatSystemNames(games, (id) => shortNames[id]), 'PSX · PS2');
  });
});
