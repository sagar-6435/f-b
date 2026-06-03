import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Modal, Vibration, Switch, Linking, Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import ScreenContainer from '../components/ScreenContainer';
import { colors } from '../theme';
import { useAuth } from '../auth/AuthContext';
import {
  fetchNearbyOrders, updateOrderStatus,
  fetchAllOrders, setOnlineStatus,
} from '../backend/freshBasketBackend';

const STATUS_LABELS = {
  Placed:         'New Order',
  Confirmed:      'Confirmed',
  Preparing:      'Preparing',
  Ready:          'Ready',
  Assigned:       'Assigned to You',
  OutForDelivery: 'Out for Delivery',
  Delivered:      'Delivered',
  Cancelled:      'Cancelled',
};

const POLL_INTERVAL_MS = 20000; // 20 seconds

/**
 * Opens the device's native maps app and navigates to the delivery address.
 * Prefers coordinates when available (more accurate), falls back to text address.
 */
function openMaps(order) {
  const lat  = order.customerLocation?.latitude;
  const lng  = order.customerLocation?.longitude;
  const addr = order.deliveryAddress;

  let url;

  if (lat && lng) {
    // Coordinates — works on both Android (Google Maps) and iOS (Apple Maps)
    if (Platform.OS === 'ios') {
      url = `maps://app?daddr=${lat},${lng}`;
    } else {
      url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    }
  } else if (addr) {
    const encoded = encodeURIComponent(addr);
    if (Platform.OS === 'ios') {
      url = `maps://app?daddr=${encoded}`;
    } else {
      url = `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`;
    }
  } else {
    Alert.alert('No address', 'This order has no delivery address or location.');
    return;
  }

  Linking.openURL(url).catch(() => {
    // Google Maps app not installed — fall back to browser
    if (lat && lng) {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`);
    } else {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`);
    }
  });
}

export default function DeliveryDashboardScreen({ navigation, route }) {
  const { phoneNumber, userProfile } = useAuth();

  // If opened from admin hub with a specific account, use those params;
  // otherwise fall back to the currently logged-in delivery partner.
  const routePartnerId   = route?.params?.partnerId;
  const routePartnerName = route?.params?.partnerName;

  const partnerId   = routePartnerId   ?? (phoneNumber ? phoneNumber.replace(/\D/g, '') : null);
  const partnerName = routePartnerName ?? userProfile?.displayName ?? 'Delivery Partner';

  const [isOnline, setIsOnline]           = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [location, setLocation]           = useState(null);
  const [locationAddress, setLocationAddress] = useState('');   // human-readable
  const [locError, setLocError]           = useState(null);
  const [nearbyOrders, setNearbyOrders]   = useState([]);
  const [myOrders, setMyOrders]           = useState([]);
  const [loading, setLoading]             = useState(false);
  const [refreshing, setRefreshing]       = useState(false);
  const [incomingOrder, setIncomingOrder] = useState(null);
  const [accepting, setAccepting]         = useState(false);
  const [activeTab, setActiveTab]         = useState('incoming');
  const prevNearbyIds = useRef(new Set());
  const pollTimer     = useRef(null);

  // ── Get device location + reverse geocode ────────────────────────────────
  const getLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocError('Location permission denied.');
        return null;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setLocation(loc);
      setLocError(null);

      // Reverse geocode to get a readable address
      try {
        const [place] = await Location.reverseGeocodeAsync({
          latitude:  loc.latitude,
          longitude: loc.longitude,
        });
        if (place) {
          const parts = [
            place.name,
            place.street,
            place.district,
            place.city,
            place.region,
          ].filter(Boolean);
          // Use the most useful 2–3 parts to keep it concise
          const short = [place.street || place.name, place.city || place.district, place.region]
            .filter(Boolean)
            .slice(0, 3)
            .join(', ');
          setLocationAddress(short || parts.join(', '));
        }
      } catch {
        // Reverse geocode failed — fall back to coordinates display
        setLocationAddress(`${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`);
      }

      return loc;
    } catch {
      setLocError('Unable to get location.');
      return null;
    }
  }, []);

  // ── Load nearby + assigned orders ─────────────────────────────────────────
  const loadData = useCallback(async (silent = false) => {
    if (!isOnline) return;
    if (!silent) setLoading(true);
    try {
      // My assigned orders
      const assigned = await fetchAllOrders({ deliveryPartnerId: partnerId });
      setMyOrders(assigned.filter((o) => !['Delivered', 'Cancelled'].includes(o.status)));

      // Nearby unassigned orders
      if (location) {
        const nearby = await fetchNearbyOrders(location.latitude, location.longitude, 15);
        // Detect brand-new orders → show popup
        const newOrders = nearby.filter((o) => !prevNearbyIds.current.has(String(o._id)));
        if (newOrders.length > 0 && !incomingOrder) {
          Vibration.vibrate([0, 400, 100, 400]);
          setIncomingOrder(newOrders[0]);
        }
        prevNearbyIds.current = new Set(nearby.map((o) => String(o._id)));
        setNearbyOrders(nearby);
      }
    } catch (err) {
      if (!silent) Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isOnline, location, partnerId, incomingOrder]);

  // ── Start / stop polling based on online state ─────────────────────────────
  useEffect(() => {
    if (isOnline && location) {
      loadData();
      pollTimer.current = setInterval(() => loadData(true), POLL_INTERVAL_MS);
    } else {
      clearInterval(pollTimer.current);
      setNearbyOrders([]);
    }
    return () => clearInterval(pollTimer.current);
  }, [isOnline, location]);

  // ── Toggle online / offline ────────────────────────────────────────────────
  const handleToggleOnline = async (value) => {
    setTogglingOnline(true);
    try {
      let loc = location;
      if (value) {
        // Going online — get fresh location first
        loc = await getLocation();
        if (!loc) {
          Alert.alert('Location required', 'Enable location to go online.');
          setTogglingOnline(false);
          return;
        }
      }
      await setOnlineStatus(partnerId, value, loc);
      setIsOnline(value);
      if (!value) {
        // Clear state when going offline
        setNearbyOrders([]);
        setIncomingOrder(null);
        prevNearbyIds.current = new Set();
      }
    } catch (err) {
      Alert.alert('Failed', err.message);
    } finally {
      setTogglingOnline(false);
    }
  };

  const onRefresh = () => { setRefreshing(true); loadData(true); };

  // ── Accept order ──────────────────────────────────────────────────────────
  const handleAccept = async (order) => {
    setAccepting(true);
    try {
      await updateOrderStatus(order._id, 'Assigned', {
        deliveryPartnerId:   partnerId,
        deliveryPartnerName: partnerName,
      });
      setIncomingOrder(null);
      prevNearbyIds.current.add(String(order._id));
      await loadData(true);
      Alert.alert('✅ Accepted', `Order #${String(order._id).slice(-6).toUpperCase()} is now yours.`);
    } catch (err) {
      Alert.alert('Failed', err.message);
    } finally {
      setAccepting(false);
    }
  };

  const handleReject = () => {
    if (incomingOrder) prevNearbyIds.current.add(String(incomingOrder._id));
    setNearbyOrders((prev) => prev.filter((o) => String(o._id) !== String(incomingOrder?._id)));
    setIncomingOrder(null);
  };

  // ── Status progression ────────────────────────────────────────────────────
  const nextStatus = (current) => {
    const flow = ['Assigned', 'OutForDelivery', 'Delivered'];
    const idx  = flow.indexOf(current);
    return idx >= 0 && idx < flow.length - 1 ? flow[idx + 1] : null;
  };

  const handleStatusUpdate = async (order, newStatus) => {
    try {
      await updateOrderStatus(order._id, newStatus, {
        deliveryPartnerId:   partnerId,
        deliveryPartnerName: partnerName,
      });
      await loadData(true);
    } catch (err) {
      Alert.alert('Failed', err.message);
    }
  };

  const deliveredCount = myOrders.filter((o) => o.status === 'Delivered').length;
  const activeCount    = myOrders.filter((o) => o.status === 'OutForDelivery').length;

  return (
    <ScreenContainer backgroundColor="#F7F2EC">

      {/* ── Incoming order popup ─────────────────────────────────────────── */}
      <Modal visible={!!incomingOrder} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="notifications" size={28} color={colors.primary} />
              <Text style={styles.modalTitle}>New Order Nearby!</Text>
            </View>
            {incomingOrder && (
              <>
                <Text style={styles.modalOrderId}>
                  Order #{String(incomingOrder._id).slice(-6).toUpperCase()}
                </Text>
                <Text style={styles.modalAddress}>
                  📍 {incomingOrder.deliveryAddress || 'Address not available'}
                </Text>
                <Text style={styles.modalAmount}>₹{incomingOrder.totalAmount}</Text>
                <Text style={styles.modalItems}>
                  {incomingOrder.items?.length ?? 0} item(s) · {incomingOrder.customerName}
                </Text>
                {/* ── Navigate button ── */}
                <TouchableOpacity
                  style={styles.navigateBtn}
                  onPress={() => openMaps(incomingOrder)}
                >
                  <Ionicons name="navigate" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.navigateBtnText}>Navigate to Address</Text>
                </TouchableOpacity>
                <View style={styles.modalBtns}>
                  <TouchableOpacity style={styles.rejectBtn} onPress={handleReject} disabled={accepting}>
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.acceptBtn, accepting && { opacity: 0.6 }]}
                    onPress={() => handleAccept(incomingOrder)}
                    disabled={accepting}
                  >
                    {accepting
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.acceptBtnText}>Accept</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* ── Header row with online switch ──────────────────────────────── */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.kicker}>
              {routePartnerId ? `Viewing: ${partnerName}` : 'Delivery Partner'}
            </Text>
            <Text style={styles.title}>Route Dashboard</Text>
          </View>

          <View style={styles.onlineToggle}>
            {togglingOnline
              ? <ActivityIndicator color={colors.primary} size="small" style={{ marginRight: 8 }} />
              : null}
            <View style={[styles.onlineDot, isOnline && styles.onlineDotActive]} />
            <Text style={[styles.onlineLabel, isOnline && styles.onlineLabelActive]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
            <Switch
              value={isOnline}
              onValueChange={handleToggleOnline}
              disabled={togglingOnline}
              trackColor={{ false: '#D0C8C4', true: '#A5D6A7' }}
              thumbColor={isOnline ? '#2E7D32' : '#9E9E9E'}
              style={{ marginLeft: 6 }}
            />
          </View>
        </View>

        {/* ── Location row ──────────────────────────────────────────────── */}
        <View style={styles.locRow}>
          <Ionicons
            name={location ? 'location' : 'location-outline'}
            size={13}
            color={location ? '#2E7D32' : colors.muted}
          />
          <View style={{ flex: 1 }}>
            {locError ? (
              <Text style={[styles.locText, { color: '#D32F2F' }]}>{locError}</Text>
            ) : location ? (
              <>
                <Text style={styles.locAddress} numberOfLines={1}>
                  {locationAddress || 'Fetching address…'}
                </Text>
                <Text style={styles.locCoords}>
                  {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                </Text>
              </>
            ) : (
              <Text style={styles.locText}>Location not captured</Text>
            )}
          </View>
        </View>

        {/* ── Offline screen ─────────────────────────────────────────────── */}
        {!isOnline ? (
          <View style={styles.offlineCard}>
            <Ionicons name="power-outline" size={52} color="#BDBDBD" />
            <Text style={styles.offlineTitle}>You're Offline</Text>
            <Text style={styles.offlineText}>
              Toggle the switch above to go online and start receiving delivery orders near you.
            </Text>
            <TouchableOpacity
              style={[styles.goOnlineBtn, togglingOnline && { opacity: 0.6 }]}
              onPress={() => handleToggleOnline(true)}
              disabled={togglingOnline}
            >
              {togglingOnline
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.goOnlineBtnText}>Go Online</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── Metrics ─────────────────────────────────────────────── */}
            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{nearbyOrders.length}</Text>
                <Text style={styles.metricLabel}>Nearby</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{activeCount}</Text>
                <Text style={styles.metricLabel}>On Route</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{deliveredCount}</Text>
                <Text style={styles.metricLabel}>Delivered</Text>
              </View>
            </View>

            {/* ── Tabs ────────────────────────────────────────────────── */}
            <View style={styles.tabs}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'incoming' && styles.tabActive]}
                onPress={() => setActiveTab('incoming')}
              >
                <Text style={[styles.tabText, activeTab === 'incoming' && styles.tabTextActive]}>
                  Nearby ({nearbyOrders.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'active' && styles.tabActive]}
                onPress={() => setActiveTab('active')}
              >
                <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>
                  My Orders ({myOrders.length})
                </Text>
              </TouchableOpacity>
            </View>

            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
            ) : activeTab === 'incoming' ? (
              nearbyOrders.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="bicycle-outline" size={40} color={colors.muted} />
                  <Text style={styles.emptyText}>No nearby orders right now</Text>
                  <Text style={styles.emptySubText}>Checking every 20 seconds…</Text>
                </View>
              ) : (
                nearbyOrders.map((order) => (
                  <View key={order._id} style={styles.orderCard}>
                    <View style={styles.orderHeader}>
                      <Text style={styles.orderId}>#{String(order._id).slice(-6).toUpperCase()}</Text>
                      <Text style={styles.orderAmount}>₹{order.totalAmount}</Text>
                    </View>
                    <Text style={styles.orderAddress} numberOfLines={2}>
                      📍 {order.deliveryAddress || 'No address'}
                    </Text>
                    <Text style={styles.orderMeta}>
                      {order.items?.length ?? 0} item(s) · {order.customerName}
                    </Text>
                    <TouchableOpacity
                      style={styles.acceptOrderBtn}
                      onPress={() => setIncomingOrder(order)}
                    >
                      <Text style={styles.acceptOrderBtnText}>View & Accept</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )
            ) : (
              myOrders.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="checkmark-done-outline" size={40} color={colors.muted} />
                  <Text style={styles.emptyText}>No active orders</Text>
                </View>
              ) : (
                myOrders.map((order) => {
                  const next = nextStatus(order.status);
                  return (
                    <View key={order._id} style={styles.orderCard}>
                      <View style={styles.orderHeader}>
                        <Text style={styles.orderId}>#{String(order._id).slice(-6).toUpperCase()}</Text>
                        <View style={styles.statusPill}>
                          <Text style={styles.statusPillText}>
                            {STATUS_LABELS[order.status] ?? order.status}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.orderAddress} numberOfLines={2}>
                        📍 {order.deliveryAddress || 'No address'}
                      </Text>
                      <Text style={styles.orderMeta}>
                        {order.items?.length ?? 0} item(s) · ₹{order.totalAmount}
                      </Text>
                      {/* ── Navigate button ── */}
                      <TouchableOpacity
                        style={styles.navigateBtn}
                        onPress={() => openMaps(order)}
                      >
                        <Ionicons name="navigate" size={14} color="#fff" style={{ marginRight: 6 }} />
                        <Text style={styles.navigateBtnText}>Navigate</Text>
                      </TouchableOpacity>
                      {next && (
                        <TouchableOpacity
                          style={[styles.updateBtn, { marginTop: 8 }]}
                          onPress={() => handleStatusUpdate(order, next)}
                        >
                          <Text style={styles.updateBtnText}>
                            Mark as {STATUS_LABELS[next] ?? next}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )
            )}
          </>
        )}

        <TouchableOpacity style={styles.switchBtn} onPress={() => navigation.navigate('DashboardHub')}>
          <Text style={styles.switchBtnText}>Switch Dashboard</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  // Header
  headerRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  kicker:          { color: colors.primary, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 },
  title:           { fontSize: 24, fontWeight: '800', color: '#1A1A1A', marginTop: 2 },

  // Online toggle
  onlineToggle:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, elevation: 2 },
  onlineDot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: '#BDBDBD', marginRight: 6 },
  onlineDotActive: { backgroundColor: '#2E7D32' },
  onlineLabel:     { fontSize: 13, fontWeight: '700', color: '#9E9E9E' },
  onlineLabelActive: { color: '#2E7D32' },

  // Location
  locRow:          { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 8, marginBottom: 16 },
  locAddress:      { color: '#333', fontSize: 12, fontWeight: '600' },
  locCoords:       { color: '#AAA', fontSize: 10, marginTop: 1 },
  locText:         { color: '#888', fontSize: 11 },

  // Offline screen
  offlineCard:     { alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, padding: 36, marginTop: 8 },
  offlineTitle:    { fontSize: 20, fontWeight: '800', color: '#1A1A1A', marginTop: 14 },
  offlineText:     { color: '#888', textAlign: 'center', marginTop: 8, lineHeight: 20, marginBottom: 24 },
  goOnlineBtn:     { backgroundColor: '#2E7D32', paddingHorizontal: 36, paddingVertical: 14, borderRadius: 28 },
  goOnlineBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  // Metrics
  metricsRow:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  metricCard:      { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, marginHorizontal: 4, elevation: 1, alignItems: 'center' },
  metricValue:     { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },
  metricLabel:     { color: '#888', fontSize: 11, marginTop: 2 },

  // Tabs
  tabs:            { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, padding: 4, marginBottom: 14 },
  tab:             { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActive:       { backgroundColor: colors.primary },
  tabText:         { color: '#888', fontWeight: '600', fontSize: 13 },
  tabTextActive:   { color: '#fff' },

  // Empty states
  emptyCard:       { alignItems: 'center', backgroundColor: '#fff', padding: 32, borderRadius: 16 },
  emptyText:       { fontWeight: '700', color: '#1A1A1A', fontSize: 16, marginTop: 10 },
  emptySubText:    { color: '#888', marginTop: 4, fontSize: 12 },

  // Order cards
  orderCard:       { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 1 },
  orderHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  orderId:         { fontWeight: '700', color: '#1A1A1A', fontSize: 15 },
  orderAmount:     { fontWeight: '800', color: colors.primary, fontSize: 16 },
  orderAddress:    { color: '#555', fontSize: 13, marginBottom: 4 },
  orderMeta:       { color: '#888', fontSize: 12, marginBottom: 10 },
  statusPill:      { backgroundColor: '#FFF0E8', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusPillText:  { color: colors.primary, fontWeight: '700', fontSize: 12 },
  acceptOrderBtn:  { backgroundColor: '#2E7D32', paddingVertical: 10, borderRadius: 20, alignItems: 'center' },
  acceptOrderBtnText: { color: '#fff', fontWeight: '700' },
  updateBtn:       { backgroundColor: colors.primary, paddingVertical: 10, borderRadius: 20, alignItems: 'center' },
  updateBtnText:   { color: '#fff', fontWeight: '700' },

  // Navigate button
  navigateBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1565C0', paddingVertical: 10, borderRadius: 20, marginBottom: 4 },
  navigateBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  switchBtn:       { marginTop: 12, padding: 14, borderRadius: 28, borderWidth: 1, borderColor: colors.primary, alignItems: 'center' },
  switchBtnText:   { color: colors.primary, fontWeight: '700' },

  // Incoming order modal
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalCard:       { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28 },
  modalHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  modalTitle:      { fontSize: 20, fontWeight: '800', color: '#1A1A1A' },
  modalOrderId:    { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 },
  modalAddress:    { color: '#555', fontSize: 14, marginBottom: 4 },
  modalAmount:     { fontSize: 26, fontWeight: '800', color: colors.primary, marginBottom: 2 },
  modalItems:      { color: '#888', marginBottom: 22 },
  modalBtns:       { flexDirection: 'row', gap: 12 },
  rejectBtn:       { flex: 1, paddingVertical: 14, borderRadius: 28, borderWidth: 1.5, borderColor: '#D32F2F', alignItems: 'center' },
  rejectBtnText:   { color: '#D32F2F', fontWeight: '700', fontSize: 16 },
  acceptBtn:       { flex: 2, paddingVertical: 14, borderRadius: 28, backgroundColor: '#2E7D32', alignItems: 'center' },
  acceptBtnText:   { color: '#fff', fontWeight: '700', fontSize: 16 },
});
