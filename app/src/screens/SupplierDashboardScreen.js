import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenContainer from '../components/ScreenContainer';
import { colors } from '../theme';
import { useAuth } from '../auth/AuthContext';
import { fetchStock, addStock, setStock } from '../backend/freshBasketBackend';

export default function SupplierDashboardScreen({ navigation }) {
  const { phoneNumber } = useAuth();
  const supplierId = phoneNumber ? phoneNumber.replace(/\D/g, '') : null;

  const [stock, setStockData]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing]     = useState(null); // productId being edited
  const [addAmount, setAddAmount] = useState('');
  const [saving, setSaving]       = useState(false);

  const loadStock = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchStock();
      setStockData(data);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadStock(); }, [loadStock]);

  const onRefresh = () => { setRefreshing(true); loadStock(true); };

  const handleAddStock = async (productId) => {
    const amount = parseFloat(addAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a positive number.');
      return;
    }
    setSaving(true);
    try {
      await addStock(productId, amount, supplierId);
      await loadStock(true);
      setEditing(null);
      setAddAmount('');
      Alert.alert('✅ Stock updated', `Added ${amount} units successfully.`);
    } catch (err) {
      Alert.alert('Failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const lowStockCount  = stock.filter((s) => s.quantity <= s.minThreshold).length;
  const totalProducts  = stock.length;
  const totalUnits     = stock.reduce((sum, s) => sum + s.quantity, 0);

  return (
    <ScreenContainer backgroundColor="#F7F2EC">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {/* Header */}
        <Text style={styles.kicker}>Supplier</Text>
        <Text style={styles.title}>Stock Management</Text>
        <Text style={styles.subtitle}>Add stock for each product. Pull down to refresh.</Text>

        {/* Summary cards */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{totalProducts}</Text>
            <Text style={styles.metricLabel}>Products</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{totalUnits}</Text>
            <Text style={styles.metricLabel}>Total Units</Text>
          </View>
          <View style={[styles.metricCard, lowStockCount > 0 && styles.metricCardAlert]}>
            <Text style={[styles.metricValue, lowStockCount > 0 && { color: '#D32F2F' }]}>{lowStockCount}</Text>
            <Text style={styles.metricLabel}>Low Stock</Text>
          </View>
        </View>

        {/* Stock list */}
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : (
          stock.map((item) => {
            const isLow      = item.quantity <= item.minThreshold;
            const isEditing  = editing === item.productId;

            return (
              <View key={item.productId} style={[styles.stockCard, isLow && styles.stockCardLow]}>
                <View style={styles.stockHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.productName}>{item.productTitle}</Text>
                    {item.lastRestockedAt && (
                      <Text style={styles.lastRestocked}>
                        Last restocked: {new Date(item.lastRestockedAt).toLocaleDateString('en-IN')}
                      </Text>
                    )}
                  </View>
                  <View style={styles.stockBadge}>
                    {isLow && <Ionicons name="warning-outline" size={14} color="#D32F2F" style={{ marginRight: 4 }} />}
                    <Text style={[styles.stockQty, isLow && { color: '#D32F2F' }]}>
                      {item.quantity} {item.unit}
                    </Text>
                  </View>
                </View>

                {/* Stock level bar */}
                <View style={styles.barBg}>
                  <View style={[
                    styles.barFill,
                    { width: `${Math.min((item.quantity / Math.max(item.minThreshold * 3, 1)) * 100, 100)}%` },
                    isLow && { backgroundColor: '#D32F2F' },
                  ]} />
                </View>

                {/* Add stock form */}
                {isEditing ? (
                  <View style={styles.editRow}>
                    <TextInput
                      style={styles.amountInput}
                      placeholder="Amount to add"
                      keyboardType="numeric"
                      value={addAmount}
                      onChangeText={setAddAmount}
                      autoFocus
                    />
                    <TouchableOpacity
                      style={[styles.addBtn, saving && { opacity: 0.6 }]}
                      onPress={() => handleAddStock(item.productId)}
                      disabled={saving}
                    >
                      {saving
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={styles.addBtnText}>Add</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cancelBtn} onPress={() => { setEditing(null); setAddAmount(''); }}>
                      <Ionicons name="close" size={18} color={colors.muted} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.restockBtn}
                    onPress={() => { setEditing(item.productId); setAddAmount(''); }}
                  >
                    <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                    <Text style={styles.restockBtnText}>Add Stock</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}

        <TouchableOpacity style={styles.switchBtn} onPress={() => navigation.navigate('DashboardHub')}>
          <Text style={styles.switchBtnText}>Switch Dashboard</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  kicker:          { color: colors.primary, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  title:           { fontSize: 26, fontWeight: '800', color: '#1A1A1A', marginTop: 4 },
  subtitle:        { color: '#888', marginTop: 6, marginBottom: 16, lineHeight: 20 },

  metricsRow:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  metricCard:      { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, marginHorizontal: 4, elevation: 1, alignItems: 'center' },
  metricCardAlert: { backgroundColor: '#FFF3F3' },
  metricValue:     { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },
  metricLabel:     { color: '#888', fontSize: 11, marginTop: 2 },

  stockCard:       { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 1 },
  stockCardLow:    { borderLeftWidth: 4, borderLeftColor: '#D32F2F' },
  stockHeader:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  productName:     { fontWeight: '700', color: '#1A1A1A', fontSize: 15 },
  lastRestocked:   { color: '#888', fontSize: 11, marginTop: 2 },
  stockBadge:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F0EB', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  stockQty:        { fontWeight: '700', color: '#1A1A1A', fontSize: 14 },

  barBg:           { height: 6, backgroundColor: '#F0EAE6', borderRadius: 3, marginBottom: 12 },
  barFill:         { height: 6, backgroundColor: colors.primary, borderRadius: 3 },

  editRow:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
  amountInput:     { flex: 1, backgroundColor: '#F7F3F1', borderRadius: 10, padding: 10, fontSize: 15, borderWidth: 1, borderColor: '#EFE7E4' },
  addBtn:          { backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  addBtnText:      { color: '#fff', fontWeight: '700' },
  cancelBtn:       { padding: 8 },

  restockBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  restockBtnText:  { color: colors.primary, fontWeight: '600' },

  switchBtn:       { marginTop: 8, padding: 14, borderRadius: 28, borderWidth: 1, borderColor: colors.primary, alignItems: 'center' },
  switchBtnText:   { color: colors.primary, fontWeight: '700' },
});
