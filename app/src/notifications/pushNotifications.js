import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { api } from '../api/client';

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
    throw new Error('Notification permission not granted');
  }

  const token = await Notifications.getDevicePushTokenAsync();
  return token.data;
}

export async function syncDevicePushToken(userId) {
  if (!userId) return null;

  await configureNotificationChannel();
  const deviceToken = await registerForPushNotificationsAsync();

  if (!deviceToken) return null;

  // Persist FCM token to MongoDB via the API
  await api.put(`/users/${userId}`, {
    fcmToken: deviceToken,
    notificationPlatform: Platform.OS,
    notificationUpdatedAt: new Date().toISOString(),
  });

  return deviceToken;
}
