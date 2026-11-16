// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Évite l'inclusion de fichiers ESM (.mjs) contenant `import.meta` (ex: zustand v5)
// qui provoquent une page blanche ("Cannot use 'import.meta' outside a module") sur Web
config.resolver.unstable_conditionNames = ['require', 'default', 'browser'];

module.exports = config;
