package com.ps5emushell.plugin

import android.os.Bundle
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import com.getcapacitor.BridgeActivity

/**
 * MainActivity do PS5 Emu Shell para Android.
 *
 * Há duas diferenças importantes em relação ao app Electron original:
 *
 * 1. Eventos de controle são interceptados ANTES do WebView.
 *    O Android não oferece polling de gamepad como o XInput; os eventos chegam
 *    ao Activity. Sobrescrever dispatch*Event permite capturá-los sem colocar
 *    uma View por cima (o que bloquearia o toque na tela).
 *
 * 2. Tela cheia imersiva.
 *    O original abria a janela em fullscreen pelo Electron; aqui usamos
 *    WindowInsetsController para esconder status/navigation bars, e reaplicamos
 *    sempre que a janela recebe foco (o sistema pode restaurá-las).
 */
class MainActivity : BridgeActivity() {

    private var gamepad: GamepadReader? = null
    private var plugin: ShellNativePlugin? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        // ATENÇÃO: registerPlugin precisa vir ANTES de super.onCreate(),
        // caso contrário o bridge sobe sem o plugin e todo call() falha com
        // "not implemented on Android".
        registerPlugin(ShellNativePlugin::class.java)
        super.onCreate(savedInstanceState)

        plugin = bridge?.getPlugin("ShellNative")?.instance as? ShellNativePlugin
        gamepad = plugin?.gamepadReader()

        hideSystemBars()
        watchInputDevices()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    private fun hideSystemBars() {
        window.decorView.systemUiVisibility =
            android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
            android.view.View.SYSTEM_UI_FLAG_FULLSCREEN or
            android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
            android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE
    }

    // ─── Encaminhamento de input ──────────────────────────────────────────────

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val reader = gamepad
        if (reader != null && isGamepadSource(event.source)) {
            val handled = reader.onKeyEvent(
                event,
                event.action == KeyEvent.ACTION_DOWN,
            )
            // Não consumimos o evento: o WebView continua recebendo para
            // navegação por teclado/fallback.
            if (handled) return true
        }
        return super.dispatchKeyEvent(event)
    }

    override fun dispatchGenericMotionEvent(event: MotionEvent): Boolean {
        val reader = gamepad
        if (reader != null && isGamepadSource(event.source)) {
            if (reader.onGenericMotionEvent(event)) return true
        }
        return super.dispatchGenericMotionEvent(event)
    }

    private fun isGamepadSource(source: Int): Boolean =
        source and InputDevice.SOURCE_GAMEPAD == InputDevice.SOURCE_GAMEPAD ||
            source and InputDevice.SOURCE_JOYSTICK == InputDevice.SOURCE_JOYSTICK

    // ─── Hotplug ──────────────────────────────────────────────────────────────

    private fun watchInputDevices() {
        val manager = getSystemService(INPUT_SERVICE) as android.hardware.input.InputManager
        manager.registerInputDeviceListener(
            object : android.hardware.input.InputManager.InputDeviceListener {
                override fun onInputDeviceAdded(deviceId: Int) {
                    InputDevice.getDevice(deviceId)?.let { gamepad?.onDeviceAdded(it) }
                }

                override fun onInputDeviceRemoved(deviceId: Int) {
                    gamepad?.onDeviceRemoved(deviceId)
                }

                override fun onInputDeviceChanged(deviceId: Int) = Unit
            },
            null,
        )
    }
}
