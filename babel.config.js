module.exports = function (api) {
  api.cache(true);
  return {
    // Expo CLI resolves the "@/*" tsconfig path alias through Metro,
    // so no extra resolver plugin is needed here.
    presets: ['babel-preset-expo'],
  };
};
