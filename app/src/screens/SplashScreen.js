import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ImageBackground, Image } from 'react-native';
import { colors } from '../theme';
import { useAuth } from '../auth/AuthContext';

export default function SplashScreen({ navigation }) {
  const { isReady, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isReady) {
      return undefined;
    }

    const timer = setTimeout(() => {
      navigation.replace(isAuthenticated ? 'MainTabs' : 'Login');
    }, 2000);

    return () => clearTimeout(timer);
  }, [isReady, isAuthenticated, navigation]);

  return (
    <ImageBackground style={styles.bg} source={{ uri: 'https://via.placeholder.com/800x1400.png?text=Splash+BG' }}>
      <View style={styles.center}>
        <Image source={require('../../icon.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>Fresh Basket</Text>
        <Text style={styles.subtitle}>Fresh Basket, Delivered Daily</Text>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, justifyContent: 'center', backgroundColor: colors.background },
  center: { alignItems: 'center', padding: 24 },
  logo: { width: 96, height: 96, marginBottom: 18 },
  title: { fontSize: 28, color: colors.text, fontWeight: '700' },
  subtitle: { fontSize: 16, color: colors.muted, marginVertical: 12 },
});
