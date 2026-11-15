# PS5 Emu Shell — Port para Android (AYN Odin 2 Portal)

Port do launcher **PS5 Emu Shell 0.10.0** (Electron/Windows) para Android, alvo primário AYN Odin 2 Portal (Snapdragon 8 Gen 2, Android 13+).

O projeto original é MIT. Este port reusa a arquitetura e a lógica do renderer, substituindo os sete subsistemas exclusivos de Windows por equivalentes Android.

---

## Estado atual

### Pronto

| Camada | Arquivo | Situação |
|---|---|---|
| Contratos de plataforma | `src/platform/types.ts` | Completo |
| Adaptadores web (dev) | `src/platform/web-adapters.ts` | Completo |
| Adaptadores Android (TS) | `src/platform/android-adapters.ts` | Completo |
| Contexto React + hooks | `src/platform/PlatformProvider.tsx` | Completo |
| Store (Zustand) + persistência | `src/store/shellStore.ts` | Completo |
| Shell / roteamento | `src/App.tsx` | Completo |
| Home (fileira + hero) | `src/views/home/` | Completo, testado |
| Biblioteca (grade + filtros) | `src/views/library/` | Completo, testado |
| Coleções | `src/views/collections/` | Completo, testado |
| Configurações | `src/views/settings/SettingsView.tsx` | Completo |
| Troféus | `src/views/trophies/TrophiesView.tsx` | Estado honesto (ver abaixo) |
| Navegação por controle | `src/hooks/useControllerNav.ts` | Completo |
| Foco entre zonas | `src/navigation/` | Completo, testado |
| Scanner de ROMs | `src/library/scanner.ts` | Completo, testado |
| Títulos, região e id | `src/library/romTitles.ts` + `sha1.ts` | Completo, testado |
| Persistência JSON | `src/library/storage.ts` + `jsonFile.ts` | Completo, testado |
| Plugin nativo Capacitor | `android-plugin/` (9 arquivos Kotlin) | Completo |

### Falta portar

- **RetroAchievements** — ver a seção de bloqueios abaixo. A tela de Troféus
  explica o estado em vez de exibir uma lista vazia.
- **Capas** — download e cache (`cover-downloads.js`, `cover-matching.js`).
  O scanner já deixa `cover: null` e a UI cai no placeholder com o título.
- **Teclado virtual** — `virtual-keyboard.js`. Os campos de busca e de caminho
  usam `<input>` do sistema como paliativo.
- **Instalação de emuladores** pelo launcher e **atalhos/otimização** nas
  Configurações.

### Verificação

`npm test` roda 66 testes:

- **Portados do original** (mesmas asserções): `home-row.test.js`,
  `library-filters.test.js`, `rom-titles.test.js` e `collection-rules.test.js`.
- **Novos**: navegação em grade, foco entre zonas, e o scanner com sistema de
  arquivos falso. No original essas regras viviam no DOM ou em `node:fs` e não
  tinham teste possível.
- **SHA-1 verificado contra `node:crypto`** em 11 entradas, incluindo limites de
  padding e UTF-8. Isso garante que o id de um jogo é idêntico ao do launcher de
  PC — pré-requisito para migrar a biblioteca sem perder histórico.

O que **não** está verificado: checagem de tipos (`npm run typecheck`), o JSX, e
a compilação do Kotlin. Os três dependem de `npm install` e do Android SDK, que
este ambiente não tem. Rode isso na sua máquina antes de confiar no build.

---

## Como obter o APK

**Não há APK pronto neste repositório** — ele precisa ser compilado, porque
envolve React + Capacitor + Kotlin + Gradle. Há dois caminhos, e o primeiro não
exige instalar nada.

### Opção A — compilar na nuvem (não instala nada)

O workflow em `.github/workflows/build-apk.yml` compila o APK no GitHub e o
entrega como artefato para download.

1. Crie um repositório no GitHub e envie esta pasta:

   ```bash
   git init
   git add .
   git commit -m "PS5 Emu Shell Android"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/ps5emushell-android.git
   git push -u origin main
   ```

2. Abra a aba **Actions** do repositório. O build começa sozinho no push.
3. Quando terminar (leva ~5 min), abra a execução e baixe o artefato
   **ps5emushell-android-debug** — dentro dele está o `.apk`.
4. Copie o `.apk` para o Odin 2 Portal e instale (veja “Instalar no aparelho”).

### Opção B — compilar na sua máquina

Pré-requisitos: **Node 20+**, **JDK 17** e **Android SDK** (o mais fácil é
instalar o [Android Studio](https://developer.android.com/studio), que já traz
o SDK e o JDK corretos).

```bash
npm install
npm run android:apk
```

O APK sai em `android/app/build/outputs/apk/debug/app-debug.apk`.

O script `android:apk` faz tudo: build web, criação do projeto Android, cópia do
plugin Kotlin, ajuste do manifesto (permissões, FileProvider, MainActivity,
orientação) e compilação. Não é preciso editar nada à mão.

> Se você já tem a pasta `android/` e só mudou código web, use
> `npm run build && npx cap sync android && cd android && ./gradlew assembleDebug`.

### Instalar no aparelho

1. No Odin 2 Portal: **Configurações › Sobre › Informações do dispositivo** e
   toque 7 vezes em **Número da versão** para liberar as opções de desenvolvedor.
2. **Configurações › Sistema › Opções de desenvolvedor** › ative **Depuração USB**.
3. Copie o `.apk` para o aparelho (cabo USB, cartão SD ou `adb install app-debug.apk`).
4. Abra o arquivo pelo gerenciador de arquivos e confirme a instalação
   (vai pedir para permitir instalação de fontes desconhecidas).
5. Ao abrir o app pela primeira vez, conceda acesso aos arquivos quando pedir, e
   depois habilite **Acesso ao uso** em Configurações do Android — sem isso o
   launcher não detecta quando o emulador fecha.

> O APK de debug é assinado com a chave de debug do Gradle. Instala por sideload
> sem problema; só não serve para publicar na Play Store.

## Estrutura do build

| Arquivo | Função |
|---|---|
| `scripts/setup-android.mjs` | Prepara o projeto Android: copia o Kotlin, injeta permissões e FileProvider no manifesto, aponta a MainActivity, cria `file_paths.xml` |
| `.github/workflows/build-apk.yml` | Compila o APK no GitHub Actions e publica como artefato |
| `capacitor.config.ts` | appId, nome e configuração do WebView |

## Decisões de arquitetura

### Por que Capacitor e não Electron

Electron não tem suporte oficial a Android. O renderer original é JavaScript vanilla/DOM puro, sem dependência de APIs do Electron nas views — então roda direto em WebView. O Capacitor dá o casco Android, o acesso a APIs nativas por plugin e mantém o mesmo bundle rodando no navegador para desenvolvimento.

### Por que a camada de adaptadores

O original tinha `battery.js`, `perf-monitor.js`, `processes.js`, `optimize.js`, `runner.js` chamando diretamente `koffi`/`kernel32`/PowerShell. Sem uma camada de abstração, cada um desses arquivos precisaria de `if (isWindows)` espalhado. Com os contratos em `types.ts`, cada subsistema tem duas implementações e o resto do app não sabe em qual está rodando.

### Mapa de substituição

| Original (Windows) | Port (Android) |
|---|---|
| `koffi` → `xinput1_4.dll` | `GamepadReader` + `dispatchKeyEvent`/`dispatchGenericMotionEvent` |
| `node-hid` → DualSense USB | Pendente — prioridade baixa (controle embutido cobre o caso principal) |
| `kernel32!GetSystemPowerStatus` | `BatteryManager` via broadcast sticky |
| PowerShell `Get-Counter` | `/proc/stat`, `/proc/meminfo`, sysfs Adreno |
| `tasklist.exe` | `/proc/[pid]/status` (só processos próprios) |
| `spawn()` do `.exe` | `Intent` + `startActivity` |
| `taskkill /PID /T /F` | `ActivityManager.killBackgroundProcesses` |
| `K32EmptyWorkingSet` | No-op — o LMK do Android já gerencia |

### Limitações que não têm contorno sem root

**Processos de terceiros são invisíveis.** Desde o Android 7 o `/proc` é montado com `hidepid`: um app só lê metadados dos próprios processos. A estratégia do original — "listar todo processo cujo executável está nesta pasta" — não é reproduzível. Por isso o rastreio de sessão de jogo usa `UsageStatsManager` para saber se o pacote do emulador ainda está em primeiro plano, em vez de um handle de processo. Isso exige a permissão `PACKAGE_USAGE_STATS`, que o usuário habilita manualmente em Configurações do Android.

**Otimização de RAM é no-op deliberado.** O Android já reclama memória sozinho e proíbe encerrar outros pacotes. A tela de otimização existe para manter a UI coerente, mas não promete o que não pode entregar.

**`killBackgroundProcesses` não é `taskkill`.** Ele não mata de forma garantida; o sistema pode manter o processo vivo. Na prática encerra a maioria dos emuladores, mas o combo Create+Options pode precisar de mais de uma tentativa.

### Especificidades do Odin 2 Portal tratadas

- Sticks Hall effect reportam faixa mais larga que o padrão XInput de ±32767 — a normalização usa `getMotionRange()` do próprio device, não um valor fixo.
- Botões traseiros L4/R4 chegam como `KEYCODE_BUTTON_1`/`BUTTON_2`.
- Gatilhos analógicos podem vir como eixo (`AXIS_LTRIGGER`) ou tecla conforme o firmware; os dois caminhos preenchem o mesmo valor `lt`/`rt`.
- Barras de sistema escondidas em modo imersivo sticky, reaplicado em `onWindowFocusChanged`.

---

## Presets de emulador suportados

RetroArch (normal e AArch64), Dolphin, PPSSPP (normal e Gold), NetherSX2, DuckStation, melonDS, Azahar, Flycast, mGBA, Snes9x EX+, Yuzu/Sudachi, Winlator.

Editar `EmulatorPresets.kt` para adicionar outros — cada preset é um `data class` com pacote, activity e como o caminho da ROM é passado.

---

## Bloqueios que não têm contorno sem root

Três coisas do launcher original não são reproduzíveis no Android sem root. Não
são bugs nem falta de tempo — são limites da plataforma, e é melhor saber deles
antes de prometer a funcionalidade:

**Processos de terceiros são invisíveis.** Desde o Android 7, `/proc` é montado com
`hidepid`: um app só lê metadados dos próprios processos. A estratégia do original
de "listar todo processo cujo executável está nesta pasta" não existe no Android.
O rastreio de sessão usa `UsageStatsManager` para saber se o emulador ainda está
em primeiro plano — o que exige `PACKAGE_USAGE_STATS`, habilitada manualmente pelo
usuário nas configurações do sistema.

**Login no RetroAchievements não pode ser automatizado.** No Windows o launcher
editava o INI do DuckStation, o config do PPSSPP e afins. No Android cada emulador
guarda a configuração na própria área privada, inacessível a outros apps. O login
precisa ser feito manualmente dentro de cada emulador. A API em si (listar
conquistas, progresso) é viável; o que não é é o "login automático".

**Otimização de RAM é no-op deliberado.** O low-memory killer do Android já
gerencia memória, e encerrar pacotes alheios é proibido para apps comuns.
A tela existe para a UI não ficar incoerente, mas não finge fazer o que não pode.

`killBackgroundProcesses`, usado para fechar o emulador, também não é `taskkill`:
não garante o encerramento. Na prática funciona com a maioria dos emuladores, mas
o combo Create+Options pode precisar de mais de uma tentativa.
