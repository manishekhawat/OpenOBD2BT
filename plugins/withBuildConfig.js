/**
 * Re-enable BuildConfig generation for library modules that still need it.
 *
 * `react-native-bluetooth-classic` imports `kjd.reactnative.bluetooth.BuildConfig`
 * to read `BuildConfig.DEBUG`. Android Gradle Plugin 8 stopped generating that
 * class for library modules by default, and AGP 9 removed the global
 * `android.defaults.buildfeatures.buildconfig` property that used to switch it
 * back on — leaving that property set now fails the build outright.
 *
 * So it has to be set per module. The hook goes in settings.gradle rather than
 * the root build.gradle: settings is fully evaluated before any project is, so
 * `beforeProject` is guaranteed to run early enough. Appending the equivalent
 * to the root build.gradle instead fails with "Cannot run
 * Project.afterEvaluate when the project is already evaluated", because the
 * React Native root plugin has evaluated the subprojects by that point.
 *
 * `plugins.withId` is used rather than a direct extension lookup so the change
 * applies whenever the Android plugin is applied, without depending on module
 * evaluation order.
 */

const { withSettingsGradle, withGradleProperties } = require('expo/config-plugins');

const MARKER = '// obd-scout: enable BuildConfig for Android modules';
const STALE_PROPERTY = 'android.defaults.buildfeatures.buildconfig';

const SNIPPET = `
${MARKER}
// react-native-bluetooth-classic imports BuildConfig, which AGP no longer
// generates for libraries unless asked. AGP 9 removed the global property for
// this, so it is set per module here, before any project is evaluated.
gradle.beforeProject { project ->
    ["com.android.library", "com.android.application"].each { pluginId ->
        project.plugins.withId(pluginId) {
            project.extensions.getByName("android").buildFeatures.buildConfig = true
        }
    }
}
`;

/** Drop the property AGP 9 removed — leaving it set is a hard build failure. */
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

function addBeforeProjectHook(config) {
  return withSettingsGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') {
      throw new Error(
        'withBuildConfig expects a Groovy settings.gradle; the template appears to have changed.',
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
  return addBeforeProjectHook(removeStaleProperty(config));
};
