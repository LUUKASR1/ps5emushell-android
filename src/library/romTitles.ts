/**
 * Títulos e identificadores de ROM — porte de `main/library/rom-titles.js`.
 *
 * Módulo puro: nada de I/O, nada de DOM. É o que decide o nome exibido do jogo,
 * a região e o id estável. Como no original, o id é o SHA-1 do caminho, para que
 * a mesma ROM gere sempre o mesmo id entre varreduras.
 */

import { sha1Hex } from './sha1.ts';

export const GAME_ID_LENGTH = 12;
export const INVALID_FILENAME_CHARACTERS = /[&*/:`<>?\\|"]/g;

const BRACKETED_TAGS = /\s*[([][^)\]]*[)\]]/g;
const TRAILING_ARTICLE = /^(.*?), (The|A|An)(\s*[-:].*)?$/i;
const DISC_NUMBER = /\((?:Disc|Disco|CD)\s*(\d+)/i;
const REGION_TAG =
  /\((USA|Europe|Japan|Brazil|World|Korea|Asia|[A-Z][a-z]+(?:, [A-Z][a-z]+)+)\)/;

/**
 * Transforma o nome do arquivo em título legível.
 *
 * - remove tags entre parênteses/colchetes: `(USA)`, `[!]`
 * - troca `_` por espaço
 * - move artigo final para a frente: `Zelda, The` -> `The Zelda`
 * - reinclui o número do disco: `(Disc 1)` -> `(Disco 1)`
 */
export const formatGameTitle = (baseName: string): string => {
  const cleaned = baseName
    .replace(BRACKETED_TAGS, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const articleMatch = cleaned.match(TRAILING_ARTICLE);
  const withArticle = articleMatch
    ? `${articleMatch[2]} ${articleMatch[1]}${articleMatch[3] ?? ''}`
    : cleaned;

  // O número do disco é lido do nome ORIGINAL: a limpeza de tags acima
  // removeu `(Disc 1)` junto com as demais.
  const discMatch = baseName.match(DISC_NUMBER);
  const title = discMatch ? `${withArticle} (Disco ${discMatch[1]})` : withArticle;

  return title || baseName;
};

export const findRegion = (baseName: string): string =>
  baseName.match(REGION_TAG)?.[1] ?? '';

export const removeInvalidFilenameCharacters = (name: string): string =>
  name.replace(INVALID_FILENAME_CHARACTERS, '');

export const replaceInvalidFilenameCharacters = (name: string): string =>
  name.replace(INVALID_FILENAME_CHARACTERS, '_');

/** Id estável de 12 caracteres hexadecimais, derivado do caminho. */
export const calculateGameId = (seed: string): string =>
  sha1Hex(seed).slice(0, GAME_ID_LENGTH);
