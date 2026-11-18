package dev.mrbean.dshlocal

import android.content.Intent
import android.os.Build
import android.os.StatFs
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.DigestInputStream
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

/**
 * "Run on this device": install a Debian + Node environment (downloaded image) and run the
 * DeepSeek Harness in it under proot, as a foreground service.
 *
 * JS API (see modules/dsh-local/index.ts):
 *   status()                          → { supported, installed, running, freeBytes, log }
 *   install(url, sha256, sizeBytes)   → downloads + verifies + extracts; emits "progress"
 *   run(script, timeoutSec)           → runs a shell script in the container; emits "output"; resolves { code, tail }
 *   start(port) / stop()              → start/stop `dsh web` in the foreground service
 *   readLog(maxBytes)                 → last part of harness.log
 *   remove()                          → deletes the whole environment
 */
class DshLocalModule : Module() {
  private val context get() = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "App context is not available.", null)
  private val env get() = LocalEnv(context)

  override fun definition() = ModuleDefinition {
    Name("DshLocal")
    Events("progress", "output")

    Function("status") {
      val e = env
      mapOf(
        "supported" to (Build.SUPPORTED_64_BIT_ABIS.contains("arm64-v8a") && e.proot.exists()),
        "installed" to e.installed,
        "running" to HarnessService.running,
        "freeBytes" to StatFs(context.filesDir.path).availableBytes,
        "basePath" to e.base.path,
      )
    }

    AsyncFunction("install") { url: String, sha256: String, sizeBytes: Double ->
      val e = env
      if (!e.proot.exists()) throw CodedException("ERR_UNSUPPORTED", "This device's CPU isn't supported (needs 64-bit ARM).", null)
      e.base.mkdirs()
      val part = File(e.base, "rootfs.tar.gz.part")
      // 1. Download (resumable) with a running SHA-256.
      download(url, part, sizeBytes.toLong())
      val actual = sha256(part)
      if (!actual.equals(sha256, ignoreCase = true)) { part.delete(); throw CodedException("ERR_CHECKSUM", "The download was damaged (checksum mismatch). Please try again.", null) }
      // 2. Extract into a fresh dir, then swap in (an interrupted extract never leaves a half rootfs).
      val staging = File(e.base, "rootfs.new"); staging.deleteRecursively()
      sendEvent("progress", mapOf("phase" to "extract", "done" to 0.0, "total" to part.length().toDouble()))
      part.inputStream().use { input ->
        TarGz.extract(input, staging) { read -> sendEvent("progress", mapOf("phase" to "extract", "done" to read.toDouble(), "total" to part.length().toDouble())) }
      }
      e.rootfs.deleteRecursively(); if (!staging.renameTo(e.rootfs)) throw CodedException("ERR_INSTALL", "Couldn't finish installing.", null)
      part.delete()
      sendEvent("progress", mapOf("phase" to "done", "done" to 1.0, "total" to 1.0))
      e.installed
    }

    AsyncFunction("run") { script: String, timeoutSec: Double ->
      val e = env
      if (!e.installed) throw CodedException("ERR_NOT_INSTALLED", "Set up the local environment first.", null)
      val proc = e.command(script).start()
      val tail = StringBuilder()
      proc.inputStream.bufferedReader().useLines { lines ->
        for (line in lines) {
          sendEvent("output", mapOf("line" to line))
          tail.append(line).append('\n'); if (tail.length > 16_000) tail.delete(0, tail.length - 12_000)
        }
      }
      val finished = proc.waitFor(timeoutSec.toLong().coerceAtLeast(1), TimeUnit.SECONDS)
      if (!finished) { proc.destroyForcibly(); throw CodedException("ERR_TIMEOUT", "The command took too long.", null) }
      mapOf("code" to proc.exitValue(), "tail" to tail.toString())
    }

    /** Run a long setup script inside the foreground service (survives the app being killed). */
    Function("startTask") { script: String ->
      if (!env.installed) throw CodedException("ERR_NOT_INSTALLED", "Set up the local environment first.", null)
      val intent = Intent(context, HarnessService::class.java).setAction(HarnessService.ACTION_TASK).putExtra("script", script)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
    }

    Function("taskRunning") { HarnessService.task?.isAlive == true }

    Function("readTaskLog") { maxBytes: Int ->
      val f = env.taskLog
      if (!f.exists()) "" else f.inputStream().use { s -> s.skip((f.length() - maxBytes).coerceAtLeast(0)); String(s.readBytes(), Charsets.UTF_8) }
    }

    Function("start") { port: Int ->
      if (!env.installed) throw CodedException("ERR_NOT_INSTALLED", "Set up the local environment first.", null)
      val intent = Intent(context, HarnessService::class.java).putExtra("port", port)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
    }

    Function("stop") {
      context.startService(Intent(context, HarnessService::class.java).setAction(HarnessService.ACTION_STOP))
    }

    Function("readLog") { maxBytes: Int ->
      val f = env.log
      if (!f.exists()) "" else f.inputStream().use { s ->
        val skip = (f.length() - maxBytes).coerceAtLeast(0); s.skip(skip); String(s.readBytes(), Charsets.UTF_8)
      }
    }

    AsyncFunction("remove") {
      context.startService(Intent(context, HarnessService::class.java).setAction(HarnessService.ACTION_STOP))
      env.base.deleteRecursively()
    }
  }

  private fun download(url: String, out: File, expected: Long) {
    var have = if (out.exists()) out.length() else 0L
    if (expected > 0 && have > expected) { out.delete(); have = 0 }
    if (expected > 0 && have == expected) return
    var location = url; var redirects = 0
    while (true) {
      val conn = (URL(location).openConnection() as HttpURLConnection).apply {
        connectTimeout = 20_000; readTimeout = 60_000; instanceFollowRedirects = false
        setRequestProperty("User-Agent", "DSH-Mobile")
        if (have > 0) setRequestProperty("Range", "bytes=$have-")
      }
      val code = conn.responseCode
      if (code in 300..399 && redirects++ < 5) { location = URL(URL(location), conn.getHeaderField("Location")).toString(); conn.disconnect(); continue }
      if (code == 416) { conn.disconnect(); return } // already complete
      if (code != 200 && code != 206) throw CodedException("ERR_DOWNLOAD", "Download failed (HTTP $code).", null)
      val append = code == 206
      if (!append) have = 0
      val total = if (expected > 0) expected else have + conn.contentLengthLong
      conn.inputStream.use { input ->
        java.io.FileOutputStream(out, append).use { output ->
          val buf = ByteArray(1 shl 16); var done = have; var last = 0L
          while (true) {
            val r = input.read(buf); if (r < 0) break
            output.write(buf, 0, r); done += r
            if (done - last > 512 * 1024) { last = done; sendEvent("progress", mapOf("phase" to "download", "done" to done.toDouble(), "total" to total.toDouble())) }
          }
        }
      }
      return
    }
  }

  private fun sha256(f: File): String {
    val md = MessageDigest.getInstance("SHA-256")
    DigestInputStream(f.inputStream().buffered(1 shl 16), md).use { s -> val buf = ByteArray(1 shl 16); while (s.read(buf) >= 0) {} }
    return md.digest().joinToString("") { "%02x".format(it) }
  }
}
