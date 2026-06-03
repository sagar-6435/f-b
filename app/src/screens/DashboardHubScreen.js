import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import { colors } from '../theme';

const roles = [
  {
    title: 'Admin Dashboard',
    subtitle: 'Orders, users, inventory, and reports',
    route: 'AdminDashboard',
    params: undefined,
  },
  {
    title: 'Supplier Dashboard',
    subtitle: 'Stock levels, restock requests, and supply flow',
    route: 'SupplierDashboard',
    params: undefined,
  },
  {
    title: 'Delivery Boy Dashboard',
    subtitle: 'Assigned drops, routes, and delivery status — Arjun Singh',
    route: 'DeliveryDashboard',
    // Opens the +919876543210 (Arjun Singh) delivery account
    params: { partnerId: '919876543210', partnerName: 'Arjun Singh' },
  },
];

export default function DashboardHubScreen({ navigation }) {
  return (
    <ScreenContainer backgroundColor="#FFF8F4">
      <Text style={styles.title}>Choose a dashboard</Text>
      <Text style={styles.subtitle}>Jump directly into the role view you want to manage.</Text>

      {roles.map((item) => (
        <TouchableOpacity
          key={item.route}
          style={styles.card}
          onPress={() => navigation.navigate(item.route, item.params)}
        >
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
          </View>
          <Text style={styles.go}>Open</Text>
        </TouchableOpacity>
      ))}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 8 },
  subtitle: { color: colors.muted, marginBottom: 18, lineHeight: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 2,
  },
  cardText: { flex: 1, paddingRight: 10 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4 },
  cardSubtitle: { color: colors.muted, lineHeight: 18 },
  go: { color: colors.primary, fontWeight: '700' },
});