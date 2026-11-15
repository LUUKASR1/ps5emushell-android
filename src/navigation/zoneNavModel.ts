/**
 * Lógica pura do foco entre zonas.
 *
 * Separada de `zoneNav.ts` (que importa React) para poder ser testada em Node
 * sem ambiente de render — mesma razão pela qual os modelos de Home e
 * Biblioteca ficaram independentes das views.
 */

/** Move o índice de zona, travando nas pontas. */
export const moveZoneIndex = (current: number, delta: number, count: number): number => {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, current + delta));
};

/**
 * Decide o que fazer com um movimento vertical dentro de uma zona.
 *
 * Regra que o `useZoneNav` implementa:
 *   - handler existe e consome  -> fica na zona
 *   - handler devolve `false`   -> move de zona
 *   - não há handler            -> move de zona
 */
export const resolveVerticalMove = <Z extends string>({
  zones,
  current,
  delta,
  consumed,
}: {
  zones: readonly Z[];
  current: Z;
  delta: -1 | 1;
  consumed: boolean;
}): { zone: Z; atEdge: boolean } => {
  const index = zones.indexOf(current);
  if (consumed) return { zone: current, atEdge: false };

  const next = moveZoneIndex(index < 0 ? 0 : index, delta, zones.length);
  return { zone: zones[next] as Z, atEdge: next === index };
};
