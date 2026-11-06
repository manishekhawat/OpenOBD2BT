/**
 * Re-enable BuildConfig generation for library modules.
 *
 * Android Gradle Plugin 8 stopped generating a `BuildConfig` class for library
 * modules unless asked. `react-native-bluetooth-classic` imports
 * `kjd.reactnative.bluetooth.BuildConfig` to check `BuildConfig.DEBUG`, so
 * without this the release build fails with "cannot find symbol: BuildConfig".
 *
 * Setting it in gradle.properties applies to every module, which is what the
 * library expects. This is a config plugin rather than a hand edit to
 * android/gradle.properties so that the flag survives `expo prebuild`.
 */

const { withGradleProperties } = require('expo/config-plugins');

const KEY = 'android.defaults.buildfeatures.buildconfig';

module.exports = function withBuildConfig(config) {
  return withGradleProperties(config, (gradleConfig) => {
    const properties = gradleConfig.modResults.filter(
      (item) => !(item.type === 'property' && item.key === KEY),
    );

    properties.push({
      type: 'comment',
      value: 'Required by react-native-bluetooth-classic, which imports BuildConfig.',
    });
    properties.push({ type: 'property', key: KEY, value: 'true' });

    gradleConfig.modResults = properties;
    return gradleConfig;
  });
};
