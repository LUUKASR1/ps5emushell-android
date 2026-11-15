#!/usr/bin/env node
/**
 * Prepara o projeto Android do Capacitor para o PS5 Emu Shell.
 *
 * Substitui os passos manuais do README (copiar Kotlin na mão, colar trechos
 * no manifesto, criar file_paths.xml). É idempotente: pode rodar quantas vezes
 * quiser, inclusive depois de `npx cap add android` de novo.
 *
 * Uso:  node scripts/setup-android.mjs
 *
 * Requisitos: `npm install` feito e `npx cap add android` já executado
 * (o script roda o cap add sozinho se a pasta não existir).
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID_DIR = path.join(ROOT, 'android');
const APP_DIR = path.join(ANDROID_DIR, 'app', 'src', 'main');
const PLUGIN_SRC = path.join(ROOT, 'android-plugin', 'src', 'main', 'java', 'com', 'ps5emushell', 'plugin');
const PLUGIN_DEST = path.join(APP_DIR, 'java', 'com', 'ps5emushell', 'plugin');

const log = (msg) => console.log(`[setup-android] ${msg}`);

// ─── 1. Projeto Android existe? ──────────────────────────────────────────────

if (!fs.existsSync(ANDROID_DIR)) {
  log('pasta android/ ausente — rodando `npx cap add android`');
  execFileSync('npx', ['cap', 'add', 'android'], { cwd: ROOT, stdio: 'inherit' });
}

// ─── 2. Copia os arquivos Kotlin ─────────────────────────────────────────────

if (!fs.existsSync(PLUGIN_SRC)) {
  console.error(`[setup-android] fonte do plugin não encontrada: ${PLUGIN_SRC}`);
  process.exit(1);
}

fs.mkdirSync(PLUGIN_DEST, { recursive: true });
const kotlinFiles = fs.readdirSync(PLUGIN_SRC).filter((name) => name.endsWith('.kt'));
for (const file of kotlinFiles) {
  fs.copyFileSync(path.join(PLUGIN_SRC, file), path.join(PLUGIN_DEST, file));
}
log(`${kotlinFiles.length} arquivos Kotlin copiados`);

// ─── 3. Manifesto ────────────────────────────────────────────────────────────

const manifestPath = path.join(APP_DIR, 'AndroidManifest.xml');
if (!fs.existsSync(manifestPath)) {
  console.error(`[setup-android] manifesto não encontrado: ${manifestPath}`);
  process.exit(1);
}

let manifest = fs.readFileSync(manifestPath, 'utf8');

const PERMISSIONS = [
  '<uses-permission android:name="android.permission.PACKAGE_USAGE_STATS" tools:ignore="ProtectedPermissions" />',
  '<uses-permission android:name="android.permission.KILL_BACKGROUND_PROCESSES" />',
  '<uses-permission android:name="android.permission.VIBRATE" />',
  '<uses-permission android:name="android.permission.WAKE_LOCK" />',
  '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
];

// Garante o namespace `tools`, exigido pelo tools:ignore acima.
if (!manifest.includes('xmlns:tools=')) {
  manifest = manifest.replace(
    /<manifest\b/,
    '<manifest xmlns:tools="http://schemas.android.com/tools"',
  );
}

// Permissões: insere antes de <application, sem duplicar.
const missingPermissions = PERMISSIONS.filter(
  (line) => !manifest.includes(line.split('android:name="')[1].split('"')[0]),
);
if (missingPermissions.length > 0) {
  manifest = manifest.replace(
    /(\s*)<application\b/,
    `${missingPermissions.map((line) => `\n    ${line}`).join('')}\n\n$1<application`,
  );
  log(`${missingPermissions.length} permissões adicionadas`);
}

// FileProvider: necessário para entregar a ROM ao emulador como content://
if (!manifest.includes('.fileprovider')) {
  const provider = `
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="\${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>
`;
  manifest = manifest.replace(/\s*<\/application>/, `${provider}\n    </application>`);
  log('FileProvider adicionado');
}

// A MainActivity é a nossa (Kotlin), não a gerada pelo Capacitor.
if (manifest.includes('android:name=".MainActivity"')) {
  manifest = manifest.replace(
    'android:name=".MainActivity"',
    'android:name="com.ps5emushell.plugin.MainActivity"',
  );
  log('MainActivity apontada para a versão Kotlin');
}

// Tela cheia imersiva em um handheld — evita rotação acidental no meio do jogo.
//
// A activity gerada pelo Capacitor já traz `configChanges` e `launchMode`.
// Adicionar de novo gera atributo duplicado e o manifesto vira XML inválido
// (foi exatamente o que aconteceu na primeira versão deste script), então
// cada atributo só entra se ainda não existir.
const ACTIVITY_PATTERN = /<activity\b[^>]*android:name="com\.ps5emushell\.plugin\.MainActivity"[^>]*>/s;
const activityMatch = manifest.match(ACTIVITY_PATTERN);

if (activityMatch) {
  const [tag] = activityMatch;
  const desired = [
    ['android:screenOrientation', 'android:screenOrientation="landscape"'],
    [
      'android:configChanges',
      'android:configChanges="orientation|screenSize|smallestScreenSize|screenLayout|keyboardHidden|keyboard|navigation|uiMode"',
    ],
  ];

  let updatedTag = tag;
  const added = [];
  for (const [attribute, declaration] of desired) {
    if (updatedTag.includes(attribute)) continue;
    updatedTag = updatedTag.replace(/\s*>$/, `\n            ${declaration}>`);
    added.push(attribute);
  }

  if (updatedTag !== tag) {
    manifest = manifest.replace(tag, updatedTag);
    log(`atributos da activity adicionados: ${added.join(', ')}`);
  }
}

fs.writeFileSync(manifestPath, manifest);

// ─── 4. file_paths.xml ───────────────────────────────────────────────────────

const xmlDir = path.join(APP_DIR, 'res', 'xml');
fs.mkdirSync(xmlDir, { recursive: true });
const filePathsSource = path.join(ROOT, 'android-plugin', 'file_paths.xml');
fs.copyFileSync(filePathsSource, path.join(xmlDir, 'file_paths.xml'));
log('res/xml/file_paths.xml copiado');

// ─── 5. Limpeza da MainActivity.java gerada ──────────────────────────────────

const generatedActivities = [
  path.join(APP_DIR, 'java', 'com', 'ps5emushell', 'launcher', 'MainActivity.java'),
  path.join(APP_DIR, 'java', 'com', 'ps5emushell', 'launcher', 'MainActivity.kt'),
];
for (const file of generatedActivities) {
  if (fs.existsSync(file)) {
    fs.rmSync(file);
    log(`removida MainActivity gerada: ${path.relative(ROOT, file)}`);
  }
}

log('pronto. Agora: cd android && ./gradlew assembleDebug');
