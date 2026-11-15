/**
 * TrophiesView — estado honesto.
 *
 * Os troféus vêm do RetroAchievements, que neste port ainda não foi
 * implementado. O subsistema do original tem três partes:
 *
 *   1. Web API (login, lista de conquistas, progresso por jogo)
 *   2. Cache local para não bater na API a cada abertura
 *   3. Script de login por emulador (DuckStation, PPSSPP, etc.), que escreve
 *      token/config no formato de cada um — isso no Android depende de alcançar
 *      os diretórios privados de OUTROS apps, o que o sandbox do Android
 *      bloqueia sem root.
 *
 * O item 3 é o bloqueio real: no Windows o launcher editava o INI do emulador
 * diretamente. No Android cada emulador guarda a configuração na própria área
 * privada, inacessível. Sem root, o login teria que ser feito manualmente pelo
 * usuário dentro do emulador.
 *
 * Até isso ser resolvido, esta tela mostra o estado em vez de exibir uma lista
 * vazia que pareceria um bug.
 */

import { useShellStore } from '../../store/shellStore';

export function TrophiesView() {
  const stats = useShellStore((state) => state.stats);
  const games = useShellStore((state) => state.games);
  const setView = useShellStore((state) => state.setView);

  const favorites = Object.values(stats).filter((entry) => entry.favorite).length;
  const played = Object.values(stats).filter((entry) => entry.playTime > 0).length;

  return (
    <section className="view view-trophies">
      <div className="tr-placeholder">
        <h1>Troféus</h1>
        <p className="tr-status">RetroAchievements ainda não integrado neste port.</p>

        <div className="tr-stats">
          <div className="tr-stat">
            <span className="tr-value">{games.length}</span>
            <span className="tr-label">jogos</span>
          </div>
          <div className="tr-stat">
            <span className="tr-value">{played}</span>
            <span className="tr-label">já jogados</span>
          </div>
          <div className="tr-stat">
            <span className="tr-value">{favorites}</span>
            <span className="tr-label">favoritos</span>
          </div>
        </div>

        <p className="tr-hint">
          No launcher de PC, o login no RetroAchievements era gravado direto na
          configuração de cada emulador. No Android essas pastas pertencem a
          outros apps e não são acessíveis sem root — então esse login precisa
          ser feito manualmente dentro de cada emulador.
        </p>

        <button className="btn-pill" onClick={() => setView('settings')}>
          Abrir configurações
        </button>
      </div>
    </section>
  );
}
