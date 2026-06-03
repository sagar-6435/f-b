import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Modal, Vibration,
  Switch, Linking, Platform,
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

const POLL_INTERVAL_MS      = 20000; // poll every 20 s
const POPUP_TIMEOUT_S       = 10;    // auto-dismiss popup after 10 s
const DELIVERY_RATE_PER_KM  = 12;   // ₹12 per km
const NEARBY_RADIUS_KM      = 7;    // only show orders within 7 km

// ── Haversine distance (km) ───────────────────────────────────────────────────
function distanceKm(lat1, lon1, lat2, lon2) {
  const R    = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a    = Math.sin(dLat / 2) ** 2 +
               Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function toRad(d) { return d * (Math.PI / 180); }

// ── Open maps helper ──────────────────────────────────────────────────────────
function openMaps(order) {
  const lat  = order.customerLocation?.latitude;
  const lng  = order.customerLocation?.longitude;
  const addr = order.deliveryAddress;
  let url;
  if (lat && lng) {
    url = Platform.OS === 'ios'
      ? `maps://app?daddr=${lat},${lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  } else if (addr) {
    const enc = encodeURIComponent(addr);
    url = Platform.OS === 'ios'
      ? `maps://app?daddr=${enc}`
      : `https://www.google.com/maps/dir/?api=1&destination=${enc}&travelmode=driving`;
  } else {
    Alert.alert('No address', 'This order has no delivery address or location.');
    return;
  }
  Linking.openURL(url).catch(() => {
    if (lat && lng) {
      Linking.openURL(
        `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
      );
    } else {
      Linking.openURL(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`
      );
    }
  });
}

export default function DeliveryDashboardScreen({ navigation, route }) {
  const { phoneNumber, userProfile } = useAuth();

  const routePartnerId   = route?.params?.partnerId;
  const routePartnerName = route?.params?.partnerName;
  const partnerId   = routePartnerId   ?? (phoneNumber ? phoneNumber.replace(/\D/g, '') : null);
  const partnerName = routePartnerName ?? userProfile?.displayName ?? 'Delivery Partner';

  // ── state ──────────────────────────────────────────────────────────────────
  const [isOnline,        setIsOnline]        = useState(false);
  const [togglingOnline,  setTogglingOnline]  = useState(false);
  const [location,        setLocation]        = useState(null);
  const [locationAddress, setLocationAddress] = useState('');
  const [locError,        setLocError]        = useState(null);

  // Active order = the one currently Assigned or OutForDelivery
  const [activeOrder,  setActiveOrder]  = useState(null);
  // Popup for a new incoming order request
  const [incomingOrder, setIncomingOrder] = useState(null);
  const [popupSecs,     setPopupSecs]    = useState(POPUP_TIMEOUT_S);
  const [accepting,     setAccepting]    = useState(false);

  // History modal
  const [showHistory,    setShowHistory]    = useState(false);
  const [allHistory,     setAllHistory]     = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [loading,    setLoading]    = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const prevNearbyIds  = useRef(new Set());
  const pollTimer      = useRef(null);
  const countdownRef   = useRef(null);

  // ── location ───────────────────────────────────────────────────────────────
  const getLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setLocError('Location permission denied.'); return null; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setLocation(loc);
      setLocError(null);
      try {
        const [place] = await Location.reverseGeocodeAsync(loc);
        if (place) {
          const short = [place.street || place.name, place.city || place.district, place.region]
            .filter(Boolean).slice(0, 3).join(', ');
          setLocationAddress(short || `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`);
        }
      } catch {
        setLocationAddress(`${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`);
      }
      return loc;
    } catch {
      setLocError('Unable to get location.');
      return null;
    }
  }, []);

  // ── start 10-second countdown ─────────────────────────────────────────────
  const startCountdown = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setPopupSecs(POPUP_TIMEOUT_S);
    countdownRef.current = setInterval(() => {
      setPopupSecs((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          // auto-reject
          setIncomingOrder((cur) => {
            if (cur) prevNearbyIds.current.add(String(cur._id));
            return null;
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // ── load data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async (silent = false) => {
    if (!isOnline) return;
    if (!silent) setLoading(true);
    try {
      // Check for an order already assigned to this partner
      const assigned = await fetchAllOrders({ deliveryPartnerId: partnerId });
      const active = assigned.find(
        (o) => o.status === 'Assigned' || o.status === 'OutForDelivery'
      ) ?? null;
      setActiveOrder(active);

      // Only look for new orders when free (no active order) and no popup showing
      if (!active && location) {
        const nearby = await fetchNearbyOrders(
          location.latitude, location.longitude, NEARBY_RADIUS_KM
        );
        const brandNew = nearby.filter(
          (o) => !prevNearbyIds.current.has(String(o._id))
        );
        if (brandNew.length > 0) {
          setIncomingOrder((cur) => {
            if (!cur) {
              Vibration.vibrate([0, 400, 100, 400]);
              startCountdown();
              return brandNew[0];
            }
            return cur;
          });
        }
        prevNearbyIds.current = new Set(nearby.map((o) => String(o._id)));
      }
    } catch (err) {
      if (!silent) Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isOnline, location, partnerId, startCountdown]);

  // ── load history ─────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!partnerId) return;
    setHistoryLoading(true);
    try {
      const orders = await fetchAllOrders({ deliveryPartnerId: partnerId });
      setAllHistory(orders);
    } catch { /* best-effort */ }
    finally { setHistoryLoading(false); }
  }, [partnerId]);

  // ── effects ───────────────────────────────────────────────────────────────
  useEffect(() => { loadHistory(); }, [loadHistory]);

  useEffect(() => {
    if (isOnline && location) {
      loadData();
      pollTimer.current = setInterval(() => loadData(true), POLL_INTERVAL_MS);
    } else {
      clearInterval(pollTimer.current);
    }
    return () => clearInterval(pollTimer.current);
  }, [isOnline, location]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup countdown on unmount
  useEffect(() => () => { clearInterval(countdownRef.current); }, []);

  // ── toggle online ─────────────────────────────────────────────────────────
  const handleToggleOnline = async (value) => {
    setTogglingOnline(true);
    try {
      let loc = location;
      if (value) {
        loc = await getLocation();
        if (!loc) {
          Alert.alert('Location required', 'Enable location to go online.');
          return;
        }
      }
      await setOnlineStatus(partnerId, value, loc);
      setIsOnline(value);
      if (!value) {
        setActiveOrder(null);
        setIncomingOrder(null);
        prevNearbyIds.current = new Set();
        clearInterval(countdownRef.current);
      }
    } catch (err) {
      Alert.alert('Failed', err.message);
    } finally {
      setTogglingOnline(false);
    }
  };

  const onRefresh = () => { setRefreshing(true); loadData(true); };

  // ── accept / reject incoming order ────────────────────────────────────────
  const handleAccept = async (order) => {
    setAccepting(true);
    clearInterval(countdownRef.current);
    try {
      await updateOrderStatus(order._id, 'Assigned', {
        deliveryPartnerId:   partnerId,
        deliveryPartnerName: partnerName,
      });
      prevNearbyIds.current.add(String(order._id));
      setIncomingOrder(null);
      await loadData(true);
      await loadHistory();
    } catch (err) {
      Alert.alert('Failed', err.message);
    } finally {
      setAccepting(false);
    }
  };

  const handleReject = () => {
    clearInterval(countdownRef.current);
    if (incomingOrder) prevNearbyIds.current.add(String(incomingOrder._id));
    setIncomingOrder(null);
  };

  // ── status update (Out for Delivery → Delivered) ──────────────────────────
  const handleStatusUpdate = async (order, newStatus) => {
    try {
      await updateOrderStatus(order._id, newStatus, {
        deliveryPartnerId:   partnerId,
        deliveryPartnerName: partnerName,
      });
      await loadData(true);
      await loadHistory();
      if (newStatus === 'Delivered') {
        Alert.alert('✅ Delivered', 'Order marked as delivered. Great work!');
      }
    } catch (err) {
      Alert.alert('Failed', err.message);
    }
  };

  // ── distance / charge helpers ─────────────────────────────────────────────
  const getOrderDistance = (order) => {
    if (!location || !order?.customerLocation?.latitude) return null;
    return distanceKm(
      location.latitude, location.longitude,
      order.customerLocation.latitude, order.customerLocation.longitude,
    );
  };

  const getDeliveryCharge = (order) => {
    const d = getOrderDistance(order);
    return d != null ? Math.ceil(d * DELIVERY_RATE_PER_KM) : null;
  };

  // ── history stats ─────────────────────────────────────────────────────────
  const historyDelivered = allHistory.filter((o) => o.status === 'Delivered');
  const totalEarnings    = historyDelivered.reduce((s, o) => s + (o.deliveryCharge ?? DELIVERY_RATE_PER_KM * 3), 0);
  const todayDelivered   = historyDelivered.filter((o) => {
    const d = new Date(o.deliveredAt ?? o.updatedAt);
    const t = new Date();
    return d.getDate() === t.getDate() && d.getMonth() === t.getMonth()
        && d.getFullYear() === t.getFullYear();
  });
  const todayEarnings = todayDelivered.reduce((s, o) => s + (o.deliveryCharge ?? DELIVERY_RATE_PER_KM * 3), 0);

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────────────
  const orderDist   = getOrderDistance(incomingOrder);
  const orderCharge = getDeliveryCharge(incomingOrder);

  return (
    <ScreenContainer backgroundColor="#F7F2EC">

      {/* ═══════════════════════════════════════════════════════════════════
          INCOMING ORDER POPUP  (10-second timer)
      ═══════════════════════════════════════════════════════════════════ */}
      <Modal visible={!!incomingOrder} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={s.popupCard}>

            {/* header */}
            <View style={s.popupHeader}>
              <Ionicons name="notifications" size={26} color={colors.primary} />
              <Text style={s.popupTitle}>New Order Request!</Text>
              {/* countdown ring */}
              <View style={[s.timerBadge, popupSecs <= 3 && s.timerBadgeRed]}>
                <Text style={[s.timerText, popupSecs <= 3 && s.timerTextRed]}>
                  {popupSecs}s
                </Text>
              </View>
            </View>

            {incomingOrder && (() => {
              const dist   = orderDist   != null ? orderDist.toFixed(1)   : '—';
              const charge = orderCharge != null ? `₹${orderCharge}`      : '—';
              return (
                <>
                  {/* order id */}
                  <Text style={s.popupOrderId}>
                    Order #{String(incomingOrder._id).slice(-6).toUpperCase()}
                  </Text>

                  {/* divider */}
                  <View style={s.divider} />

                  {/* customer info */}
                  <Text style={s.sectionLabel}>CUSTOMER INFO</Text>
                  <View style={s.infoRow}>
                    <Ionicons name="person-outline" size={15} color="#666" />
                    <Text style={s.infoText}>{incomingOrder.customerName || 'Customer'}</Text>
                  </View>
                  <View style={s.infoRow}>
                    <Ionicons name="call-outline" size={15} color="#666" />
                    <Text style={s.infoText}>{incomingOrder.customerPhone || '—'}</Text>
                  </View>
                  <View style={s.infoRow}>
                    <Ionicons name="location-outline" size={15} color="#666" />
                    <Text style={s.infoText} numberOfLines={2}>
                      {incomingOrder.deliveryAddress || 'Address not available'}
                    </Text>
                  </View>

                  <View style={s.divider} />

                  {/* order details */}
                  <Text style={s.sectionLabel}>ORDER DETAILS</Text>
                  {(incomingOrder.items ?? []).map((item, idx) => (
                    <View key={idx} style={s.itemRow}>
                      <Text style={s.itemName} numberOfLines={1}>{item.title}</Text>
                      <Text style={s.itemQty}>×{item.quantity}</Text>
                      <Text style={s.itemPrice}>₹{item.totalPrice ?? item.price * item.quantity}</Text>
                    </View>
                  ))}
                  <View style={s.orderTotalRow}>
                    <Text style={s.orderTotalLabel}>Order Total</Text>
                    <Text style={s.orderTotalValue}>₹{incomingOrder.totalAmount}</Text>
                  </View>

                  <View style={s.divider} />

                  {/* delivery charge estimate */}
                  <View style={s.chargeBox}>
                    <View style={s.chargeRow}>
                      <Ionicons name="bicycle-outline" size={16} color="#2E7D32" />
                      <Text style={s.chargeLabel}>Distance</Text>
                      <Text style={s.chargeValue}>{dist} km</Text>
                    </View>
                    <View style={s.chargeRow}>
                      <Ionicons name="cash-outline" size={16} color="#2E7D32" />
                      <Text style={s.chargeLabel}>Your Delivery Charge</Text>
                      <Text style={[s.chargeValue, { color: '#2E7D32', fontWeight: '800' }]}>
                        {charge}
                      </Text>
                    </View>
                    <Text style={s.chargeNote}>@ ₹{DELIVERY_RATE_PER_KM}/km</Text>
                  </View>

                  {/* action buttons */}
                  <View style={s.popupBtns}>
                    <TouchableOpacity
                      style={s.rejectBtn}
                      onPress={handleReject}
                      disabled={accepting}
                    >
                      <Text style={s.rejectBtnText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.acceptBtn, accepting && { opacity: 0.6 }]}
                      onPress={() => handleAccept(incomingOrder)}
                      disabled={accepting}
                    >
                      {accepting
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={s.acceptBtnText}>Accept</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════
          ORDER HISTORY MODAL
      ═══════════════════════════════════════════════════════════════════ */}
      <Modal visible={showHistory} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={s.historyModal}>
            {/* header */}
            <View style={s.historyHeader}>
              <Text style={s.historyTitle}>Order History</Text>
              <TouchableOpacity onPress={() => setShowHistory(false)} style={s.closeBtn}>
                <Ionicons name="close" size={22} color="#333" />
              </TouchableOpacity>
            </View>

            {/* stats */}
            <View style={s.historyStats}>
              <View style={s.statBox}>
                <Text style={s.statVal}>{historyDelivered.length}</Text>
                <Text style={s.statLbl}>Total</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statVal}>{todayDelivered.length}</Text>
                <Text style={s.statLbl}>Today</Text>
              </View>
              <View style={s.statBox}>
                <Text style={[s.statVal, { color: '#2E7D32' }]}>₹{Math.round(totalEarnings)}</Text>
                <Text style={s.statLbl}>Earned</Text>
              </View>
              <View style={s.statBox}>
                <Text style={[s.statVal, { color: '#2E7D32' }]}>₹{Math.round(todayEarnings)}</Text>
                <Text style={s.statLbl}>Today ₹</Text>
              </View>
            </View>

            {/* list */}
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              {historyLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
              ) : allHistory.length === 0 ? (
                <View style={s.emptyBox}>
                  <Ionicons name="receipt-outline" size={40} color="#CCC" />
                  <Text style={s.emptyTxt}>No order history yet</Text>
                </View>
              ) : (
                allHistory.map((order) => (
                  <View key={order._id} style={s.historyCard}>
                    <View style={s.historyCardTop}>
                      <Text style={s.histOrderId}>
                        #{String(order._id).slice(-6).toUpperCase()}
                      </Text>
                      <View style={[
                        s.statusPill,
                        order.status === 'Delivered' && s.pillGreen,
                        order.status === 'Cancelled' && s.pillRed,
                      ]}>
                        <Text style={[
                          s.statusPillTxt,
                          order.status === 'Delivered' && s.pillTxtGreen,
                          order.status === 'Cancelled' && s.pillTxtRed,
                        ]}>
                          {STATUS_LABELS[order.status] ?? order.status}
                        </Text>
                      </View>
                    </View>
                    <Text style={s.histAddr} numberOfLines={1}>
                      📍 {order.deliveryAddress || 'No address'}
                    </Text>
                    <View style={s.histFooter}>
                      <Text style={s.histMeta}>
                        {order.items?.length ?? 0} item(s) · ₹{order.totalAmount}
                      </Text>
                      {order.status === 'Delivered' && (
                        <Text style={s.earnBadge}>
                          +₹{order.deliveryCharge ?? Math.ceil(DELIVERY_RATE_PER_KM * 3)} earned
                        </Text>
                      )}
                    </View>
                    {order.deliveredAt && (
                      <Text style={s.delivDate}>
                        Delivered{' '}
                        {new Date(order.deliveredAt).toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </Text>
                    )}
                  </View>
                ))
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════
          MAIN SCREEN
      ═══════════════════════════════════════════════════════════════════ */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 30 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* header */}
        <View style={s.header}>
          <View>
            <Text style={s.kicker}>
              {routePartnerId ? `Viewing: ${partnerName}` : 'Delivery Partner'}
            </Text>
            <Text style={s.title}>Route Dashboard</Text>
          </View>
          <View style={s.onlineBox}>
            {togglingOnline && <ActivityIndicator color={colors.primary} size="small" style={{ marginRight: 8 }} />}
            <View style={[s.dot, isOnline && s.dotActive]} />
            <Text style={[s.onlineLabel, isOnline && s.onlineLabelActive]}>
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

        {/* location */}
        <View style={s.locRow}>
          <Ionicons
            name={location ? 'location' : 'location-outline'}
            size={13}
            color={location ? '#2E7D32' : '#999'}
          />
          <View style={{ flex: 1 }}>
            {locError ? (
              <Text style={[s.locTxt, { color: '#D32F2F' }]}>{locError}</Text>
            ) : location ? (
              <>
                <Text style={s.locAddr} numberOfLines={1}>
                  {locationAddress || 'Fetching address…'}
                </Text>
                <Text style={s.locCoords}>
                  {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                </Text>
              </>
            ) : (
              <Text style={s.locTxt}>Location not captured</Text>
            )}
          </View>
        </View>

        {/* ── History button ───────────────────────────────────────────── */}
        <TouchableOpacity
          style={s.historyBtn}
          onPress={() => { loadHistory(); setShowHistory(true); }}
        >
          <Ionicons name="time-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={s.historyBtnText}>Order History</Text>
        </TouchableOpacity>

        {/* ── Go online prompt ─────────────────────────────────────────── */}
        {!isOnline && (
          <View style={s.offlineCard}>
            <Ionicons name="bicycle-outline" size={46} color="#CCC" />
            <Text style={s.offlineTitle}>You're Offline</Text>
            <Text style={s.offlineSub}>
              Go online to start receiving order requests near you.
            </Text>
            <TouchableOpacity
              style={[s.goOnlineBtn, togglingOnline && { opacity: 0.6 }]}
              onPress={() => handleToggleOnline(true)}
              disabled={togglingOnline}
            >
              {togglingOnline
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.goOnlineBtnTxt}>Go Online</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Active order card ────────────────────────────────────────── */}
        {isOnline && (
          <>
            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
            ) : activeOrder ? (
              (() => {
                const activeDist   = getOrderDistance(activeOrder);
                const activeCharge = getDeliveryCharge(activeOrder);
                const isOutForDel  = activeOrder.status === 'OutForDelivery';
                return (
                  <View style={s.activeCard}>
                    {/* status banner */}
                    <View style={[s.activeBanner, isOutForDel && s.activeBannerGreen]}>
                      <Ionicons
                        name={isOutForDel ? 'bicycle' : 'cube-outline'}
                        size={16}
                        color="#fff"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={s.activeBannerTxt}>
                        {STATUS_LABELS[activeOrder.status]}
                      </Text>
                    </View>

                    <Text style={s.activeOrderId}>
                      Order #{String(activeOrder._id).slice(-6).toUpperCase()}
                    </Text>

                    <View style={s.divider} />

                    {/* customer info */}
                    <Text style={s.sectionLabel}>CUSTOMER</Text>
                    <View style={s.infoRow}>
                      <Ionicons name="person-outline" size={15} color="#666" />
                      <Text style={s.infoText}>
                        {activeOrder.customerName || 'Customer'}
                      </Text>
                    </View>
                    <View style={s.infoRow}>
                      <Ionicons name="call-outline" size={15} color="#666" />
                      <TouchableOpacity
                        onPress={() => Linking.openURL(`tel:${activeOrder.customerPhone}`)}
                      >
                        <Text style={[s.infoText, s.phoneLink]}>
                          {activeOrder.customerPhone || '—'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <View style={s.infoRow}>
                      <Ionicons name="location-outline" size={15} color="#666" />
                      <Text style={s.infoText} numberOfLines={2}>
                        {activeOrder.deliveryAddress || 'No address'}
                      </Text>
                    </View>

                    <View style={s.divider} />

                    {/* order items */}
                    <Text style={s.sectionLabel}>ORDER ITEMS</Text>
                    {(activeOrder.items ?? []).map((item, idx) => (
                      <View key={idx} style={s.itemRow}>
                        <Text style={s.itemName} numberOfLines={1}>{item.title}</Text>
                        <Text style={s.itemQty}>×{item.quantity}</Text>
                        <Text style={s.itemPrice}>
                          ₹{item.totalPrice ?? item.price * item.quantity}
                        </Text>
                      </View>
                    ))}
                    <View style={s.orderTotalRow}>
                      <Text style={s.orderTotalLabel}>Order Total</Text>
                      <Text style={s.orderTotalValue}>₹{activeOrder.totalAmount}</Text>
                    </View>

                    <View style={s.divider} />

                    {/* delivery charge */}
                    <View style={s.chargeBox}>
                      {activeDist != null && (
                        <View style={s.chargeRow}>
                          <Ionicons name="bicycle-outline" size={15} color="#2E7D32" />
                          <Text style={s.chargeLabel}>Distance</Text>
                          <Text style={s.chargeValue}>{activeDist.toFixed(1)} km</Text>
                        </View>
                      )}
                      {activeCharge != null && (
                        <View style={s.chargeRow}>
                          <Ionicons name="cash-outline" size={15} color="#2E7D32" />
                          <Text style={s.chargeLabel}>Your Delivery Charge</Text>
                          <Text style={[s.chargeValue, { color: '#2E7D32', fontWeight: '800' }]}>
                            ₹{activeCharge}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* navigate button */}
                    <TouchableOpacity style={s.navBtn} onPress={() => openMaps(activeOrder)}>
                      <Ionicons name="navigate" size={15} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={s.navBtnTxt}>Navigate to Customer</Text>
                    </TouchableOpacity>

                    {/* status action buttons */}
                    {activeOrder.status === 'Assigned' && (
                      <TouchableOpacity
                        style={s.primaryBtn}
                        onPress={() => handleStatusUpdate(activeOrder, 'OutForDelivery')}
                      >
                        <Ionicons name="bicycle" size={16} color="#fff" style={{ marginRight: 6 }} />
                        <Text style={s.primaryBtnTxt}>Mark Out for Delivery</Text>
                      </TouchableOpacity>
                    )}
                    {activeOrder.status === 'OutForDelivery' && (
                      <TouchableOpacity
                        style={[s.primaryBtn, { backgroundColor: '#2E7D32' }]}
                        onPress={() => {
                          Alert.alert(
                            'Confirm Delivery',
                            'Mark this order as delivered?',
                            [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Yes, Delivered', onPress: () => handleStatusUpdate(activeOrder, 'Delivered') },
                            ]
                          );
                        }}
                      >
                        <Ionicons name="checkmark-circle" size={16} color="#fff" style={{ marginRight: 6 }} />
                        <Text style={s.primaryBtnTxt}>Mark as Delivered</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })()
            ) : (
              /* no active order — waiting for next request */
              <View style={s.waitCard}>
                <Ionicons name="hourglass-outline" size={44} color="#CCC" />
                <Text style={s.waitTitle}>Waiting for Orders</Text>
                <Text style={s.waitSub}>
                  You'll get a popup when a new order is within {NEARBY_RADIUS_KM} km.
                </Text>
              </View>
            )}
          </>
        )}

        {/* switch dashboard */}
        <TouchableOpacity
          style={s.switchBtn}
          onPress={() => navigation.navigate('DashboardHub')}
        >
          <Text style={s.switchBtnTxt}>Switch Dashboard</Text>
        </TouchableOpacity>

      </ScrollView>
    </ScreenContainer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  STYLES
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // ── layout ────────────────────────────────────────────────────────────────
  header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  kicker:          { color: colors.primary, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 },
  title:           { fontSize: 24, fontWeight: '800', color: '#1A1A1A', marginTop: 2 },

  // ── online toggle ─────────────────────────────────────────────────────────
  onlineBox:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, elevation: 2 },
  dot:             { width: 8, height: 8, borderRadius: 4, backgroundColor: '#BDBDBD', marginRight: 6 },
  dotActive:       { backgroundColor: '#2E7D32' },
  onlineLabel:     { fontSize: 13, fontWeight: '700', color: '#9E9E9E' },
  onlineLabelActive: { color: '#2E7D32' },

  // ── location ──────────────────────────────────────────────────────────────
  locRow:          { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 8, marginBottom: 14 },
  locAddr:         { color: '#333', fontSize: 12, fontWeight: '600' },
  locCoords:       { color: '#AAA', fontSize: 10, marginTop: 1 },
  locTxt:          { color: '#888', fontSize: 11 },

  // ── history button ────────────────────────────────────────────────────────
  historyBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#455A64', paddingVertical: 12, borderRadius: 14, marginBottom: 14 },
  historyBtnText:  { color: '#fff', fontWeight: '700', fontSize: 14 },

  // ── offline card ──────────────────────────────────────────────────────────
  offlineCard:     { alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, padding: 36, marginBottom: 14 },
  offlineTitle:    { fontSize: 20, fontWeight: '800', color: '#1A1A1A', marginTop: 14 },
  offlineSub:      { color: '#888', textAlign: 'center', marginTop: 8, lineHeight: 20, marginBottom: 24, fontSize: 13 },
  goOnlineBtn:     { backgroundColor: '#2E7D32', paddingHorizontal: 36, paddingVertical: 14, borderRadius: 28, alignItems: 'center' },
  goOnlineBtnTxt:  { color: '#fff', fontWeight: '700', fontSize: 16 },

  // ── wait card ─────────────────────────────────────────────────────────────
  waitCard:        { alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, padding: 36, marginBottom: 14 },
  waitTitle:       { fontSize: 18, fontWeight: '800', color: '#1A1A1A', marginTop: 12 },
  waitSub:         { color: '#888', textAlign: 'center', marginTop: 6, fontSize: 13, lineHeight: 20 },

  // ── active order card ─────────────────────────────────────────────────────
  activeCard:      { backgroundColor: '#fff', borderRadius: 20, padding: 18, marginBottom: 14, elevation: 2 },
  activeBanner:    { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 14, marginBottom: 12, alignSelf: 'flex-start' },
  activeBannerGreen: { backgroundColor: '#2E7D32' },
  activeBannerTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  activeOrderId:   { fontSize: 18, fontWeight: '800', color: '#1A1A1A', marginBottom: 6 },

  // ── shared card parts ─────────────────────────────────────────────────────
  divider:         { height: 1, backgroundColor: '#F0EDE8', marginVertical: 12 },
  sectionLabel:    { fontSize: 10, fontWeight: '800', color: '#AAA', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' },
  infoRow:         { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 7 },
  infoText:        { color: '#333', fontSize: 14, flex: 1, lineHeight: 20 },
  phoneLink:       { color: '#1565C0', textDecorationLine: 'underline' },

  // item rows
  itemRow:         { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  itemName:        { flex: 1, fontSize: 13, color: '#333' },
  itemQty:         { fontSize: 13, color: '#888', marginHorizontal: 8 },
  itemPrice:       { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
  orderTotalRow:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  orderTotalLabel: { fontWeight: '700', color: '#555', fontSize: 14 },
  orderTotalValue: { fontWeight: '800', color: '#1A1A1A', fontSize: 16 },

  // delivery charge
  chargeBox:       { backgroundColor: '#F1F8F1', borderRadius: 12, padding: 14, marginBottom: 14 },
  chargeRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  chargeLabel:     { flex: 1, color: '#555', fontSize: 13 },
  chargeValue:     { fontWeight: '700', color: '#1A1A1A', fontSize: 14 },
  chargeNote:      { color: '#AAA', fontSize: 11, marginTop: 2 },

  // buttons
  navBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1565C0', paddingVertical: 11, borderRadius: 20, marginBottom: 10 },
  navBtnTxt:       { color: '#fff', fontWeight: '700', fontSize: 14 },
  primaryBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, paddingVertical: 13, borderRadius: 20 },
  primaryBtnTxt:   { color: '#fff', fontWeight: '700', fontSize: 15 },

  switchBtn:       { marginTop: 10, padding: 14, borderRadius: 28, borderWidth: 1, borderColor: colors.primary, alignItems: 'center' },
  switchBtnTxt:    { color: colors.primary, fontWeight: '700' },

  // ── incoming order popup ──────────────────────────────────────────────────
  overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  popupCard:       { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '90%' },
  popupHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  popupTitle:      { flex: 1, fontSize: 18, fontWeight: '800', color: '#1A1A1A' },
  timerBadge:      { backgroundColor: '#FFF3E0', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  timerBadgeRed:   { backgroundColor: '#FFEBEE' },
  timerText:       { fontWeight: '800', color: colors.primary, fontSize: 15 },
  timerTextRed:    { color: '#D32F2F' },
  popupOrderId:    { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 },
  popupBtns:       { flexDirection: 'row', gap: 12, marginTop: 4 },
  rejectBtn:       { flex: 1, paddingVertical: 14, borderRadius: 28, borderWidth: 1.5, borderColor: '#D32F2F', alignItems: 'center' },
  rejectBtnText:   { color: '#D32F2F', fontWeight: '700', fontSize: 15 },
  acceptBtn:       { flex: 2, paddingVertical: 14, borderRadius: 28, backgroundColor: '#2E7D32', alignItems: 'center' },
  acceptBtnText:   { color: '#fff', fontWeight: '700', fontSize: 15 },

  // ── history modal ─────────────────────────────────────────────────────────
  historyModal:    { backgroundColor: '#F7F2EC', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, height: '90%' },
  historyHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  historyTitle:    { fontSize: 20, fontWeight: '800', color: '#1A1A1A' },
  closeBtn:        { padding: 6 },
  historyStats:    { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 14, justifyContent: 'space-around' },
  statBox:         { alignItems: 'center' },
  statVal:         { fontSize: 20, fontWeight: '800', color: '#1A1A1A' },
  statLbl:         { color: '#888', fontSize: 11, marginTop: 2 },

  historyCard:     { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, elevation: 1 },
  historyCardTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  histOrderId:     { fontWeight: '700', color: '#1A1A1A', fontSize: 14 },
  histAddr:        { color: '#666', fontSize: 12, marginBottom: 6 },
  histFooter:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  histMeta:        { color: '#888', fontSize: 12 },
  earnBadge:       { backgroundColor: '#E8F5E9', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20, color: '#2E7D32', fontSize: 11, fontWeight: '700' },
  delivDate:       { color: '#AAA', fontSize: 11, marginTop: 4 },

  // status pills
  statusPill:      { backgroundColor: '#FFF0E8', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  statusPillTxt:   { color: colors.primary, fontWeight: '700', fontSize: 11 },
  pillGreen:       { backgroundColor: '#E8F5E9' },
  pillTxtGreen:    { color: '#2E7D32' },
  pillRed:         { backgroundColor: '#FFEBEE' },
  pillTxtRed:      { color: '#D32F2F' },

  // empty state
  emptyBox:        { alignItems: 'center', paddingVertical: 40 },
  emptyTxt:        { color: '#AAA', marginTop: 10, fontSize: 14 },
});
