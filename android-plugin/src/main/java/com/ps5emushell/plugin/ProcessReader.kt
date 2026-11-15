package com.ps5emushell.plugin

import android.os.Build
import com.getcapacitor.JSObject
import java.io.File

/**
 * Process enumeration via the /proc filesystem.
 *
 * Replaces src/main/system/processes.js, which used koffi to call
 * EnumProcesses / OpenProcess / QueryFullProcessImageNameW from psapi.dll
 * and kernel32.dll.
 *
 * IMPORTANT ANDROID LIMITATION — read before relying on this:
 * Since Android 7 (API 24), /proc is mounted with hidepid, so a normal app can
 * only read metadata for its OWN processes. Third-party app PIDs, their cmdline
 * and their exe symlink are not visible without root. This means the original
 * "find every process whose image lives in this game folder" strategy from
 * runner.js cannot be reproduced faithfully.
 *
 * Consequences for the port:
 *   - listRunning() returns only this app's processes (still useful for the
 *     debug/perf panel and for our own memory footprint).
 *   - Emulator lifecycle tracking must NOT depend on this. Use
 *     EmulatorLauncher.isRunning(packageName) instead, which asks
 *     ActivityManager / UsageStats whether the emulator is in the foreground.
 *   - Understanding this up front avoids a class of bugs that would otherwise
 *     look like "the game never exits" on device.
 */
class ProcessReader {

    data class Entry(
        val pid: Int,
        val name: String,
        val exe: String?,
        val memKB: Long,
    ) {
        fun toJs(): JSObject = JSObject().apply {
            put("pid", pid)
            put("name", name)
            put("exe", exe ?: name)
            put("memKB", memKB)
        }
    }

    fun listRunning(): List<Entry> {
        val proc = File("/proc")
        val selfPid = android.os.Process.myPid()
        return (proc.list() ?: emptyArray())
            .mapNotNull { it.toIntOrNull() }
            .filter { it == selfPid }
            .mapNotNull { readEntry(it) }
    }

    fun listInFolder(folder: String): List<Entry> {
        val root = folder.trimEnd('/')
        return listRunning().filter { entry ->
            entry.exe?.let { it == root || it.startsWith("$root/") } == true
        }
    }

    fun topByMemory(limit: Int): List<Entry> =
        listRunning().sortedByDescending { it.memKB }.take(limit)

    // ─── Internals ────────────────────────────────────────────────────────────

    private fun readEntry(pid: Int): Entry? {
        val dir = File("/proc/$pid")
        if (!dir.exists()) return null

        val name = runCatching {
            File("/proc/$pid/cmdline").readText().substringBefore('\u0000').ifBlank { null }
        }.getOrNull()
            ?: runCatching { File("/proc/$pid/comm").readText().trim() }.getOrNull()
            ?: return null

        val exe = runCatching {
            File("/proc/$pid/exe").canonicalPath
        }.getOrNull()

        val memKB = readRss(pid)
        return Entry(pid, name, exe, memKB)
    }

    private fun readRss(pid: Int): Long = runCatching {
        File("/proc/$pid/status").useLines { lines ->
            lines.firstOrNull { it.startsWith("VmRSS:") }
                ?.filter { it.isDigit() }?.toLongOrNull() ?: 0L
        }
    }.getOrDefault(0L)

    companion object {
        fun isHiddenProcMount(): Boolean =
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.N &&
                (File("/proc").list()?.size ?: 0) < 20
    }
}
