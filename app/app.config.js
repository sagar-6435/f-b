export default ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    // Inlined at build time — available via Constants.expoConfig.extra.apiUrl
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://13.53.175.80:3000',
    eas: {
      projectId: '7ab6b01a-8803-4365-a807-1b99f2396b2b',
    },
  },
});
