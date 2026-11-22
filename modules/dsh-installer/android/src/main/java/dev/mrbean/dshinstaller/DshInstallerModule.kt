package dev.mrbean.dshinstaller

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.security.MessageDigest

/**
 * Small Android helpers for the in-app updater:
 *  - canInstallPackages(): whether the user has allowed this app to install APKs
 *    ("Install unknown apps"), so the app can ask BEFORE downloading.
 *  - openInstallPermissionSettings(): opens that exact settings page for this app.
 *  - sha256(uri): hex SHA-256 of a downloaded file, hashed natively in 1 MB chunks off the JS thread.
 *  - copyFile(from, to): stream a file (file:// or content://) into another, e.g. a Downloads-folder
 *    (SAF) file. Streams are held for the whole copy; expo-file-system's content-URI handles drop their
 *    ParcelFileDescriptor, which the GC can close mid-copy ("Bad file descriptor" on large files).
 */
class DshInstallerModule : Module() {
  private val context get() = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "App context is not available.", null)

  override fun definition() = ModuleDefinition {
    Name("DshInstaller")

    Function("canInstallPackages") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) true
      else context.packageManager.canRequestPackageInstalls()
    }

    Function("openInstallPermissionSettings") {
      val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
      else Intent(Settings.ACTION_SECURITY_SETTINGS)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    AsyncFunction("copyFile") { from: String, to: String ->
      val input: InputStream = if (from.startsWith("file://")) File(Uri.parse(from).path!!).inputStream()
        else context.contentResolver.openInputStream(Uri.parse(from)) ?: throw CodedException("ERR_OPEN", "Cannot open $from", null)
      input.use { src ->
        val output: OutputStream = if (to.startsWith("file://")) File(Uri.parse(to).path!!).outputStream()
          else context.contentResolver.openOutputStream(Uri.parse(to), "wt") ?: throw CodedException("ERR_OPEN", "Cannot write $to", null)
        output.use { dst -> src.copyTo(dst, 1 shl 20) }
      }
      null
    }

    AsyncFunction("sha256") { uri: String ->
      val stream: InputStream = if (uri.startsWith("file://")) File(Uri.parse(uri).path!!).inputStream()
        else context.contentResolver.openInputStream(Uri.parse(uri)) ?: throw CodedException("ERR_OPEN", "Cannot open $uri", null)
      stream.use { input ->
        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(1 shl 20)
        while (true) {
          val n = input.read(buffer)
          if (n < 0) break
          digest.update(buffer, 0, n)
        }
        digest.digest().joinToString("") { "%02x".format(it) }
      }
    }
  }
}
