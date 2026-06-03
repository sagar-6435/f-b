import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, TouchableOpacity, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import ScreenContainer from '../components/ScreenContainer';
import { useAuth } from '../auth/AuthContext';
import { fetchOrders } from '../backend/freshBasketBackend';

const STATUS_CONFIG = {
  Placed:         { label: 'Order Placed',        color: '#F57C00', icon: 'receipt-outline' },
  Confirmed:      { label: 'Confirmed',            color: '#1976D2', icon: 'checkmark-circle-outline' },
  Preparing:      { label: 'Preparing',            color: '#7B1FA2', icon: 'restaurant-outline' },
  Ready:          { label: 'Ready for Pickup',     color: '#00796B', icon: 'bag-check-outline' },
  Assigned:       { label: 'Partner Assigned',     color: '#0288D1', icon: 'bicycle-outline' },
  OutForDelivery: { label: 'Out for Delivery',     color: '#2E7D32', icon: 'navigate-outline' },
  Delivered:      { label: 'Delivered',            color: '#388E3C', icon: 'checkmark-done-circle-outline' },
  Cancelled:      { label: 'Cancelled',            color: '#D32F2F', icon: 'close-circle-outline' },
};

const STATUS_STEPS = ['Placed','Confirmed','Preparing','Ready','Assigned','OutForDelivery','Delivered'];

export default function OrdersScreen() {
  const { phoneNumber } = useAuth();
  const [orders, setOrders]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded]   = useState(null);
  const userId = phoneNumber ? phoneNumber.replace(/\D/g, '') : null;

  const loadOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchOrders(userId);
      setOrders(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // Auto-refresh every 15s for live status updates
  useEffect(() => {
    const interval = setInterval(() => loadOrders(true), 15000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  const onRefresh = () => { setRefreshing(true); loadOrders(true); };

  return (
    <ScreenContainer backgroundColor={colors.background}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <Text style={styles.title}>My Orders</Text>
        <Text style={styles.sub}>Pull down to refresh</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loading} />
        ) : orders.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="clipboard-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={styles.emptyText}>Your placed orders will appear here.</Text>
          </View>
        ) : (
          orders.map((order) => {
            const cfg        = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.Placed;
            const isExpanded = expanded === order._id;
            const stepIndex  = STATUS_STEPS.indexOf(order.status);

            return (
              <TouchableOpacity
                key={order._id}
                style={styles.card}
                onPress={() => setExpanded(isExpanded ? null : order._id)}
                activeOpacity={0.85}
              >
                {/* Header row */}
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.orderId}>Order #{String(order._id).slice(-6).toUpperCase()}</Text>
                    <Text style={styles.orderDate}>{new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: cfg.color + '20' }]}>
                    <Ionicons name={cfg.icon} size={14} color={cfg.color} />
                    <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>

                {/* Progress bar (not for cancelled) */}
                {order.status !== 'Cancelled' && (
                  <View style={styles.progressRow}>
                    {STATUS_STEPS.map((step, i) => (
                      <View
                        key={step}
                        style={[
                          styles.progressDot,
                          i <= stepIndex && { backgroundColor: cfg.color },
                          i < STATUS_STEPS.length - 1 && styles.progressLine,
                          i < stepIndex && { borderColor: cfg.color },
                        ]}
                      />
                    ))}
                  </View>
                )}

                {/* Summary */}
                <View style={styles.cardSummary}>
                  <Text style={styles.itemCount}>{order.items?.length ?? 0} item(s)</Text>
                  <Text style={styles.orderTotal}>₹{order.totalAmount}</Text>
                </View>

                {/* Expanded details */}
                {isExpanded && (
                  <View style={styles.details}>
                    {order.items?.map((item, idx) => (
                      <View key={idx} style={styles.detailRow}>
                        <Text style={styles.detailName} numberOfLines={1}>{item.title}</Text>
                        <Text style={styles.detailQty}>×{item.quantity}</Text>
                        <Text style={styles.detailPrice}>₹{item.totalPrice}</Text>
                      </View>
                    ))}
                    {order.deliveryPartnerName && (
                      <View style={styles.partnerRow}>
                        <Ionicons name="bicycle-outline" size={14} color={colors.primary} />
                        <Text style={styles.partnerText}>Delivery: {order.deliveryPartnerName}</Text>
                      </View>
                    )}
                    {order.deliveryAddress ? (
                      <View style={styles.partnerRow}>
                        <Ionicons name="location-outline" size={14} color={colors.muted} />
                        <Text style={styles.partnerText}>{order.deliveryAddress}</Text>
                      </View>
                    ) : null}
                  </View>
                )}

                <View style={styles.expandHint}>
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title:        { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 2 },
  sub:          { fontSize: 12, color: colors.muted, marginBottom: 12 },
  loading:      { marginTop: 20 },

  emptyCard:    { alignItems: 'center', backgroundColor: '#fff', padding: 32, borderRadius: 16, marginTop: 20 },
  emptyTitle:   { fontWeight: '700', color: colors.text, fontSize: 18, marginTop: 12 },
  emptyText:    { color: colors.muted, marginTop: 4 },

  card:         { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 1 },
  cardHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  orderId:      { fontWeight: '700', color: colors.text, fontSize: 15 },
  orderDate:    { color: colors.muted, fontSize: 12, marginTop: 2 },
  statusBadge:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, gap: 4 },
  statusText:   { fontSize: 12, fontWeight: '700' },

  progressRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  progressDot:  { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E0D0CA', flex: 1, marginHorizontal: 1 },
  progressLine: { borderRightWidth: 0 },

  cardSummary:  { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#F0EAE6', paddingTop: 10 },
  itemCount:    { color: colors.muted, fontSize: 13 },
  orderTotal:   { fontWeight: '700', color: colors.primary, fontSize: 15 },

  details:      { marginTop: 12, borderTopWidth: 1, borderTopColor: '#F0EAE6', paddingTop: 10 },
  detailRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  detailName:   { flex: 1, color: colors.text, fontSize: 13 },
  detailQty:    { color: colors.muted, fontSize: 13, marginHorizontal: 8 },
  detailPrice:  { color: colors.primary, fontWeight: '600', fontSize: 13 },
  partnerRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  partnerText:  { color: colors.muted, fontSize: 12, flex: 1 },

  expandHint:   { alignItems: 'center', marginTop: 8 },
});
