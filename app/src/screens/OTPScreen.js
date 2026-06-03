import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { colors } from '../theme';
import ScreenContainer from '../components/ScreenContainer';
import { useAuth } from '../auth/AuthContext';

const OTP_LENGTH = 6;

export default function OTPScreen({ navigation, route }) {
  const { confirmOtp, sendOtp } = useAuth();
  const { phoneNumber, isNewUser } = route.params;

  const [digits, setDigits]     = useState(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading]   = useState(false);
  const [resending, setResending] = useState(false);
  const inputRefs               = useRef([]);

  const handleChange = (text, index) => {
    const cleaned = text.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = cleaned;
    setDigits(next);

    if (cleaned && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = ({ nativeEvent }, index) => {
    if (nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = digits.join('');
    if (code.length < OTP_LENGTH) {
      Alert.alert('Incomplete code', `Please enter all ${OTP_LENGTH} digits.`);
      return;
    }

    setLoading(true);
    try {
      await confirmOtp(phoneNumber, code);
      if (isNewUser) {
        navigation.replace('Register', { phoneNumber });
      } else {
        navigation.replace('MainTabs');
      }
    } catch (error) {
      Alert.alert('Verification failed', error.message ?? 'Invalid OTP. Please try again.');
      setDigits(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await sendOtp(phoneNumber);
      setDigits(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
      Alert.alert('OTP Sent', 'A new OTP has been sent to your number.');
    } catch (error) {
      Alert.alert('Failed to resend', error.message ?? 'Please try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <ScreenContainer backgroundColor={colors.background} centered>
      <Text style={styles.title}>OTP Verification</Text>
      <Text style={styles.sub}>Enter the 6-digit code sent to</Text>
      <Text style={styles.phone}>{phoneNumber}</Text>

      <View style={styles.otpRow}>
        {digits.map((digit, i) => (
          <TextInput
            key={i}
            ref={(ref) => { inputRefs.current[i] = ref; }}
            style={[styles.otp, digit ? styles.otpFilled : null]}
            value={digit}
            onChangeText={(text) => handleChange(text, i)}
            onKeyPress={(e) => handleKeyPress(e, i)}
            maxLength={1}
            keyboardType="number-pad"
            selectTextOnFocus
          />
        ))}
      </View>

      <TouchableOpacity
        style={[styles.verify, loading && styles.verifyDisabled]}
        onPress={handleVerify}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.verifyText}>Verify</Text>}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.resend}
        onPress={handleResend}
        disabled={resending}
      >
        {resending
          ? <ActivityIndicator color={colors.primary} size="small" />
          : <Text style={styles.resendText}>Resend OTP</Text>}
      </TouchableOpacity>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title:          { fontSize: 24, fontWeight: '700', color: colors.text, marginTop: 12 },
  sub:            { color: colors.muted, marginTop: 8 },
  phone:          { color: colors.text, fontWeight: '600', marginTop: 4 },
  otpRow:         { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28, gap: 8 },
  otp:            { width: 46, height: 54, borderRadius: 12, backgroundColor: '#fff', textAlign: 'center', fontSize: 22, fontWeight: '700', borderWidth: 1.5, borderColor: '#EFE7E4' },
  otpFilled:      { borderColor: colors.primary },
  verify:         { marginTop: 30, backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 48, borderRadius: 28, alignItems: 'center' },
  verifyDisabled: { opacity: 0.6 },
  verifyText:     { color: '#fff', fontWeight: '700', fontSize: 16 },
  resend:         { marginTop: 16, padding: 10 },
  resendText:     { color: colors.primary, fontWeight: '600' },
});
