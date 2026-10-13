/**
 * Expo config plugin: sign Android release builds with a keystore supplied through environment
 * variables, so no signing secret ever lives in the repository.
 *
 *   DSH_RELEASE_STORE_FILE      absolute path to the .keystore
 *   DSH_RELEASE_STORE_PASSWORD  keystore password
 *   DSH_RELEASE_KEY_ALIAS       key alias
 *   DSH_RELEASE_KEY_PASSWORD    key password
 *
 * When the variables are absent, release builds fall back to the debug key (local testing only).
 * Every published APK must be signed with the same key, otherwise Android refuses the update.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// dsh-release-signing';

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, cfg => {
    let g = cfg.modResults.contents;
    if (g.includes(MARK)) return cfg;
    g = g.replace(/signingConfigs\s*\{/, `signingConfigs {
        ${MARK}
        release {
            def storeFilePath = System.getenv('DSH_RELEASE_STORE_FILE')
            if (storeFilePath) {
                storeFile file(storeFilePath)
                storePassword System.getenv('DSH_RELEASE_STORE_PASSWORD')
                keyAlias System.getenv('DSH_RELEASE_KEY_ALIAS')
                keyPassword System.getenv('DSH_RELEASE_KEY_PASSWORD')
            } else {
                storeFile file('debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }`);
    // Point the release build type at the release signing config (Expo's template uses debug).
    g = g.replace(/(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/, '$1signingConfig signingConfigs.release');
    cfg.modResults.contents = g;
    return cfg;
  });
};
