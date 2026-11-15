import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ps5emushell.launcher',
  appName: 'PS5 Emu Shell',
  webDir: 'dist',
  android: {
    // O launcher depende de navegação por controle: desligar o gesto de
    // "voltar" por swipe evita sair do app sem querer durante o jogo.
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
