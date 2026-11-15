/**
 * Testes do scanner de ROMs.
 *
 * O original chamava `node:fs` direto, o que só permitia testar com o disco
 * real. Aqui o sistema de arquivos é injetado, então dá para exercitar as
 * regras que mais erram na prática: profundidade, playlists de CD e dedupe.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_ROM_SCAN_DEPTH,
  listSystemGames,
  normalizeExtensions,
  parsePlaylistReferences,
  scanLibrary,
} from '../src/library/scanner.ts';
import type { DirEntry, FileStat, RomFileSystem } from '../src/library/scanner.ts';
import { normalize, resolve, extname, basename } from '../src/library/posixPath.ts';

// ─── Sistema de arquivos falso ────────────────────────────────────────────────

const fakeFs = (tree: Record<string, string | null>): RomFileSystem => {
  const files = new Map(Object.entries(tree));

  const dirs = new Set<string>();
  for (const filePath of files.keys()) {
    let current = filePath;
    while (current.includes('/')) {
      current = current.slice(0, current.lastIndexOf('/'));
      dirs.add(current);
    }
    dirs.add(filePath);
  }

  return {
    async listDir(dir: string): Promise<DirEntry[]> {
      const prefix = `${dir.replace(/\/+$/, '')}/`;
      const seen = new Map<string, DirEntry>();
      for (const filePath of files.keys()) {
        if (!filePath.startsWith(prefix)) continue;
        const rest = filePath.slice(prefix.length);
        const slash = rest.indexOf('/');
        const name = slash < 0 ? rest : rest.slice(0, slash);
        seen.set(name, { name, isDirectory: slash >= 0 });
      }
      return [...seen.values()];
    },
    async stat(file: string): Promise<FileStat | null> {
      return files.has(file) ? { size: 1024, birthtimeMs: 1000, mtimeMs: 2000 } : null;
    },
    async readText(file: string): Promise<string | null> {
      return files.get(file) ?? null;
    },
  };
};

const PSX = { id: 'psx', extensions: ['cue', 'bin', 'iso'], romDirs: ['/roms/psx'] };

// ─── Helpers de caminho ───────────────────────────────────────────────────────

describe('posixPath', () => {
  it('extrai extensão e nome', () => {
    assert.equal(extname('/a/b/game.iso'), '.iso');
    assert.equal(basename('/a/b/game.iso'), 'game.iso');
    assert.equal(basename('/a/b/game.iso', '.iso'), 'game');
    assert.equal(extname('/a/b/.nomedia'), '');
  });

  it('normaliza e resolve', () => {
    assert.equal(normalize('/a/b/../c/./d'), '/a/c/d');
    assert.equal(resolve('/roms/psx', 'sub/game.bin'), '/roms/psx/sub/game.bin');
    assert.equal(resolve('/roms/psx', '/abs/game.bin'), '/abs/game.bin');
  });
});

describe('normalizeExtensions', () => {
  it('aceita com e sem ponto, em minúsculas', () => {
    assert.deepEqual([...normalizeExtensions(['ISO', '.Cue'])], ['.iso', '.cue']);
  });
});

describe('parsePlaylistReferences', () => {
  it('lê linhas de .m3u ignorando comentários', () => {
    const refs = parsePlaylistReferences({
      extension: '.m3u',
      content: '#EXTM3U\ndisc1.cue\n\n# comentário\ndisc2.cue\n',
      playlistDir: '/roms/psx',
    });
    assert.deepEqual(refs, ['/roms/psx/disc1.cue', '/roms/psx/disc2.cue']);
  });

  it('lê entradas FILE de .cue com e sem aspas', () => {
    const refs = parsePlaylistReferences({
      extension: '.cue',
      content: 'FILE "Track 01.bin" BINARY\nFILE track02.bin BINARY\n',
      playlistDir: '/roms/psx',
    });
    assert.deepEqual(refs, ['/roms/psx/Track 01.bin', '/roms/psx/track02.bin']);
  });
});

// ─── Varredura ────────────────────────────────────────────────────────────────

describe('listSystemGames', () => {
  it('lista só arquivos com extensão de ROM, em subpastas até o limite', async () => {
    const fs = fakeFs({
      '/roms/psx/Crash Bandicoot (USA).bin': null,
      '/roms/psx/notas.txt': null,
      '/roms/psx/sub/Metal Gear (Europe).iso': null,
    });

    const games = await listSystemGames(PSX, fs);
    assert.deepEqual(
      games.map((game) => game.title),
      ['Crash Bandicoot', 'Metal Gear'],
    );
  });

  it('respeita a profundidade máxima', async () => {
    const deep = `${'/roms/psx'}${'/d'.repeat(MAX_ROM_SCAN_DEPTH + 1)}/Fundo.iso`;
    const fs = fakeFs({ [`/roms/psx/Topo.iso`]: null, [deep]: null });

    const games = await listSystemGames(PSX, fs);
    assert.deepEqual(
      games.map((game) => game.title),
      ['Topo'],
    );
  });

  it('não duplica o .bin referenciado por um .cue', async () => {
    const fs = fakeFs({
      '/roms/psx/Final Fantasy VII (USA) (Disc 1).cue':
        'FILE "Final Fantasy VII (USA) (Disc 1).bin" BINARY\n',
      '/roms/psx/Final Fantasy VII (USA) (Disc 1).bin': null,
    });

    const games = await listSystemGames(PSX, fs);
    assert.equal(games.length, 1);
    assert.equal(games[0]?.title, 'Final Fantasy VII (Disco 1)');
  });

  it('preenche região, tamanho e id', async () => {
    const fs = fakeFs({ '/roms/psx/Metroid Prime (Japan).iso': null });
    const games = await listSystemGames(PSX, fs);

    assert.equal(games[0]?.region, 'Japan');
    assert.equal(games[0]?.added, 1000);
    assert.match(games[0]?.id ?? '', /^[0-9a-f]{12}$/);
  });
});

describe('scanLibrary', () => {
  it('junta sistemas e ordena por título', async () => {
    const fs = fakeFs({
      '/roms/psx/Zelda.iso': null,
      '/roms/ps2/ape escape.iso': null,
    });

    const result = await scanLibrary({
      systems: [
        { ...PSX },
        { id: 'ps2', extensions: ['iso'], romDirs: ['/roms/ps2'] },
      ],
      fs,
    });

    assert.deepEqual(
      result.games.map((game) => game.title),
      ['ape escape', 'Zelda'],
    );
  });

  it('ignora sistemas desativados e jogos nativos', async () => {
    const fs = fakeFs({ '/roms/psx/Zelda.iso': null });

    const result = await scanLibrary({
      systems: [
        { ...PSX, enabled: false },
        { id: 'pc', native: true, romDirs: ['/jogos'] },
      ],
      fs,
    });

    assert.equal(result.games.length, 0);
  });

  it('remove duplicatas quando dois sistemas apontam para a mesma pasta', async () => {
    const fs = fakeFs({ '/roms/psx/Zelda.iso': null });

    const result = await scanLibrary({
      systems: [PSX, { ...PSX, id: 'psx' }],
      fs,
    });

    assert.equal(result.games.length, 1);
  });

  it('reporta sistemas cuja pasta não pôde ser lida', async () => {
    const fs = fakeFs({});
    const result = await scanLibrary({ systems: [PSX], fs });
    assert.deepEqual(result.unreadableSystems, ['psx']);
  });
});
