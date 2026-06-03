// app.config.js replaces app.json and gives access to environment variables.
// Expo reads .env automatically when using the local CLI (expo start / npx expo).
// EXPO_PUBLIC_* vars are safe to use in JS — they are inlined at build time.

export default ({ config }) => ({
  ...config,
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
  },
});
