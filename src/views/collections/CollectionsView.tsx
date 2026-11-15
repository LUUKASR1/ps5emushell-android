/**
 * CollectionsView — agrupamento de jogos por nome.
 *
 * Porte de `views/collections/`. O original tinha fluxo de seletor de jogos com
 * prévia de correspondência; aqui ficou o essencial: criar, abrir, incluir por
 * correspondência de nome e remover jogos.
 *
 * Coleções são salvas em `collections.json`, no mesmo formato do launcher de PC.
 */

import { useMemo, useState } from 'react';
import { useZoneNav } from '../../navigation/zoneNav';
import { useShellStore } from '../../store/shellStore';
import type { Collection } from '../../store/types';
import {
  buildCollection,
  findNameMatches,
  formatCollectionCount,
  formatGameCount,
  formatSystemNames,
  listCollectionGames,
  listMosaicCovers,
  mergePickedGameIds,
  withGameToggled,
} from './collectionModel';

export function CollectionsView() {
  const collections = useShellStore((state) => state.collections);
  const games = useShellStore((state) => state.games);
  const gamesById = useShellStore((state) => state.gamesById);
  const config = useShellStore((state) => state.config);
  const setCollections = useShellStore((state) => state.setCollections);

  const [openId, setOpenId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const shortNameOf = (systemId: string): string | undefined =>
    config?.systems.find((system) => system.id === systemId)?.shortName;

  const open = collections.find((collection) => collection.id === openId) ?? null;
  const openGames = useMemo(
    () => listCollectionGames(gamesById, open),
    [gamesById, open],
  );

  // ─── Ações ─────────────────────────────────────────────────────────────────

  const create = () => {
    const name = newName.trim();
    if (!name) return;

    // Já cria com os jogos cujo título casa com o nome — mesmo comportamento
    // do original, que sugeria as correspondências ao criar.
    const draft = buildCollection({ name, gameIds: [], now: Date.now() });
    const matches = findNameMatches(games, draft);
    const withMatches = {
      ...draft,
      games: mergePickedGameIds([], new Set(matches.map((game) => game.id))),
    };

    setCollections([...collections, withMatches]);
    setNewName('');
    setCreating(false);
  };

  const update = (next: Collection) => {
    setCollections(collections.map((entry) => (entry.id === next.id ? next : entry)));
  };

  const remove = (id: string) => {
    setCollections(collections.filter((entry) => entry.id !== id));
    if (openId === id) setOpenId(null);
  };

  const removeGameFromOpen = (gameId: string) => {
    if (!open) return;
    update(withGameToggled(open, gameId, false));
  };

  const addMatchesToOpen = () => {
    if (!open) return;
    const matches = findNameMatches(games, open);
    if (matches.length === 0) return;
    update({
      ...open,
      games: mergePickedGameIds(
        open.games,
        new Set([...open.games, ...matches.map((game) => game.id)]),
      ),
    });
  };

  // ─── Navegação ─────────────────────────────────────────────────────────────

  const { zone } = useZoneNav<'list' | 'content'>({
    zones: ['list', 'content'],
    initial: 'list',
    handlers: {
      list: {
        onUp: () => {
          if (index <= 0) return false;
          setIndex(index - 1);
          return true;
        },
        onDown: () => {
          if (index >= collections.length - 1) return false;
          setIndex(index + 1);
          return true;
        },
        onConfirm: () => {
          const target = collections[index];
          if (target) setOpenId(target.id === openId ? null : target.id);
        },
      },
    },
    global: {
      onBack: () => (openId ? setOpenId(null) : undefined),
    },
  });

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <section className="view view-collections">
      <div className="coll-head">
        <div className="coll-title">
          <h2>{open ? open.name : 'Coleções'}</h2>
          <span className="coll-count">
            {open ? formatGameCount(openGames.length) : formatCollectionCount(collections.length)}
          </span>
        </div>

        <div className="coll-tools">
          {creating ? (
            <>
              <input
                className="lib-search"
                autoFocus
                placeholder="Nome da coleção"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') create();
                  if (event.key === 'Escape') setCreating(false);
                }}
              />
              <button className="btn-pill active" onClick={create}>
                Criar
              </button>
            </>
          ) : (
            <button className="btn-pill" onClick={() => setCreating(true)}>
              + Nova coleção
            </button>
          )}
        </div>
      </div>

      {open ? (
        <div className="coll-body">
          <div className="coll-actions">
            <button className="btn-pill" onClick={addMatchesToOpen}>
              Incluir jogos com “{open.name}”
            </button>
            <button className="btn-pill" onClick={() => remove(open.id)}>
              Excluir coleção
            </button>
            <button className="btn-pill" onClick={() => setOpenId(null)}>
              Voltar
            </button>
          </div>

          {openGames.length === 0 ? (
            <p className="coll-empty">Nenhum jogo nesta coleção ainda.</p>
          ) : (
            <div className="coll-games">
              {openGames.map((game) => (
                <div key={game.id} className="coll-game">
                  <span className="cg-title">{game.title}</span>
                  <span className="cg-sys">{shortNameOf(game.system) ?? game.system}</span>
                  <button className="cg-remove" onClick={() => removeGameFromOpen(game.id)}>
                    Remover
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : collections.length === 0 ? (
        <p className="coll-empty">
          Nenhuma coleção ainda. Crie uma para agrupar jogos de uma série.
        </p>
      ) : (
        <div className={`coll-grid ${zone === 'list' ? 'zone-focused' : ''}`}>
          {collections.map((collection, position) => {
            const collectionGames = listCollectionGames(gamesById, collection);
            const covers = listMosaicCovers(collectionGames, true);

            return (
              <button
                key={collection.id}
                className={`coll-card ${position === index ? 'sel' : ''}`}
                onClick={() => {
                  setIndex(position);
                  setOpenId(collection.id);
                }}
              >
                <div className="coll-cover">
                  {covers.length > 0 ? (
                    covers.map((cover) => (
                      <img key={cover} src={cover} alt="" className="coll-cover-part" />
                    ))
                  ) : (
                    <span className="coll-cover-empty">{collection.name.slice(0, 2)}</span>
                  )}
                </div>
                <span className="coll-name">{collection.name}</span>
                <span className="coll-sub">
                  {formatGameCount(collectionGames.length)}
                  {collectionGames.length > 0 &&
                    ` · ${formatSystemNames(collectionGames, shortNameOf)}`}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
