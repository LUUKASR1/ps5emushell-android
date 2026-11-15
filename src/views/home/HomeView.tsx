/**
 * HomeView — fileira de jogos estilo PS5.
 *
 * Porte de `views/home/home-view.js`. A diferença principal é que o original
 * posicionava tiles imperativamente (createElement + style.transform a cada
 * frame de navegação). Aqui o mesmo cálculo é feito em render, usando as
 * funções puras de `homeRowModel.ts` — resultado idêntico, sem manipulação
 * manual do DOM.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useZoneNav } from '../../navigation/zoneNav';
import { usePlatform } from '../../platform';
import { useShellStore } from '../../store/shellStore';
import type { Game } from '../../store/types';
import {
  ALL_FILTER,
  DEFAULT_TILE_SIZE_PX,
  DIMMED_TILE_OPACITY,
  FOCUSED_TILE_SCALE,
  LIBRARY_ITEM_KEY,
  TILE_GAP_PX,
  UNFOCUSED_TILE_SCALE,
  buildHomeChips,
  buildHomeItems,
  calculateCycledValue,
  calculateTileOffset,
  calculateVisibleRange,
  findItemIndex,
  resolveActiveFilter,
} from './homeRowModel';
import type { HomeItem } from './homeRowModel';

export function HomeView() {
  const games = useShellStore((state) => state.games);
  const stats = useShellStore((state) => state.stats);
  const config = useShellStore((state) => state.config);
  const setView = useShellStore((state) => state.setView);
  const toggleFavorite = useShellStore((state) => state.toggleFavorite);
  const setLaunching = useShellStore((state) => state.setLaunching);
  const launcher = usePlatform().adapters.launcher;

  const [filter, setFilter] = useState<string>(ALL_FILTER);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [actionIndex, setActionIndex] = useState(0);
  const [rowWidth, setRowWidth] = useState(0);
  const [tileSize, setTileSize] = useState(DEFAULT_TILE_SIZE_PX);

  const rowRef = useRef<HTMLDivElement>(null);

  const systems = config?.systems ?? [];

  // ─── Dados derivados ───────────────────────────────────────────────────────

  const items = useMemo(
    () => buildHomeItems({ games, filter, gameStats: stats }),
    [games, filter, stats],
  );

  const chips = useMemo(() => buildHomeChips({ games, systems }), [games, systems]);

  // Se o filtro ativo deixar de existir (jogos removidos), volta para "Todos".
  useEffect(() => {
    const next = resolveActiveFilter(filter, games);
    if (next !== filter) setFilter(next);
  }, [games, filter]);

  // Mantém a seleção dentro da faixa quando a lista encolhe.
  useEffect(() => {
    if (selectedIndex > items.length - 1) {
      setSelectedIndex(Math.max(0, items.length - 1));
    }
  }, [items.length, selectedIndex]);

  // ─── Medidas ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const element = rowRef.current;
    if (!element) return;

    const measure = () => {
      setRowWidth(element.clientWidth);
      const cssTile = getComputedStyle(document.documentElement).getPropertyValue('--tile-size');
      const parsed = Number.parseFloat(cssTile);
      setTileSize(Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TILE_SIZE_PX);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // ─── Item atual ────────────────────────────────────────────────────────────

  const currentItem = items[selectedIndex];
  const currentGame = currentItem?.kind === 'game' ? currentItem.game : null;

  // ─── Navegação ─────────────────────────────────────────────────────────────

  // O original guardava `selectedKeyByFilter` para que trocar de console e
  // voltar devolvesse o usuário ao mesmo jogo, não ao primeiro da lista.
  const selectedKeyByFilter = useRef<Record<string, string>>({});
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const selectItem = useCallback(
    (index: number) => {
      if (!items.length) return;
      if (index < 0 || index > items.length - 1) return;
      setSelectedIndex(index);
      const item = items[index];
      if (item) selectedKeyByFilter.current[filter] = item.key;
    },
    [items, filter],
  );

  // Ao trocar de filtro, restaura a posição lembrada (se ainda existir).
  useEffect(() => {
    const remembered = selectedKeyByFilter.current[filter];
    setSelectedIndex(remembered ? findItemIndex(itemsRef.current, remembered) : 0);
  }, [filter]);

  const cycleFilter = useCallback(
    (step: number) => {
      const ids = chips.map((chip) => chip.id);
      if (ids.length < 2) return;
      // A restauração do índice é feita pelo efeito de troca de filtro.
      setFilter(calculateCycledValue(ids, filter, step));
    },
    [chips, filter],
  );

  const activate = useCallback(() => {
    const item = items[selectedIndex];
    if (!item) return;

    if (item.kind === 'library') {
      setView('library');
      return;
    }

    const game = item.game;
    setLaunching(true, game.id);
    const result = launcher.startGame({
      game,
      onExit: () => {
        useShellStore.getState().setGameRunning(false);
      },
    });

    if (!result.ok) {
      setLaunching(false);
      console.warn('[home] falha ao iniciar:', result.error);
    }
  }, [items, selectedIndex, setView, setLaunching, launcher]);

  // Zona ativa entre chips / fileira / ações do hero.
  const { zone } = useZoneNav<'chips' | 'row' | 'actions'>({
    zones: ['chips', 'row', 'actions'],
    initial: 'row',
    handlers: {
      chips: {
        onLeft: () => cycleFilter(-1),
        onRight: () => cycleFilter(1),
        onConfirm: activate,
      },
      row: {
        onLeft: () => selectItem(selectedIndex - 1),
        onRight: () => selectItem(selectedIndex + 1),
        onConfirm: activate,
      },
      actions: {
        onLeft: () => setActionIndex((index) => Math.max(0, index - 1)),
        onRight: () => setActionIndex((index) => Math.min(1, index + 1)),
        onConfirm: () => {
          if (actionIndex === 0) activate();
          else if (currentGame) toggleFavorite(currentGame.id);
        },
      },
    },
    global: {
      // L1/R1 trocam o console — mapeamento do original, não círculo.
      onL1: () => cycleFilter(-1),
      onR1: () => cycleFilter(1),
      onOptions: () => setView('settings'),
      onSearch: () => setView('library'),
      onHome: () => {
        setFilter(ALL_FILTER);
        setSelectedIndex(0);
        setView('home');
      },
    },
  });

  // ─── Layout da fileira ─────────────────────────────────────────────────────

  const stride = tileSize + TILE_GAP_PX;

  // Quando a fileira perde o foco (outra zona assume), o tile selecionado
  // encolhe de 1.6 para 1.3 — mesma regra do home-view.js original.
  const rowFocused = zone === 'row';
  const selectedScale = rowFocused ? FOCUSED_TILE_SCALE : UNFOCUSED_TILE_SCALE;
  const selectedSize = tileSize * selectedScale;

  const range = calculateVisibleRange({
    selectedIndex,
    itemCount: items.length,
    rowWidth: rowWidth || 1200,
    stride,
  });

  const visibleItems = items.slice(range.from, range.to + 1);

  // ─── Vazio ─────────────────────────────────────────────────────────────────

  if (games.length === 0) {
    return (
      <section className="view view-home is-empty">
        <div className="home-empty">
          <h1>Nenhum jogo encontrado</h1>
          <p>
            Coloque suas ROMs nas pastas configuradas (por exemplo <code>roms/ps2</code>) e
            busque novamente.
          </p>
          <div className="empty-actions">
            <button className="btn-play" onClick={() => setView('settings')}>
              Configurações
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="view view-home">
      <div className={`chips ${zone === 'chips' ? 'zone-focused' : ''}`}>
        {chips.map((chip) => (
          <button
            key={chip.id}
            className={`chip ${chip.id === filter ? 'active' : ''}`}
            onClick={() => setFilter(chip.id)}
          >
            {chip.shortName}
            <span className="count">{chip.count}</span>
          </button>
        ))}
      </div>

      <div className="row-wrap">
        <div className="row" ref={rowRef}>
          <div className="row-track">
            {visibleItems.map((item, offset) => {
              const index = range.from + offset;
              const isSelected = index === selectedIndex;
              // Só o tile selecionado cresce; os demais ficam em escala 1.
              // `calculateTileOffset` já reserva o espaço extra à direita, então
              // a origem do transform é à esquerda — com origem central os tiles
              // se sobreporiam.
              const scale = isSelected ? selectedScale : 1;
              const x = calculateTileOffset({
                index,
                selectedIndex,
                stride,
                selectedSize,
                tileSize,
              });

              return (
                <div
                  key={item.key}
                  className={`tile ${isSelected ? 'sel' : ''}`}
                  style={{
                    width: tileSize,
                    height: tileSize,
                    transform: `translate3d(${x}px, 0, 0) scale(${scale})`,
                    opacity: index < selectedIndex ? DIMMED_TILE_OPACITY : 1,
                    transformOrigin: 'left center',
                  }}
                  onClick={() => (isSelected ? activate() : selectItem(index))}
                >
                  {item.kind === 'library' ? (
                    <div className="tile-library">
                      <span>Biblioteca</span>
                    </div>
                  ) : (
                    <TileContent game={item.game} />
                  )}
                </div>
              );
            })}
          </div>

          <div className="row-label" style={{ transform: `translate(${selectedSize + 22}px, ${tileSize + 18}px)` }}>
            {currentItem && (
              <>
                <span className="rl-badge">
                  {currentGame ? systems.find((s) => s.id === currentGame.system)?.shortName ?? '' : ''}
                </span>
                <span className="rl-title">
                  {currentGame ? currentGame.title : 'Biblioteca de jogos'}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="hero">
        {currentGame ? (
          <>
            <div className="hero-meta">
              {stats[currentGame.id]?.favorite && <span className="star">★ Favorito</span>}
              {currentGame.region && <span>{currentGame.region}</span>}
            </div>
            <div className="hero-actions">
              <button
                className={`btn-play ${zone === 'actions' && actionIndex === 0 ? 'nav-focus' : ''}`}
                onClick={activate}
              >
                Jogar
              </button>
              <button
                className={`btn-round ${stats[currentGame.id]?.favorite ? 'on' : ''} ${
                  zone === 'actions' && actionIndex === 1 ? 'nav-focus' : ''
                }`}
                onClick={() => toggleFavorite(currentGame.id)}
                title="Favoritar"
              >
                {stats[currentGame.id]?.favorite ? '★' : '☆'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="hero-meta">
              <span>{games.length} jogos instalados</span>
            </div>
            <div className="hero-actions">
              <button className="btn-play" onClick={() => setView('library')}>
                Abrir
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ─── Tile ─────────────────────────────────────────────────────────────────────

function TileContent({ game }: { game: Game }) {
  if (game.cover) {
    return <img src={game.cover} alt="" className="tile-cover" draggable={false} />;
  }
  return (
    <div className="tile-placeholder">
      <span className="tile-title">{game.title}</span>
    </div>
  );
}

export { LIBRARY_ITEM_KEY };
export type { HomeItem };
