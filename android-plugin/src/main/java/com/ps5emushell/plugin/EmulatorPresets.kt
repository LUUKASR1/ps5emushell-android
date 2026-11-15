package com.ps5emushell.plugin

/**
 * Launch presets for Android emulators.
 *
 * The original launcher (src/main/emulators/runner.js) spawned an .exe with
 * command-line arguments. Android has no equivalent: an emulator is a package
 * that you start with an Intent carrying the ROM as an extra or a content URI.
 * Each emulator therefore needs its own preset describing:
 *   - the package to check for installed-ness
 *   - which activity to target
 *   - how to pass the ROM path
 *
 * Order matters: the launcher picks the first preset whose ``match`` accepts
 * the system id, so keep the most specific entries first.
 */
object EmulatorPresets {

    enum class RomPassing {
        /** data URI, e.g. content://... or file://... placed in setData() */
        DATA_URI,

        /** string extra holding an absolute path */
        EXTRA_PATH,
    }

    data class Preset(
        val id: String,
        val displayName: String,
        val packageName: String,
        val activity: String? = null,
        val systems: List<String> = emptyList(),
        val romPassing: RomPassing = RomPassing.DATA_URI,
        val pathExtra: String = "romPath",
        val coreExtra: String = "corePath",
        val extraExtras: Map<String, String> = emptyMap(),
    ) {
        fun matches(system: String): Boolean = systems.isEmpty() || systems.contains(system)
    }

    val ALL: List<Preset> = listOf(
        Preset(
            id = "retroarch",
            displayName = "RetroArch",
            packageName = "com.retroarch",
            activity = "com.retroarch.browser.retroactivity.RetroActivityFuture",
            systems = listOf(
                "nes", "snes", "gb", "gbc", "gba", "genesis", "megadrive",
                "n64", "psx", "nds", "dreamcast", "psp", "arcade",
            ),
            romPassing = RomPassing.EXTRA_PATH,
            pathExtra = "ROM",
            coreExtra = "LIBRETRO",
        ),
        Preset(
            id = "retroarch.aarch64",
            displayName = "RetroArch (AArch64)",
            packageName = "com.retroarch.aarch64",
            activity = "com.retroarch.browser.retroactivity.RetroActivityFuture",
            systems = listOf("psx", "n64", "dreamcast", "psp", "nds", "snes", "nes"),
            romPassing = RomPassing.EXTRA_PATH,
            pathExtra = "ROM",
            coreExtra = "LIBRETRO",
        ),
        Preset(
            id = "dolphin",
            displayName = "Dolphin",
            packageName = "org.dolphinemu.dolphinemu",
            activity = "org.dolphinemu.dolphinemu.ui.main.MainActivity",
            systems = listOf("gc", "wii"),
            romPassing = RomPassing.EXTRA_PATH,
            pathExtra = "AutoStartFile",
        ),
        Preset(
            id = "ppsspp",
            displayName = "PPSSPP",
            packageName = "org.ppsspp.ppsspp",
            systems = listOf("psp"),
            romPassing = RomPassing.DATA_URI,
        ),
        Preset(
            id = "ppsspp.gold",
            displayName = "PPSSPP Gold",
            packageName = "org.ppsspp.ppssppgold",
            systems = listOf("psp"),
            romPassing = RomPassing.DATA_URI,
        ),
        Preset(
            id = "nethersx2",
            displayName = "NetherSX2",
            packageName = "xyz.aethersx2.android",
            systems = listOf("ps2"),
            romPassing = RomPassing.DATA_URI,
        ),
        Preset(
            id = "duckstation",
            displayName = "DuckStation",
            packageName = "com.github.stenzek.duckstation",
            systems = listOf("psx"),
            romPassing = RomPassing.DATA_URI,
        ),
        Preset(
            id = "melonDS",
            displayName = "melonDS",
            packageName = "me.magnum.melonds",
            systems = listOf("nds"),
            romPassing = RomPassing.DATA_URI,
        ),
        Preset(
            id = "azahar",
            displayName = "Azahar",
            packageName = "org.citra.emu",
            systems = listOf("3ds"),
            romPassing = RomPassing.DATA_URI,
        ),
        Preset(
            id = "flycast",
            displayName = "Flycast",
            packageName = "com.flycast.emulator",
            systems = listOf("dreamcast", "naomi"),
            romPassing = RomPassing.DATA_URI,
        ),
        Preset(
            id = "mgba",
            displayName = "mGBA",
            packageName = "io.mgba.mgba",
            systems = listOf("gba", "gb", "gbc"),
            romPassing = RomPassing.DATA_URI,
        ),
        Preset(
            id = "snes9x",
            displayName = "Snes9x EX+",
            packageName = "com.explusalpha.Snes9xPlus",
            systems = listOf("snes"),
            romPassing = RomPassing.DATA_URI,
        ),
        Preset(
            id = "yuzu",
            displayName = "Yuzu / Sudachi",
            packageName = "org.yuzu.yuzu_emu",
            systems = listOf("switch"),
            romPassing = RomPassing.DATA_URI,
        ),
        Preset(
            id = "winlator",
            displayName = "Winlator",
            packageName = "com.winlator",
            systems = listOf("pc", "win86", "win64"),
            romPassing = RomPassing.EXTRA_PATH,
            pathExtra = "container_path",
        ),
    )

    fun forId(id: String): Preset? = ALL.firstOrNull { it.id == id }

    fun forSystem(system: String): List<Preset> = ALL.filter { it.matches(system) }
}
