const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.watchFolders = [path.resolve(__dirname, 'node_modules')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

// Exclude Gradle/Kotlin build output directories inside node_modules from being watched.
// On Windows, Metro's FallbackWatcher crashes if it tries to watch paths that don't exist
// or are created/deleted by Gradle during the build (e.g. expo-modules-core Gradle plugin).
const { blockList: existingBlockList } = config.resolver;
config.resolver.blockList = [
  ...(existingBlockList ? (Array.isArray(existingBlockList) ? existingBlockList : [existingBlockList]) : []),
  /node_modules[/\\].*[/\\]build[/\\]classes[/\\].*/,
  /node_modules[/\\].*[/\\]build[/\\]generated[/\\].*/,
  /node_modules[/\\].*[/\\]build[/\\]tmp[/\\].*/,
  /node_modules[/\\].*[/\\]\.gradle[/\\].*/,
];

config.resolver.extraNodeModules = {
	...(config.resolver.extraNodeModules || {}),
	'@firebase/app': path.resolve(__dirname, 'node_modules/@firebase/app'),
	'@firebase/firestore': path.resolve(__dirname, 'node_modules/@firebase/firestore'),
	'@firebase/component': path.resolve(__dirname, 'node_modules/@firebase/component'),
	'@firebase/util': path.resolve(__dirname, 'node_modules/@firebase/util'),
	'@firebase/logger': path.resolve(__dirname, 'node_modules/@firebase/logger'),
	'@firebase/webchannel-wrapper': path.resolve(__dirname, 'node_modules/@firebase/webchannel-wrapper'),
};

module.exports = config;