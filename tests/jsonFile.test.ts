/**
 * Testes do núcleo de persistência.
 *
 * O caso que importa na prática: um `config.json` corrompido não pode impedir
 * o app de abrir. O original já tratava isso (`readJsonFileOrDefault`); o port
 * precisa manter o mesmo comportamento.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseJsonOrDefault, serializeJson } from '../src/library/jsonFile.ts';

describe('parseJsonOrDefault', () => {
  const fallback = { theme: 'dark' };

  it('devolve o valor lido quando o JSON é válido', () => {
    assert.deepEqual(parseJsonOrDefault('{"theme":"light"}', fallback), { theme: 'light' });
  });

  it('devolve o padrão para arquivo ausente ou vazio', () => {
    assert.deepEqual(parseJsonOrDefault(null, fallback), fallback);
    assert.deepEqual(parseJsonOrDefault(undefined, fallback), fallback);
    assert.deepEqual(parseJsonOrDefault('', fallback), fallback);
    assert.deepEqual(parseJsonOrDefault('   ', fallback), fallback);
  });

  it('devolve o padrão para JSON truncado ou inválido', () => {
    assert.deepEqual(parseJsonOrDefault('{"theme":', fallback), fallback);
    assert.deepEqual(parseJsonOrDefault('nao é json', fallback), fallback);
    assert.deepEqual(parseJsonOrDefault('{"theme":"light"', fallback), fallback);
  });

  it('devolve o padrão quando a raiz é null', () => {
    assert.deepEqual(parseJsonOrDefault('null', fallback), fallback);
  });

  it('preserva valores falsy legítimos', () => {
    assert.equal(parseJsonOrDefault('0', 5), 0);
    assert.equal(parseJsonOrDefault('false', true), false);
    assert.deepEqual(parseJsonOrDefault('[]', [1]), []);
  });
});

describe('serializeJson', () => {
  it('grava com indentação legível', () => {
    assert.equal(serializeJson({ a: 1 }), '{\n  "a": 1\n}');
  });

  it('faz ida e volta sem perder dados', () => {
    const value = {
      version: '0.10.0',
      systems: [{ id: 'psx', romDirs: ['/roms/psx'], enabled: true }],
    };
    assert.deepEqual(parseJsonOrDefault(serializeJson(value), null), value);
  });
});
