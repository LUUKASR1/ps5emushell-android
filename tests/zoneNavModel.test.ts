/**
 * Testes do foco entre zonas.
 *
 * O original resolvia isso por geometria em `spatial-navigation.js`, sem teste
 * possível. Aqui a regra é determinística, então dá para cobrir os casos que
 * mais causam bug na prática: prender o foco em uma zona e sair da tela pela ponta.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { moveZoneIndex, resolveVerticalMove } from '../src/navigation/zoneNavModel.ts';

const ZONES = ['tools', 'filters', 'grid'] as const;
type Zone = (typeof ZONES)[number];

const move = (current: Zone, delta: -1 | 1, consumed: boolean) =>
  resolveVerticalMove<Zone>({ zones: ZONES, current, delta, consumed });

describe('moveZoneIndex', () => {
  it('trava nas pontas', () => {
    assert.equal(moveZoneIndex(0, -1, 3), 0);
    assert.equal(moveZoneIndex(2, 1, 3), 2);
  });

  it('anda no meio', () => {
    assert.equal(moveZoneIndex(1, 1, 3), 2);
    assert.equal(moveZoneIndex(1, -1, 3), 0);
  });

  it('devolve 0 sem zonas', () => {
    assert.equal(moveZoneIndex(5, 1, 0), 0);
  });
});

describe('resolveVerticalMove', () => {
  it('não muda de zona quando a zona consumiu o movimento', () => {
    assert.deepEqual(move('filters', -1, true), { zone: 'filters', atEdge: false });
  });

  it('muda de zona quando a zona não consumiu', () => {
    assert.deepEqual(move('grid', -1, false), { zone: 'filters', atEdge: false });
    assert.deepEqual(move('filters', -1, false), { zone: 'tools', atEdge: false });
  });

  it('sinaliza a ponta para a tela poder reagir', () => {
    assert.deepEqual(move('tools', -1, false), { zone: 'tools', atEdge: true });
    assert.deepEqual(move('grid', 1, false), { zone: 'grid', atEdge: true });
  });
});
