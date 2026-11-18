package dev.mrbean.dshlocal

import android.content.Context
import java.io.File

/**
 * Paths and process plumbing for the on-device Harness ("Run on this device").
 *
 * Layout under the app's private files dir (no storage permission needed):
 *   local/rootfs/        Debian 12 arm64 + Node 24 (downloaded image, extracted)
 *   local/tmp/           PROOT_TMP_DIR
 *   local/harness.log    output of `dsh web` and setup steps
 *
 * proot, its loader and libraries ship in the APK as lib*.so in jniLibs: since Android 10 only the
 * app's nativeLibraryDir may hold executables, so that's where they run from.
 */
class LocalEnv(private val context: Context) {
  val base: File get() = File(context.filesDir, "local")
  val rootfs: File get() = File(base, "rootfs")
  val tmp: File get() = File(base, "tmp")
  val log: File get() = File(base, "harness.log")
  val taskLog: File get() = File(base, "task.log")
  private val libDir: String get() = context.applicationInfo.nativeLibraryDir
  val proot: File get() = File(libDir, "libproot.so")
  private val loader: File get() = File(libDir, "libproot-loader.so")

  val installed: Boolean get() = File(rootfs, "usr/local/bin/node").exists()

  /**
   * A command for /bin/sh inside the container, run as root (fake, via proot -0) in a clean
   * environment. `--link2symlink` makes hard links work on Android filesystems; `/proc` and `/dev`
   * are bound from the host; the app's private dir is never visible to anything else.
   */
  fun command(script: String): ProcessBuilder {
    tmp.mkdirs()
    val args = mutableListOf(
      proot.absolutePath,
      "--kill-on-exit", "--link2symlink", "-0",
      "-r", rootfs.absolutePath,
      "-b", "/dev", "-b", "/proc", "-b", "/sys",
      "-b", "${tmp.absolutePath}:/tmp",
      "-w", "/root",
      "/usr/bin/env", "-i",
      "HOME=/root", "USER=root", "LANG=C.UTF-8", "TERM=xterm-256color",
      "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      "TMPDIR=/tmp",
      "/bin/sh", "-c", script,
    )
    return ProcessBuilder(args).apply {
      directory(base)
      redirectErrorStream(true)
      environment().apply {
        clear()
        put("PROOT_LOADER", loader.absolutePath)
        put("PROOT_TMP_DIR", tmp.absolutePath)
        put("LD_LIBRARY_PATH", libDir)
        put("PATH", "/system/bin")
      }
    }
  }
}
