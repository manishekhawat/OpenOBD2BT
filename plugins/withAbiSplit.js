/**
 * Build one APK per CPU architecture instead of one carrying them all.
 *
 * A universal APK bundles native libraries for every architecture, which on
 * this project means four copies of React Native, Hermes and SQLite — around
 * 90 MB, of which a given phone uses roughly a quarter.
 *
 * Splitting produces a separate APK per architecture. Only the two that real
 * phones use are built: arm64-v8a for anything from the last decade, and
 * armeabi-v7a for older 32-bit devices. The x86 variants exist for emulators
 * and are not worth the build time here.
 */

const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

const ARCHITECTURES = 'arm64-v8a,armeabi-v7a';
const MARKER = '// obd-scout: split the APK per architecture';

const SPLIT_BLOCK = `
    ${MARKER}
    splits {
        abi {
            enable true
            reset()
            include ${ARCHITECTURES.split(',').map((abi) => `"${abi}"`).join(', ')}
            // No universal APK: it is the thing being avoided.
            universalApk false
        }
    }
`;

/** Limit which architectures are compiled at all. */
function restrictArchitectures(config) {
  return withGradleProperties(config, (gradleConfig) => {
    const key = 'reactNativeArchitectures';
    gradleConfig.modResults = gradleConfig.modResults.filter(
      (item) => !(item.type === 'property' && item.key === key),
    );
    gradleConfig.modResults.push({ type: 'property', key, value: ARCHITECTURES });
    return gradleConfig;
  });
}

/** Add the splits block inside the app module's android { } block. */
function addSplits(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') {
      throw new Error(
        'withAbiSplit expects a Groovy app/build.gradle; the template appears to have changed.',
      );
    }

    const contents = gradleConfig.modResults.contents;
    if (contents.includes(MARKER)) return gradleConfig;

    // Anchor on the android block's opening brace so the splits block lands
    // inside it rather than at the end of the file.
    const anchor = contents.indexOf('android {');
    if (anchor === -1) {
      throw new Error('withAbiSplit could not find the android block in app/build.gradle.');
    }

    const insertAt = contents.indexOf('\n', anchor) + 1;
    gradleConfig.modResults.contents =
      contents.slice(0, insertAt) + SPLIT_BLOCK + contents.slice(insertAt);

    return gradleConfig;
  });
}

module.exports = function withAbiSplit(config) {
  return addSplits(restrictArchitectures(config));
};
