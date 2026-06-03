import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { colors } from '../theme';
import { useAuth } from '../auth/AuthContext';

export default function RegisterScreen({ navigation, route }) {
  const { phoneNumber } = route.params;
  const { updateProfile } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity]               = useState('');
  const [pincode, setPincode]         = useState('');
  const [loading, setLoading]         = useState(false);

  const handleSave = async () => {
    if (!displayName.trim()) {
      Alert.alert('Name required', 'Please enter your full name.');
      return;
    }
    if (!addressLine.trim() || !city.trim() || !pincode.trim()) {
      Alert.alert('Address required', 'Please fill in all address fields.');
      return;
    }
    if (!/^\d{6}$/.test(pincode)) {
      Alert.alert('Invalid pincode', 'Pincode must be 6 digits.');
      return;
    }

    const address = `${addressLine.trim()}, ${city.trim()} - ${pincode.trim()}`;

    setLoading(true);
    try {
      await updateProfile({
        displayName: displayName.trim(),
        address,
        addressLine: addressLine.trim(),
        city:        city.trim(),
        pincode:     pincode.trim(),
        role: 'customer',
      });
      navigation.replace('MainTabs');
    } catch (error) {
      Alert.alert('Could not save profile', error.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.emoji}>👋</Text>
          <Text style={styles.title}>Welcome to Fresh Basket</Text>
          <Text style={styles.sub}>
            Just a few details and you're all set.
          </Text>
          <View style={styles.phoneBadge}>
            <Text style={styles.phoneText}>{phoneNumber}</Text>
          </View>
        </View>

        {/* Form */}
        <View style={styles.card}>
          {/* Name */}
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Sagar Naidu"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
            returnKeyType="next"
          />

          {/* Address */}
          <Text style={[styles.label, styles.sectionLabel]}>Delivery Address</Text>

          <Text style={styles.sublabel}>House / Flat / Street</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 12B, MG Road, Banjara Hills"
            value={addressLine}
            onChangeText={setAddressLine}
            autoCapitalize="words"
            returnKeyType="next"
          />

          <Text style={styles.sublabel}>City</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Hyderabad"
            value={city}
            onChangeText={setCity}
            autoCapitalize="words"
            returnKeyType="next"
          />

          <Text style={styles.sublabel}>Pincode</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 500034"
            value={pincode}
            onChangeText={setPincode}
            keyboardType="number-pad"
            maxLength={6}
            returnKeyType="done"
          />

          <TouchableOpacity
            style={[styles.saveButton, loading && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveButtonText}>Create Account</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:             { flex: 1, backgroundColor: colors.background },
  container:        { flexGrow: 1, padding: 20 },

  header:           { alignItems: 'center', paddingVertical: 32 },
  emoji:            { fontSize: 40, marginBottom: 8 },
  title:            { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center' },
  sub:              { color: colors.muted, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  phoneBadge:       { marginTop: 12, backgroundColor: '#FFF0E8', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  phoneText:        { color: colors.primary, fontWeight: '600', fontSize: 14 },

  card:             { backgroundColor: '#fff', borderRadius: 16, padding: 20, elevation: 2 },
  label:            { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 8 },
  sectionLabel:     { marginTop: 20 },
  sublabel:         { fontSize: 13, color: colors.muted, marginBottom: 4, marginTop: 12 },
  input:            {
    backgroundColor: '#F7F3F1',
    borderRadius: 10,
    padding: 13,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: '#EFE7E4',
  },

  saveButton:       { marginTop: 28, backgroundColor: colors.primary, padding: 15, borderRadius: 28, alignItems: 'center' },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText:   { color: '#fff', fontWeight: '700', fontSize: 16 },
});
