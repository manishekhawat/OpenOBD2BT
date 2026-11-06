/**
 * Re-enable BuildConfig generation for library modules that still need it.
 *
 * Android Gradle Plugin 8 stopped generating a `BuildConfig` class for library
 * modules by default, and AGP 9 removed the global
 * `android.defaults.buildfeatures.buildconfig` property that used to turn it
 * back on. `react-native-bluetooth-classic` imports
 * `kjd.reactnative.bluetooth.BuildConfig` to read `BuildConfig.DEBUG`, so
 * without this the release build fails with "cannot find symbol: BuildConfig".
 *
 * The remaining way to do it is per module, so this appends a `subprojects`
 * block to the root build.gradle that switches the feature on for every Android
 * module. Doing it as a config plugin keeps it in place across `expo prebuild`.
 */

const { withProjectBuildGradle, withGradleProperties } = require('expo/config-plugins');

const MARKER = '// obd-scout: enable BuildConfig for library modules';
const STALE_PROPERTY = 'android.defaults.buildfeatures.buildconfig';

const SNIPPET = `
${MARKER}
// react-native-bluetooth-classic imports BuildConfig, which AGP no longer
// generates for libraries unless asked. AGP 9 removed the global property for
// this, so it has to be set per module.
subprojects { subproject ->
    subproject.afterEvaluate {
        def androidExtension = subproject.extensions.findByName("android")
        if (androidExtension != null) {
            androidExtension.buildFeatures.buildConfig = true
        }
    }
}
`;

/** Drop the property AGP 9 removed — leaving it in is a hard build failure. */
function removeStaleProperty(config) {
  return withGradleProperties(config, (gradleConfig) => {
    gradleConfig.modResults = gradleConfig.modResults.filter(
      (item) =>
        !(item.type === 'property' && item.key === STALE_PROPERTY) &&
        !(
          item.type === 'comment' &&
          typeof item.value === 'string' &&
          item.value.includes('react-native-bluetooth-classic')
        ),
    );
    return gradleConfig;
  });
}

function addSubprojectsBlock(config) {
  return withProjectBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') {
      throw new Error(
        'withBuildConfig expects a Groovy root build.gradle; the template appears to have changed.',
      );
    }
    // Keep it idempotent — prebuild can run over an existing project.
    if (!gradleConfig.modResults.contents.includes(MARKER)) {
      gradleConfig.modResults.contents += SNIPPET;
    }
    return gradleConfig;
  });
}

module.exports = function withBuildConfig(config) {
  return addSubprojectsBlock(removeStaleProperty(config));
};
