/**
 * Scanner de ROMs — porte de `main/library/scanner.js`.
 *
 * Diferença central em relação ao original: o acesso a arquivos é injetado
 * (`RomFileSystem`). No Electron o scanner chamava `node:fs` direto; no Android
 * quem lista diretórios é o plugin nativo. Com a interface injetada, a lógica
 * de varredura — que é a parte com regra de negócio — fica testável em Node
 * com um sistema de arquivos falso, sem device nem permissões.
 *
 * Regras preservadas do original:
 *  - respeita profundidade máxima de subpastas
 *  - um arquivo é ROM se a extensão bate OU se o nome é um arquivo-capa de
 *    jogo em pasta (EBOOT.BIN, etc.)
 *  - arquivos referenciados por .cue/.m3u/.gdi não entram como jogos separados
 *    (senão um jogo de CD apareceria duas vezes)
 */

import type { Game } from '../store/types';
import * as path from './posixPath.ts';
import {
  calculateGameId,
  findRegion,
  formatGameTitle,
} from './romTitles.ts';

// ─── Constantes ───────────────────────────────────────────────────────────────

export const MAX_ROM_SCAN_DEPTH = 4;
export const PLAYLIST_EXTENSIONS = ['.cue', '.m3u', '.gdi'];
export const TITLE_LOCALE = 'pt-BR';

const QUOTED_FILE_ENTRY = /FILE\s+"([^"]+)"/gi;
const UNQUOTED_FILE_ENTRY = /FILE\s+([^"\s]+)\s/gi;

// ─── Abstração de sistema de arquivos ─────────────────────────────────────────

export interface DirEntry {
  name: string;
  isDirectory: boolean;
}

export interface FileStat {
  size: number;
  birthtimeMs: number;
  mtimeMs: number;
}

export interface RomFileSystem {
  listDir(dir: string): Promise<DirEntry[]>;
  stat(file: string): Promise<FileStat | null>;
  readText(file: string): Promise<string | null>;
}

export interface ScanSystem {
  id: string;
  name?: string;
  enabled?: boolean;
  native?: boolean;
  extensions?: string[];
  gameFiles?: string[];
  romDirs?: string[];
}

// ─── Helpers puros ────────────────────────────────────────────────────────────

export const normalizeExtensions = (extensions?: string[]): Set<string> =>
  new Set(
    (extensions ?? []).map((extension) =>
      (extension.startsWith('.') ? extension : `.${extension}`).toLowerCase(),
    ),
  );

/** Extrai os arquivos referenciados por uma playlist de CD. */
export const parsePlaylistReferences = ({
  extension,
  content,
  playlistDir,
}: {
  extension: string;
  content: string;
  playlistDir: string;
}): string[] => {
  if (extension === '.m3u') {
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => path.resolve(playlistDir, line));
  }

  return [
    ...content.matchAll(QUOTED_FILE_ENTRY),
    ...content.matchAll(UNQUOTED_FILE_ENTRY),
  ].map((match) => path.resolve(playlistDir, match[1]!));
};

// ─── Varredura ────────────────────────────────────────────────────────────────

const listRomFiles = async ({
  dir,
  extensions,
  gameFileNames,
  depth,
  fs,
}: {
  dir: string;
  extensions: Set<string>;
  gameFileNames: Set<string>;
  depth: number;
  fs: RomFileSystem;
}): Promise<string[]> => {
  const entries = await fs.listDir(dir).catch(() => [] as DirEntry[]);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory) {
      if (depth > 0) {
        files.push(
          ...(await listRomFiles({
            dir: fullPath,
            extensions,
            gameFileNames,
            depth: depth - 1,
            fs,
          })),
        );
      }
      continue;
    }

    const isRom =
      extensions.has(path.extname(entry.name).toLowerCase()) ||
      gameFileNames.has(entry.name.toLowerCase());

    if (isRom) files.push(fullPath);
  }

  return files;
};

const listReferencedFiles = async (
  files: string[],
  fs: RomFileSystem,
): Promise<Set<string>> => {
  const referenced = new Set<string>();

  for (const file of files) {
    const extension = path.extname(file).toLowerCase();
    if (!PLAYLIST_EXTENSIONS.includes(extension)) continue;

    const content = await fs.readText(file).catch(() => null);
    if (!content) continue;

    for (const reference of parsePlaylistReferences({
      extension,
      content,
      playlistDir: path.dirname(file),
    })) {
      referenced.add(reference.toLowerCase());
    }
  }

  return referenced;
};

const buildRomEntry = async ({
  system,
  file,
  fs,
}: {
  system: ScanSystem;
  file: string;
  fs: RomFileSystem;
}): Promise<Game> => {
  const baseName = path.basename(file, path.extname(file));
  const fileStat = await fs.stat(file).catch(() => null);

  return {
    id: calculateGameId(`${system.id}|${file.toLowerCase()}`),
    system: system.id,
    path: file,
    file: path.basename(file),
    base: baseName,
    title: formatGameTitle(baseName),
    region: findRegion(baseName),
    cover: null,
    added: fileStat ? Math.round(fileStat.birthtimeMs || fileStat.mtimeMs) : 0,
  };
};

export const listSystemGames = async (
  system: ScanSystem,
  fs: RomFileSystem,
): Promise<Game[]> => {
  const extensions = normalizeExtensions(system.extensions);
  const gameFileNames = new Set(
    (system.gameFiles ?? []).map((name) => name.toLowerCase()),
  );

  const files: string[] = [];
  for (const romDir of system.romDirs ?? []) {
    files.push(
      ...(await listRomFiles({
        dir: romDir,
        extensions,
        gameFileNames,
        depth: MAX_ROM_SCAN_DEPTH,
        fs,
      })),
    );
  }

  const referencedFiles = await listReferencedFiles(files, fs);

  const games: Game[] = [];
  for (const file of files) {
    // Um .bin listado dentro de um .cue não é um jogo separado.
    if (referencedFiles.has(file.toLowerCase())) continue;
    games.push(await buildRomEntry({ system, file, fs }));
  }

  return games;
};

const compareGameTitles = (first: Game, second: Game): number =>
  first.title.localeCompare(second.title, TITLE_LOCALE, { sensitivity: 'base' });

export interface ScanResult {
  scannedAt: number;
  games: Game[];
  /** Sistemas cujo diretório não pôde ser lido (útil para avisar o usuário). */
  unreadableSystems: string[];
}

export const scanLibrary = async ({
  systems,
  fs,
  now = Date.now(),
}: {
  systems: ScanSystem[];
  fs: RomFileSystem;
  now?: number;
}): Promise<ScanResult> => {
  const games: Game[] = [];
  const unreadableSystems: string[] = [];

  for (const system of systems) {
    if (system.enabled === false) continue;
    // Jogos de PC/Android nativo vêm de outra fonte, não de pastas de ROM.
    if (system.native) continue;

    const found = await listSystemGames(system, fs).catch(() => [] as Game[]);
    if (found.length === 0 && (system.romDirs ?? []).length > 0) {
      unreadableSystems.push(system.id);
    }
    games.push(...found);
  }

  // Dois sistemas apontando para a mesma pasta gerariam ids repetidos.
  const unique = new Map<string, Game>();
  for (const game of games) {
    if (!unique.has(game.id)) unique.set(game.id, game);
  }

  return {
    scannedAt: now,
    games: [...unique.values()].sort(compareGameTitles),
    unreadableSystems,
  };
};
