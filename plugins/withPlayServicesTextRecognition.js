const { AndroidConfig, withAndroidManifest, withAppBuildGradle } = require('expo/config-plugins');

/**
 * Uses Google Play services' ML Kit text recognition instead of the bundled
 * one that @react-native-ml-kit/text-recognition depends on: same API, but
 * the model (an 11 MB native library) is downloaded once by Play services
 * and shared between apps, rather than shipped in the APK. ML Kit is still
 * used for menus, and for cans when the on-device reader fails.
 *
 * The manifest entry asks Play services to download the Latin model when the
 * app is installed; until it has, recognition fails.
 */
const SUBSTITUTES = {
  'com.google.mlkit:text-recognition': 'com.google.android.gms:play-services-mlkit-text-recognition:19.0.1',
  'com.google.mlkit:text-recognition-chinese': 'com.google.android.gms:play-services-mlkit-text-recognition-chinese:16.0.1',
  'com.google.mlkit:text-recognition-devanagari': 'com.google.android.gms:play-services-mlkit-text-recognition-devanagari:16.0.1',
  'com.google.mlkit:text-recognition-japanese': 'com.google.android.gms:play-services-mlkit-text-recognition-japanese:16.0.1',
  'com.google.mlkit:text-recognition-korean': 'com.google.android.gms:play-services-mlkit-text-recognition-korean:16.0.1',
};

const MARKER = '// withPlayServicesTextRecognition';

module.exports = function withPlayServicesTextRecognition(config) {
  config = withAppBuildGradle(config, (mod) => {
    if (mod.modResults.contents.includes(MARKER)) return mod;
    const lines = Object.entries(SUBSTITUTES).map(
      ([bundled, playServices]) => `      substitute module('${bundled}') using module('${playServices}')`,
    );
    mod.modResults.contents += `
${MARKER}
configurations.configureEach {
  resolutionStrategy {
    dependencySubstitution {
${lines.join('\n')}
    }
  }
}
`;
    return mod;
  });
  return withAndroidManifest(config, (mod) => {
    AndroidConfig.Manifest.ensureToolsAvailable(mod.modResults);
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, 'com.google.mlkit.vision.DEPENDENCIES', 'ocr');
    // Replaces expo-camera's "barcode_ui" (Google's code scanner screen, which
    // the app never opens), so Play services doesn't download it.
    const item = app['meta-data'].find((m) => m.$['android:name'] === 'com.google.mlkit.vision.DEPENDENCIES');
    item.$['tools:replace'] = 'android:value';
    return mod;
  });
};
