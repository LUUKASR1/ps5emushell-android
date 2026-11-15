package com.ps5emushell.plugin

import android.app.ActivityManager
import android.app.usage.UsageStatsManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.content.FileProvider
import java.io.File

/**
 * Launches emulators through Android intents and tracks their lifecycle.
 *
 * Replaces src/main/emulators/runner.js:
 *
 *   spawn(exePath, args)      -> Intent + startActivity
 *   child.on('exit')          -> foreground-package polling (see isRunning)
 *   taskkill /PID /T /F       -> ActivityManager.killBackgroundProcesses
 *   shell.openPath fallback   -> ACTION_VIEW fallback
 *
 * Why foreground polling instead of a process handle: an app you start with an
 * Intent is not your child. There is no exit callback. The reliable,
 * permission-free signal is "is the emulator package still in the foreground",
 * which UsageStatsManager answers without QUERY_ALL_PACKAGES on most devices.
 */
class EmulatorLauncher(private val context: Context) {

    data class LaunchOutcome(val ok: Boolean, val error: String?, val packageName: String?)

    private val tracked = mutableSetOf<String>()

    // ─── Launch ───────────────────────────────────────────────────────────────

    /**
     * `emuId` chega do JS ora como id de preset ("nethersx2"), ora como id de
     * sistema ("ps2") — o store guarda o padrão do sistema quando o usuário
     * nunca escolheu emulador. Resolvemos os dois casos: id primeiro, e depois
     * o primeiro preset instalado que cobre aquele sistema.
     */
    private fun resolvePreset(emuId: String): EmulatorPresets.Preset? {
        EmulatorPresets.forId(emuId)?.let { return it }

        val candidates = EmulatorPresets.forSystem(emuId)
        if (candidates.isEmpty()) return null
        // Preferir um já instalado; se nenhum estiver, devolve o primeiro para
        // que a mensagem de erro cite o pacote correto.
        return candidates.firstOrNull { isInstalled(it.packageName) } ?: candidates.first()
    }

    fun launch(emuId: String, gamePath: String): LaunchOutcome {
        val preset = resolvePreset(emuId)
            ?: return LaunchOutcome(
                false,
                "Nenhum emulador mapeado para \"$emuId\"",
                null,
            )

        if (!isInstalled(preset.packageName)) {
            return LaunchOutcome(
                false,
                "${preset.displayName} is not installed (${preset.packageName})",
                null,
            )
        }

        val romFile = File(gamePath)
        if (!romFile.exists()) {
            return LaunchOutcome(false, "ROM not found: $gamePath", null)
        }

        return try {
            val intent = buildIntent(preset, romFile)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            tracked.add(preset.packageName)
            Log.i(TAG, "Launched ${preset.displayName} with ${romFile.name}")
            LaunchOutcome(true, null, preset.packageName)
        } catch (e: Exception) {
            Log.e(TAG, "Launch failed for $emuId", e)
            LaunchOutcome(false, e.message ?: "launch failed", null)
        }
    }

    private fun buildIntent(preset: EmulatorPresets.Preset, rom: File): Intent {
        val intent = Intent(Intent.ACTION_VIEW)

        if (preset.activity != null) {
            intent.component = ComponentName(preset.packageName, preset.activity)
        } else {
            intent.setPackage(preset.packageName)
        }

        val uri = uriFor(rom, preset.packageName)

        when (preset.romPassing) {
            EmulatorPresets.RomPassing.DATA_URI -> {
                intent.setDataAndType(uri, mimeFor(rom))
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }

            EmulatorPresets.RomPassing.EXTRA_PATH -> {
                // Emulators that read the raw path themselves cannot follow a
                // content:// URI, so pass the absolute path string.
                intent.putExtra(preset.pathExtra, rom.absolutePath)
                intent.setDataAndType(uri, mimeFor(rom))
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        }

        preset.extraExtras.forEach { (key, value) -> intent.putExtra(key, value) }
        return intent
    }

    /**
     * Apps target SDK 30+ cannot hand a bare file:// path to another package.
     * FileProvider turns it into content:// and the grant flag lets the emulator
     * actually open it.
     */
    private fun uriFor(rom: File, targetPackage: String): Uri = try {
        FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            rom,
        )
    } catch (e: Exception) {
        // Storage roots outside our FileProvider paths fall back to file://,
        // which still works on pre-scoped-storage emulators.
        Log.w(TAG, "FileProvider failed, falling back to file://", e)
        Uri.fromFile(rom)
    }

    private fun mimeFor(rom: File): String = when (rom.extension.lowercase()) {
        "iso", "bin", "cue", "chd", "cso", "gcm", "rvz" -> "application/octet-stream"
        "zip", "7z", "rar" -> "application/zip"
        "nsp", "xci" -> "application/octet-stream"
        else -> "application/octet-stream"
    }

    // ─── Detection ────────────────────────────────────────────────────────────

    fun isInstalled(packageName: String): Boolean = try {
        context.packageManager.getApplicationInfo(packageName, 0)
        true
    } catch (e: Exception) {
        false
    }

    fun isRunning(packageName: String): Boolean {
        if (packageName !in tracked) return false
        return foregroundPackage() == packageName
    }

    fun currentForeground(): String? = foregroundPackage()

    private fun foregroundPackage(): String? {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager

        // Cheap path first: our tracked package among running processes.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            @Suppress("DEPRECATION")
            am.runningAppProcesses?.firstOrNull { it.importance == 100 }
                ?.let { return it.pkgList.firstOrNull() }
        }

        // Modern path: query recent usage events.
        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
            ?: return null
        val now = System.currentTimeMillis()
        val events = usm.queryEvents(now - 10_000, now) ?: return null
        var last: String? = null
        val event = android.app.usage.UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType == android.app.usage.UsageEvents.Event.ACTIVITY_RESUMED ||
                event.eventType == android.app.usage.UsageEvents.Event.MOVE_TO_FOREGROUND
            ) {
                last = event.packageName
            }
        }
        return last
    }

    // ─── Exit ─────────────────────────────────────────────────────────────────

    fun exit(packageName: String): Boolean = try {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        am.killBackgroundProcesses(packageName)
        tracked.remove(packageName)
        true
    } catch (e: Exception) {
        Log.e(TAG, "exit failed for $packageName", e)
        false
    }

    private companion object {
        const val TAG = "EmulatorLauncher"
    }
}
