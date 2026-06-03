import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { colors } from '../theme';
import ScreenContainer from '../components/ScreenContainer';
import { useAuth } from '../auth/AuthContext';

export default function ProfileScreen({ navigation }) {
  const { signOut, phoneNumber, userProfile, updateProfile } = useAuth();

  const [isEditing, setIsEditing]     = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity]               = useState('');
  const [pincode, setPincode]         = useState('');
  const [saving, setSaving]           = useState(false);

  // Sync local state whenever userProfile changes
  useEffect(() => {
    setDisplayName(userProfile?.displayName ?? '');
    setAddressLine(userProfile?.addressLine ?? '');
    setCity(userProfile?.city ?? '');
    setPincode(userProfile?.pincode ?? '');
  }, [userProfile]);

  const handleEdit = () => setIsEditing(true);

  const handleCancel = () => {
    // Reset fields back to saved values
    setDisplayName(userProfile?.displayName ?? '');
    setAddressLine(userProfile?.addressLine ?? '');
    setCity(userProfile?.city ?? '');
    setPincode(userProfile?.pincode ?? '');
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      Alert.alert('Name required', 'Please enter your display name.');
      return;
    }
    if (pincode && !/^\d{6}$/.test(pincode)) {
      Alert.alert('Invalid pincode', 'Pincode must be 6 digits.');
      return;
    }

    setSaving(true);
    try {
      await updateProfile({
        displayName: displayName.trim(),
        addressLine: addressLine.trim(),
        city:        city.trim(),
        pincode:     pincode.trim(),
        // Keep the combined address string in sync for display elsewhere
        address:     [addressLine.trim(), city.trim(), pincode.trim()]
                       .filter(Boolean).join(', '),
      });
      setIsEditing(false);
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch (error) {
      Alert.alert('Update failed', error.message ?? 'Unable to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigation.replace('Login');
  };

  const avatarLetter = (displayName || phoneNumber || 'F').trim().charAt(0).toUpperCase();

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar */}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{avatarLetter}</Text>
        </View>
        <Text style={styles.title}>
  {displayName
    ? displayName.charAt(0).toUpperCase() + displayName.slice(1).toLowerCase()
    : 'My Profile'}
</Text>
        <Text style={styles.sub}>{phoneNumber ?? ''}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{userProfile?.role ?? 'customer'}</Text>
        </View>

        {/* Form card */}
        <View style={styles.card}>
          {isEditing ? (
            <>
              <Field label="Full Name">
                <TextInput
                  style={styles.input}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Your name"
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </Field>

              <Field label="House / Flat / Street">
                <TextInput
                  style={styles.input}
                  value={addressLine}
                  onChangeText={setAddressLine}
                  placeholder="e.g. 12B, MG Road"
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </Field>

              <Field label="City">
                <TextInput
                  style={styles.input}
                  value={city}
                  onChangeText={setCity}
                  placeholder="e.g. Hyderabad"
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </Field>

              <Field label="Pincode">
                <TextInput
                  style={styles.input}
                  value={pincode}
                  onChangeText={setPincode}
                  placeholder="e.g. 500034"
                  keyboardType="number-pad"
                  maxLength={6}
                  returnKeyType="done"
                />
              </Field>

              <TouchableOpacity
                style={[styles.primaryBtn, saving && styles.btnDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.primaryBtnText}>Save Changes</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={handleCancel}
                disabled={saving}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <InfoRow label="Name"    value={displayName  || 'Not set'} />
              <InfoRow label="Street"  value={addressLine  || 'Not set'} />
              <InfoRow label="City"    value={city         || 'Not set'} />
              <InfoRow label="Pincode" value={pincode      || 'Not set'} />

              <TouchableOpacity style={styles.primaryBtn} onPress={handleEdit}>
                <Text style={styles.primaryBtnText}>Edit Profile</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Small helper components ───────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={fieldStyles.label}>{label}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={fieldStyles.row}>
      <Text style={fieldStyles.label}>{label}</Text>
      <Text style={fieldStyles.value}>{value}</Text>
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  value: { fontSize: 15, color: colors.text, paddingVertical: 2 },
  row:   { marginTop: 14, borderBottomWidth: 1, borderBottomColor: '#F0EAE6', paddingBottom: 10 },
});

const styles = StyleSheet.create({
  flex:           { flex: 1, backgroundColor: colors.background },
  content:        { padding: 20, paddingBottom: 40, alignItems: 'center' },

  avatar:         { width: 88, height: 88, borderRadius: 44, backgroundColor: '#E8D6CD', marginTop: 16, marginBottom: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText:     { fontSize: 32, fontWeight: '800', color: colors.text },
  title:          { fontSize: 22, fontWeight: '700', color: colors.text },
  sub:            { fontSize: 14, color: colors.muted, marginTop: 4 },
  roleBadge:      { marginTop: 8, backgroundColor: '#FFF0E8', paddingHorizontal: 14, paddingVertical: 4, borderRadius: 20 },
  roleText:       { color: colors.primary, fontWeight: '700', fontSize: 13, textTransform: 'capitalize' },

  card:           { width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 18, marginTop: 20, elevation: 2 },
  input:          { backgroundColor: '#F7F3F1', borderRadius: 10, padding: 12, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: '#EFE7E4' },

  primaryBtn:     { marginTop: 20, backgroundColor: colors.primary, paddingVertical: 13, borderRadius: 28, alignItems: 'center' },
  btnDisabled:    { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  secondaryBtn:     { marginTop: 10, paddingVertical: 13, borderRadius: 28, borderWidth: 1, borderColor: colors.primary, alignItems: 'center' },
  secondaryBtnText: { color: colors.primary, fontWeight: '700', fontSize: 15 },

  logoutBtn:      { marginTop: 16, width: '100%', paddingVertical: 13, borderRadius: 28, borderWidth: 1, borderColor: '#E0D0CA', alignItems: 'center' },
  logoutBtnText:  { color: colors.muted, fontWeight: '700', fontSize: 15 },
});
