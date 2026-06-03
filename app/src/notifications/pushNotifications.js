import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { api } from '../api/client';

// FCM sender ID from google-services.json → project_number
const FCM_SENDER_ID = '36557887262';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function configureNotificationChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#F16500',
    });
  }
}

export async function registerForPushNotificationsAsync() {
  // Skip in Expo Go — FCM tokens only work in standalone builds
  if (Constants.executionEnvironment === 'storeClient') {
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Notification permission not granted');
    return null;
  }

  // Pass FCM sender ID so expo-notifications gets a proper FCM token in standalone APKs
  const token = await Notifications.getDevicePushTokenAsync({
    projectId: FCM_SENDER_ID,
  });
  return token.data;
}

export async function syncDevicePushToken(userId) {
  if (!userId) return null;

  try {
    await configureNotificationChannel();
    const deviceToken = await registerForPushNotificationsAsync();
    if (!deviceToken) return null;

    // Persist FCM token to MongoDB via the API
    await api.put(`/users/${userId}`, {
      fcmToken:             deviceToken,
      notificationPlatform: Platform.OS,
      notificationUpdatedAt: new Date().toISOString(),
    });

    return deviceToken;
  } catch (err) {
    console.warn('syncDevicePushToken failed:', err.message);
    return null;
  }
}
