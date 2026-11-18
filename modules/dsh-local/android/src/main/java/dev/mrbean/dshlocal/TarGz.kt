package dev.mrbean.dshlocal

import android.system.Os
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.util.zip.GZIPInputStream

/**
 * Minimal streaming .tar.gz extractor for the rootfs image (ustar + GNU long names + pax path).
 * Handles regular files, directories, symlinks and hard links (as copies, since some Android
 * filesystems refuse link()). Keeps permission bits, which matter for executables in /usr/bin.
 * Device nodes and FIFOs are skipped (proot binds /dev from the host). Every path is checked to
 * stay inside the destination.
 */
object TarGz {
  fun interface Progress { fun onBytes(read: Long) }

  fun extract(input: InputStream, dest: File, progress: Progress? = null) {
    val counting = CountingStream(BufferedInputStream(input, 1 shl 16), progress)
    val tar = GZIPInputStream(counting, 1 shl 16)
    val root = dest.canonicalFile
    root.mkdirs()
    val header = ByteArray(512)
    var longName: String? = null
    var longLink: String? = null
    val hardLinks = mutableListOf<Pair<File, File>>()
    while (true) {
      if (!readFully(tar, header)) break
      if (header.all { it == 0.toByte() }) break
      val size = octal(header, 124, 12)
      val type = header[156].toInt().toChar()
      var name = longName ?: run {
        val prefix = str(header, 345, 155); val base = str(header, 0, 100)
        if (prefix.isNotEmpty()) "$prefix/$base" else base
      }
      val link = longLink ?: str(header, 157, 100)
      longName = null; longLink = null
      when (type) {
        'L' -> { longName = String(readBody(tar, size), Charsets.UTF_8).trimEnd('\u0000'); continue }
        'K' -> { longLink = String(readBody(tar, size), Charsets.UTF_8).trimEnd('\u0000'); continue }
        'x' -> { pax(readBody(tar, size))?.let { longName = it }; continue }
        'g' -> { skip(tar, size); continue }
      }
      name = name.removePrefix("./").trimEnd('/')
      if (name.isEmpty()) { skip(tar, size); continue }
      val target = safe(root, name)
      val mode = octal(header, 100, 8).toInt() and 0xFFF
      when (type) {
        '5' -> { target.mkdirs(); chmod(target, mode or 0b111_000_000) }
        '2' -> { target.parentFile?.mkdirs(); target.delete(); try { Os.symlink(link, target.path) } catch (_: Exception) {} }
        '1' -> hardLinks += target to safe(root, link.removePrefix("./"))
        '0', '\u0000', '7' -> {
          target.parentFile?.mkdirs()
          if (target.exists() && !target.isDirectory) target.delete()
          FileOutputStream(target).use { out -> copy(tar, out, size) }
          skipPadding(tar, size)
          chmod(target, mode or 0b110_000_000)
          continue
        }
        else -> {}
      }
      skip(tar, size)
    }
    for ((link, src) in hardLinks) {
      if (!src.isFile) continue
      link.parentFile?.mkdirs(); link.delete()
      src.copyTo(link, overwrite = true); chmod(link, (Os.stat(src.path).st_mode) and 0xFFF)
    }
  }

  /**
   * Resolve an archive path inside `root` without following symlinks (the archive's own symlinks
   * may point at absolute paths like /usr/bin, which are meant for inside the container).
   * Rejects absolute paths and any `..` that would leave `root`.
   */
  private fun safe(root: File, name: String): File {
    val parts = ArrayDeque<String>()
    for (seg in name.split('/')) when (seg) {
      "", "." -> {}
      ".." -> { if (parts.isEmpty()) throw IOException("Unsafe path in archive: $name"); parts.removeLast() }
      else -> parts.addLast(seg)
    }
    if (parts.isEmpty()) throw IOException("Empty path in archive: $name")
    return File(root, parts.joinToString("/"))
  }
  private fun chmod(f: File, mode: Int) { try { Os.chmod(f.path, mode) } catch (_: Exception) {} }
  private fun str(b: ByteArray, off: Int, len: Int): String {
    var end = off; while (end < off + len && b[end] != 0.toByte()) end++
    return String(b, off, end - off, Charsets.UTF_8)
  }
  private fun octal(b: ByteArray, off: Int, len: Int): Long {
    if (b[off].toInt() and 0x80 != 0) { // GNU base-256 for big sizes
      var v = 0L; for (i in off + 1 until off + len) v = (v shl 8) or (b[i].toLong() and 0xFF); return v
    }
    val s = str(b, off, len).trim(); return if (s.isEmpty()) 0 else s.toLong(8)
  }
  private fun pax(body: ByteArray): String? {
    var i = 0; val text = String(body, Charsets.UTF_8)
    while (i < text.length) {
      val sp = text.indexOf(' ', i); if (sp < 0) break
      val len = text.substring(i, sp).toIntOrNull() ?: break
      val rec = text.substring(sp + 1, (i + len - 1).coerceAtMost(text.length))
      if (rec.startsWith("path=")) return rec.removePrefix("path=")
      i += len
    }
    return null
  }
  /** Fills `b`; false at a clean end of stream (no bytes), an error on a partial block. */
  private fun readFully(s: InputStream, b: ByteArray): Boolean {
    var n = 0
    while (n < b.size) {
      val r = s.read(b, n, b.size - n)
      if (r < 0) { if (n == 0) return false; throw IOException("Truncated archive") }
      n += r
    }
    return true
  }
  private fun readBody(s: InputStream, size: Long): ByteArray {
    val b = ByteArray(size.toInt()); if (!readFully(s, b)) throw IOException("Truncated archive"); skipPadding(s, size); return b
  }
  private fun copy(s: InputStream, out: FileOutputStream, size: Long) {
    val buf = ByteArray(1 shl 16); var left = size
    while (left > 0) { val r = s.read(buf, 0, minOf(buf.size.toLong(), left).toInt()); if (r < 0) throw IOException("Truncated archive"); out.write(buf, 0, r); left -= r }
  }
  private fun skip(s: InputStream, size: Long) { var left = size + pad(size); val buf = ByteArray(8192); while (left > 0) { val r = s.read(buf, 0, minOf(buf.size.toLong(), left).toInt()); if (r < 0) return; left -= r } }
  private fun skipPadding(s: InputStream, size: Long) { var left = pad(size); val buf = ByteArray(512); while (left > 0) { val r = s.read(buf, 0, left.toInt()); if (r < 0) return; left -= r } }
  private fun pad(size: Long) = (512 - size % 512) % 512

  private class CountingStream(private val inner: InputStream, private val progress: Progress?) : InputStream() {
    private var count = 0L; private var lastReport = 0L
    override fun read(): Int { val r = inner.read(); if (r >= 0) bump(1); return r }
    override fun read(b: ByteArray, off: Int, len: Int): Int { val r = inner.read(b, off, len); if (r > 0) bump(r.toLong()); return r }
    private fun bump(n: Long) { count += n; if (count - lastReport > 1 shl 20) { lastReport = count; progress?.onBytes(count) } }
    override fun close() = inner.close()
  }
}
