/**
 * Testes de títulos/região/id de ROM.
 *
 * Os casos de `formatGameTitle` e `findRegion` vêm de
 * `test/main/rom-titles.test.js` do projeto original, com as mesmas asserções.
 *
 * O SHA-1 é verificado contra `node:crypto` — isso prova que o id gerado no
 * Android é bit a bit igual ao do launcher de PC, que é o que permite migrar
 * a biblioteca sem perder histórico de jogo.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  calculateGameId,
  findRegion,
  formatGameTitle,
  removeInvalidFilenameCharacters,
} from '../src/library/romTitles.ts';
import { sha1Hex } from '../src/library/sha1.ts';

describe('formatGameTitle', () => {
  it('remove as tags e mantém o número do disco', () => {
    assert.equal(
      formatGameTitle('Final Fantasy VII (USA) (Disc 1)'),
      'Final Fantasy VII (Disco 1)',
    );
  });

  it('move o artigo final para a frente', () => {
    assert.equal(
      formatGameTitle('Legend of Zelda, The - Test (Europe)'),
      'The Legend of Zelda - Test',
    );
  });

  it('troca underscores por espaço', () => {
    assert.equal(formatGameTitle('Gran_Turismo_4 (Brazil, Portugal)'), 'Gran Turismo 4');
  });
});

describe('findRegion', () => {
  it('encontra região única e múltipla', () => {
    assert.equal(findRegion('Metroid Prime (Japan)'), 'Japan');
    assert.equal(findRegion('Gran_Turismo_4 (Brazil, Portugal)'), 'Brazil, Portugal');
    assert.equal(findRegion('Tokyo Xtreme Racer 3 [!]'), '');
  });
});

describe('removeInvalidFilenameCharacters', () => {
  it('remove caracteres proibidos em nome de arquivo', () => {
    assert.equal(removeInvalidFilenameCharacters('A/B:C*D?E"F'), 'ABCDEF');
  });
});

describe('sha1Hex', () => {
  it('bate com node:crypto em vários tamanhos e alfabetos', () => {
    const samples = [
      '',
      'a',
      'abc',
      'psx|/storage/emulated/0/roms/psx/crash.bin',
      'Gran Turismo 4 (USA).iso',
      'acentuação e emoji 🎮',
      'x'.repeat(55), // limite do padding
      'x'.repeat(56),
      'x'.repeat(64),
      'x'.repeat(119),
      'x'.repeat(1000),
    ];

    for (const sample of samples) {
      const expected = createHash('sha1').update(sample).digest('hex');
      assert.equal(sha1Hex(sample), expected, `falhou para ${JSON.stringify(sample.slice(0, 20))}`);
    }
  });
});

describe('calculateGameId', () => {
  it('produz 12 caracteres hexadecimais', () => {
    const id = calculateGameId('ps2|/storage/emulated/0/roms/ps2/gow.iso');
    assert.match(id, /^[0-9a-f]{12}$/);
  });

  it('é estável para a mesma entrada e diferente para entradas diferentes', () => {
    const seed = 'psx|/roms/psx/crash.bin';
    assert.equal(calculateGameId(seed), calculateGameId(seed));
    assert.notEqual(calculateGameId(seed), calculateGameId('psx|/roms/psx/crash2.bin'));
  });
});
