package com.ps5emushell.plugin

import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import java.io.File

/**
 * Leitura de diretórios e arquivos para o scanner de ROMs.
 *
 * No Electron o scanner chamava `node:fs` direto. No Android isso precisa
 * passar pelo lado nativo por dois motivos:
 *
 *  1. O WebView não tem acesso ao sistema de arquivos.
 *  2. Acesso a armazenamento compartilhado exige permissão de runtime, que só
 *     faz sentido pedir no lado nativo.
 *
 * A leitura é somente-leitura por decisão: o launcher nunca escreve na pasta de
 * ROMs. Escritas (configuração, capas) ficam na área privada do app.
 */
class FileSystemReader {

    data class Entry(val name: String, val isDirectory: Boolean) {
        fun toJs(): JSObject = JSObject().put("name", name).put("isDirectory", isDirectory)
    }

    data class Stat(val size: Long, val birthtimeMs: Long, val mtimeMs: Long) {
        fun toJs(): JSObject = JSObject()
            .put("size", size)
            .put("birthtimeMs", birthtimeMs)
            .put("mtimeMs", mtimeMs)
    }

    fun listDir(path: String): List<Entry> {
        val dir = File(path)
        if (!dir.isDirectory) return emptyList()

        // listFiles() pode devolver null (permissão negada, I/O). Tratar como
        // vazio é o que o scanner espera: ele marca o sistema como ilegível.
        val files = dir.listFiles() ?: return emptyList()

        return files.mapNotNull { file ->
            runCatching { Entry(file.name, file.isDirectory) }.getOrNull()
        }
    }

    fun stat(path: String): Stat? {
        val file = File(path)
        if (!file.exists()) return null
        return runCatching {
            Stat(
                size = file.length(),
                // birthtime não existe de forma confiável em todas as versões
                // do Android; cai para mtime quando indisponível.
                birthtimeMs = readBirthTime(file) ?: file.lastModified(),
                mtimeMs = file.lastModified(),
            )
        }.getOrNull()
    }

    /**
     * `java.nio.file` só existe a partir da API 26. Nas versões anteriores
     * caímos no mtime, que é o que o scanner já espera como fallback.
     */
    private fun readBirthTime(file: File): Long? {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O) return null
        return runCatching {
            val attributes = java.nio.file.Files.readAttributes(
                file.toPath(),
                java.nio.file.attribute.BasicFileAttributes::class.java,
            )
            attributes.creationTime().toMillis()
        }.getOrNull()
    }

    /**
     * Lê texto (usado para arquivos .cue/.m3u).
     * Limitado em tamanho: uma playlist de 4 MB é sinal de arquivo errado.
     */
    fun readText(path: String): String? {
        val file = File(path)
        if (!file.isFile) return null
        if (file.length() > MAX_PLAYLIST_BYTES) {
            Log.w(TAG, "Arquivo grande demais para playlist: $path")
            return null
        }
        return runCatching { file.readText() }.getOrNull()
    }

    /**
     * Escrita usada pela persistência (config.json, library.json, stats.json).
     *
     * Só a área privada do app é gravável — a pasta de ROMs é somente leitura
     * por decisão, para o launcher nunca alterar a biblioteca do usuário.
     * A escrita é atômica (arquivo temporário + rename) para não corromper o
     * JSON se o app for morto no meio.
     */
    fun writeText(path: String, content: String): Boolean = runCatching {
        val file = File(path)
        file.parentFile?.mkdirs()

        val temp = File(file.parentFile, "${file.name}.tmp")
        temp.writeText(content)
        if (!temp.renameTo(file)) {
            // renameTo falha em alguns volumes; cópia direta como plano B.
            file.writeText(content)
            temp.delete()
        }
        true
    }.getOrElse {
        Log.e(TAG, "Falha ao gravar $path", it)
        false
    }

    fun entriesToJs(entries: List<Entry>): JSArray =
        JSArray().also { array -> entries.forEach { array.put(it.toJs()) } }

    private companion object {
        const val TAG = "FileSystemReader"
        const val MAX_PLAYLIST_BYTES = 4L * 1024 * 1024
    }
}
