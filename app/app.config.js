export default ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    // Inlined at build time — available via Constants.expoConfig.extra.apiUrl
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://f-b-r0iq.onrender.com',
    eas: {
      projectId: '7ab6b01a-8803-4365-a807-1b99f2396b2b',
    },
  },
});
