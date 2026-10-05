const { withGradleProperties, withProjectBuildGradle } = require('expo/config-plugins');

/**
 * Pins the Kotlin Gradle plugin, so the Kotlin compiler, to `kotlinVersion`.
 *
 * ML Kit's GenAI libraries are compiled with Kotlin 2.3, which needs a 2.2+
 * compiler. expo-build-properties' `kotlinVersion` doesn't reach the compiler
 * on SDK 57: the root build.gradle's unversioned kotlin-gradle-plugin is
 * resolved through React Native's Gradle plugin, which pulls in 2.1.20.
 *
 * Loading that second Kotlin plugin version also overflows Gradle's default
 * 512 MB metaspace, so the build gets more room.
 */
module.exports = function withLabelReader(config, { kotlinVersion = '2.2.21' } = {}) {
  config = withGradleProperties(config, (mod) => {
    const jvmargs = mod.modResults.find((item) => item.type === 'property' && item.key === 'org.gradle.jvmargs');
    const value = '-Xmx4096m -XX:MaxMetaspaceSize=1536m';
    if (jvmargs) jvmargs.value = value;
    else mod.modResults.push({ type: 'property', key: 'org.gradle.jvmargs', value });
    return mod;
  });
  return withProjectBuildGradle(config, (mod) => {
    const unversioned = /classpath\(['"]org\.jetbrains\.kotlin:kotlin-gradle-plugin(?::[^'"]*)?['"]\)/;
    if (!unversioned.test(mod.modResults.contents)) {
      throw new Error('label-reader: kotlin-gradle-plugin classpath not found in android/build.gradle');
    }
    mod.modResults.contents = mod.modResults.contents.replace(
      unversioned,
      `classpath('org.jetbrains.kotlin:kotlin-gradle-plugin:${kotlinVersion}')`,
    );
    return mod;
  });
};
