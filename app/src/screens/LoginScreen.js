import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  TouchableOpacity, Image, Alert, ActivityIndicator,
} from 'react-native';
import { colors } from '../theme';
import ScreenContainer from '../components/ScreenContainer';
import { useAuth } from '../auth/AuthContext';
import { checkUserExists } from '../backend/freshBasketBackend';

export default function LoginScreen({ navigation }) {
  const { } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    const digits = phoneNumber.replace(/\D/g, '');
    if (digits.length !== 10) {
      Alert.alert('Invalid number', 'Please enter a valid 10-digit mobile number.');
      return;
    }

    const fullPhone = `+91${digits}`;
    setLoading(true);
    try {
      const exists = await checkUserExists(fullPhone);
      // OTP sending skipped — bypass mode
      navigation.navigate('OTP', {
        phoneNumber: fullPhone,
        isNewUser: !exists,
      });
    } catch (error) {
      Alert.alert('Error', error.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer backgroundColor={colors.background} centered>
      <Text style={styles.brand}>Fresh Basket</Text>
      <Image
        source={{ uri: 'https://via.placeholder.com/800x360.png?text=Hero' }}
        style={styles.hero}
        resizeMode="cover"
      />
      <View style={styles.card}>
        <Text style={styles.header}>Fresh Batter, At Your Door Step.</Text>
        <Text style={styles.label}>Phone Number</Text>
        <View style={styles.row}>
          <Text style={styles.country}>+91</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter 10-digit number"
            keyboardType="phone-pad"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            maxLength={10}
          />
        </View>
        <TouchableOpacity
          style={[styles.otpButton, loading && styles.otpButtonDisabled]}
          onPress={handleSendOtp}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.otpButtonText}>Send OTP</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dashboardButton}
          onPress={() => navigation.navigate('DashboardHub')}
        >
          <Text style={styles.dashboardButtonText}>Open Dashboards</Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  brand:               { fontSize: 22, fontWeight: '700', marginTop: 12, color: colors.primary },
  hero:                { width: '100%', height: 220, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  card:                { marginTop: -40, padding: 18, backgroundColor: '#fff', borderRadius: 16, elevation: 2 },
  header:              { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 },
  label:               { color: colors.muted, marginTop: 8 },
  row:                 { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  country:             { padding: 12, backgroundColor: '#F2F6FF', borderTopLeftRadius: 8, borderBottomLeftRadius: 8 },
  input:               { flex: 1, padding: 12, backgroundColor: '#EEF5FF', borderTopRightRadius: 8, borderBottomRightRadius: 8 },
  otpButton:           { marginTop: 16, backgroundColor: colors.primary, padding: 14, borderRadius: 28, alignItems: 'center' },
  otpButtonDisabled:   { opacity: 0.6 },
  otpButtonText:       { color: '#fff', fontWeight: '700' },
  dashboardButton:     { marginTop: 12, padding: 14, borderRadius: 28, alignItems: 'center', borderWidth: 1, borderColor: colors.primary, backgroundColor: '#fff' },
  dashboardButtonText: { color: colors.primary, fontWeight: '700' },
});
