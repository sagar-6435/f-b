import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';

export default function DesignSystemScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Design System</Text>
      <View style={styles.row}>
        <View style={[styles.swatch, { backgroundColor: colors.primary }]} />
        <View style={[styles.swatch, { backgroundColor: colors.green }]} />
        <View style={[styles.swatch, { backgroundColor: colors.background }]} />
      </View>
      <Text style={styles.note}>Typography, spacing and components live here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 22, backgroundColor: '#fff' },
  h1: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  row: { flexDirection: 'row', gap: 12 },
  swatch: { width: 64, height: 64, borderRadius: 8, marginRight: 12 },
  note: { color: colors.muted, marginTop: 12 }
});
