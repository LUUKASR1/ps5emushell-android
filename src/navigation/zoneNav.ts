/**
 * Foco entre zonas — versão reduzida de `navigation/spatial-navigation.js`.
 *
 * O original calculava o próximo elemento por geometria (getBoundingClientRect)
 * e mantinha uma pilha de foco de tela inteira. Para o launcher, o modelo que
 * resolve o caso real é mais simples e determinístico: a tela é uma lista
 * vertical de zonas (chips → fileira → ações do hero, por exemplo); cima/baixo
 * troca de zona e esquerda/direita/confirma são delegados à zona ativa.
 *
 * Ganhos em relação à geometria: funciona com layout que o navegador ainda não
 * mediu, é testável isoladamente e não depende de ordem de render.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useControllerNav } from '../hooks/useControllerNav';
import type { ControllerNavHandlers } from '../hooks/useControllerNav';
import { resolveVerticalMove } from './zoneNavModel';

export { moveZoneIndex, resolveVerticalMove } from './zoneNavModel';

// ─── Tipos ────────────────────────────────────────────────────────────────────

/**
 * Handlers de uma zona.
 *
 * `onUp`/`onDown` podem devolver `false` para indicar "não consumi este
 * movimento" — nesse caso o foco muda de zona. Sem isso, uma zona com lista
 * vertical própria (filtros, por exemplo) prenderia o foco para sempre.
 */
export interface ZoneHandlers {
  onLeft?: () => void;
  onRight?: () => void;
  onUp?: () => boolean | void;
  onDown?: () => boolean | void;
  onConfirm?: () => void;
}

export interface ZoneNavOptions<Z extends string> {
  /** Zonas na ordem vertical da tela. */
  zones: readonly Z[];
  initial: Z;
  /** Handlers por zona, para horizontal e confirmação. */
  handlers: Partial<Record<Z, ZoneHandlers>>;
  /** Handlers que valem em qualquer zona. */
  global?: Omit<ControllerNavHandlers, 'onLeft' | 'onRight' | 'onUp' | 'onDown' | 'onConfirm'>;
  /** Chamado quando cima/baixo tenta sair da lista de zonas. */
  onExitTop?: () => void;
  onExitBottom?: () => void;
}

export interface ZoneNavResult<Z extends string> {
  zone: Z;
  setZone: (zone: Z) => void;
  isZone: (zone: Z) => boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useZoneNav<Z extends string>({
  zones,
  initial,
  handlers,
  global,
  onExitTop,
  onExitBottom,
}: ZoneNavOptions<Z>): ZoneNavResult<Z> {
  const [zone, setZone] = useState<Z>(initial);

  // Mantém referências estáveis para não reinstalar o listener a cada render.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const globalRef = useRef(global);
  globalRef.current = global;
  const zonesRef = useRef(zones);
  zonesRef.current = zones;

  // Se a zona atual sumir (mudança de layout), volta para a inicial.
  useEffect(() => {
    if (!zones.includes(zone)) setZone(initial);
  }, [zones, zone, initial]);

  const step = useCallback(
    (delta: -1 | 1, consumed: boolean) => {
      const result = resolveVerticalMove({
        zones: zonesRef.current,
        current: zone,
        delta,
        consumed,
      });

      if (result.atEdge) {
        // Já está na ponta: deixa a tela decidir (ex.: sair para a topbar).
        if (delta < 0) onExitTop?.();
        else onExitBottom?.();
        return;
      }
      setZone(result.zone);
    },
    [zone, onExitTop, onExitBottom],
  );

  useControllerNav({
    onUp: () => {
      const active = handlersRef.current[zone]?.onUp;
      // `false` explícito = a zona não consumiu, então o foco muda de zona.
      step(-1, Boolean(active && active() !== false));
    },
    onDown: () => {
      const active = handlersRef.current[zone]?.onDown;
      step(1, Boolean(active && active() !== false));
    },
    onLeft: () => handlersRef.current[zone]?.onLeft?.(),
    onRight: () => handlersRef.current[zone]?.onRight?.(),
    onConfirm: () => handlersRef.current[zone]?.onConfirm?.(),
    onBack: () => globalRef.current?.onBack?.(),
    onL1: () => globalRef.current?.onL1?.(),
    onR1: () => globalRef.current?.onR1?.(),
    onOptions: () => globalRef.current?.onOptions?.(),
    onSearch: () => globalRef.current?.onSearch?.(),
    onHome: () => globalRef.current?.onHome?.(),
  });

  const isZone = useCallback((candidate: Z) => candidate === zone, [zone]);

  return { zone, setZone, isZone };
}
