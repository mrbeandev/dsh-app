/**
 * Expo config plugin: keep the prebuilt proot binaries (modules/dsh-local) byte-for-byte.
 *
 * The app's release build strips native libraries. These files are executables patched with
 * patchelf, and stripping them again corrupts them (proot segfaults on the device). A
 * `keepDebugSymbols` rule in the library module isn't enough — packaging happens in the app module —
 * so this adds it to android/app/build.gradle. scripts: ~/.dsh-app-tools/verify-apk.sh checks it.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// dsh-local-keep-binaries';
const LIBS = ['libproot.so', 'libproot-loader.so', 'libtalloc.so', 'libandroid-shmem.so'];

module.exports = function withLocalHarnessLibs(config) {
  return withAppBuildGradle(config, cfg => {
    let g = cfg.modResults.contents;
    if (g.includes(MARK)) return cfg;
    const rule = `${MARK}\n        jniLibs {\n            ${LIBS.map(l => `keepDebugSymbols += '**/${l}'`).join('\n            ')}\n        }`;
    if (/packagingOptions\s*\{/.test(g)) g = g.replace(/packagingOptions\s*\{/, m => `${m}\n        ${rule}`);
    else g = g.replace(/android\s*\{/, m => `${m}\n    packagingOptions {\n        ${rule}\n    }`);
    cfg.modResults.contents = g;
    return cfg;
  });
};
