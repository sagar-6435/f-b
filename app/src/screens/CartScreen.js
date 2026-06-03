import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, TextInput, Modal,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import ScreenContainer from '../components/ScreenContainer';
import { useAuth } from '../auth/AuthContext';
import {
  fetchCartItems, removeFromCart, placeOrder,
  addToCart, clearCart,
} from '../backend/freshBasketBackend';

// ── Delivery address selector modal ──────────────────────────────────────────

function DeliveryLocationModal({ visible, savedAddress, onConfirm, onClose }) {
  const [mode,        setMode]        = useState('saved'); // 'saved' | 'current' | 'custom'
  const [customText,  setCustomText]  = useState('');
  const [locLoading,  setLocLoading]  = useState(false);
  const [currentLoc,  setCurrentLoc]  = useState(null); // { latitude, longitude, address }

  const handleUseCurrent = async () => {
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Enable location to use current location.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [place] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude, longitude: pos.coords.longitude,
      });
      const addr = [place?.street ?? place?.name, place?.city ?? place?.district, place?.region]
        .filter(Boolean).join(', ');
      setCurrentLoc({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, address: addr });
      setMode('current');
    } catch {
      Alert.alert('Error', 'Unable to get current location.');
    } finally {
      setLocLoading(false);
    }
  };

  const handleConfirm = () => {
    if (mode === 'saved') {
      onConfirm({
        address:   savedAddress?.address ?? '',
        latitude:  savedAddress?.latitude  ?? null,
        longitude: savedAddress?.longitude ?? null,
      });
    } else if (mode === 'current' && currentLoc) {
      onConfirm(currentLoc);
    } else if (mode === 'custom') {
      if (!customText.trim()) { Alert.alert('Required', 'Enter a delivery address.'); return; }
      onConfirm({ address: customText.trim(), latitude: null, longitude: null });
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={ms.overlay}>
        <View style={ms.card}>
          <View style={ms.headerRow}>
            <Text style={ms.title}>Delivery address</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#888" />
            </TouchableOpacity>
          </View>

          {/* Option 1 — saved address */}
          {savedAddress?.address ? (
            <TouchableOpacity style={[ms.option, mode === 'saved' && ms.optionActive]} onPress={() => setMode('saved')}>
              <Ionicons name="home-outline" size={20} color={mode === 'saved' ? colors.primary : '#888'} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={ms.optionLabel}>Saved address</Text>
                <Text style={ms.optionValue} numberOfLines={2}>{savedAddress.address}</Text>
              </View>
              {mode === 'saved' && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
            </TouchableOpacity>
          ) : null}

          {/* Option 2 — current location */}
          <TouchableOpacity style={[ms.option, mode === 'current' && ms.optionActive]} onPress={handleUseCurrent} disabled={locLoading}>
            {locLoading
              ? <ActivityIndicator color={colors.primary} size="small" />
              : <Ionicons name="location-outline" size={20} color={mode === 'current' ? colors.primary : '#888'} />}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={ms.optionLabel}>Current location</Text>
              <Text style={ms.optionValue} numberOfLines={2}>
                {currentLoc ? currentLoc.address : 'Tap to detect'}
              </Text>
            </View>
            {mode === 'current' && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
          </TouchableOpacity>

          {/* Option 3 — custom address */}
          <TouchableOpacity style={[ms.option, mode === 'custom' && ms.optionActive]} onPress={() => setMode('custom')}>
            <Ionicons name="pencil-outline" size={20} color={mode === 'custom' ? colors.primary : '#888'} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={ms.optionLabel}>Different address</Text>
              {mode === 'custom'
                ? <TextInput
                    style={ms.customInput}
                    placeholder="Enter full delivery address"
                    value={customText}
                    onChangeText={setCustomText}
                    multiline
                    autoFocus
                  />
                : <Text style={ms.optionValue}>Enter a different address</Text>}
            </View>
            {mode === 'custom' && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
          </TouchableOpacity>

          <TouchableOpacity style={ms.confirmBtn} onPress={handleConfirm}>
            <Text style={ms.confirmBtnText}>Deliver here</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const ms = StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  card:          { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
  headerRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title:         { fontSize: 18, fontWeight: '800', color: '#1A1A1A' },
  option:        { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#F7F3F1', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: 'transparent' },
  optionActive:  { borderColor: colors.primary, backgroundColor: '#FFF5F0' },
  optionLabel:   { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  optionValue:   { fontSize: 13, color: '#333', marginTop: 2 },
  customInput:   { fontSize: 13, color: '#333', marginTop: 4, borderBottomWidth: 1, borderBottomColor: colors.primary, paddingVertical: 4 },
  confirmBtn:    { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 28, alignItems: 'center', marginTop: 8 },
  confirmBtnText:{ color: '#fff', fontWeight: '700', fontSize: 16 },
});

export default function CartScreen({ navigation }) {
  const { phoneNumber, userProfile } = useAuth();
  const [items, setItems]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [checkingOut, setCheckingOut]   = useState(false);
  const [showLocModal, setShowLocModal] = useState(false);

  // Selected delivery location — defaults to saved profile location
  const [deliveryLocation, setDeliveryLocation] = useState(null);

  const userId = phoneNumber ? phoneNumber.replace(/\D/g, '') : null;

  // Build saved address from profile
  const savedAddress = {
    address:   userProfile?.address ?? (userProfile?.addressLine ? `${userProfile.addressLine}, ${userProfile.city}` : ''),
    latitude:  userProfile?.savedLocation?.latitude  ?? null,
    longitude: userProfile?.savedLocation?.longitude ?? null,
  };

  // Auto-select saved address when profile loads
  useEffect(() => {
    if (savedAddress.address && !deliveryLocation) {
      setDeliveryLocation(savedAddress);
    }
  }, [userProfile]);

  const loadCart = useCallback(async () => {
    setLoading(true);
    try {
      const nextItems = await fetchCartItems(userId);
      setItems(nextItems);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadCart(); }, [loadCart]);

  const total = items.reduce((sum, i) => sum + Number(i.totalPrice ?? i.price ?? 0), 0);

  const handleRemove = async (productId) => {
    await removeFromCart(userId, productId);
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  const handleIncrement = async (item) => {
    await addToCart(userId, {
      id: item.productId, title: item.title,
      price: item.price, image: item.image,
    }, 1);
    setItems((prev) => prev.map((i) =>
      i.productId === item.productId
        ? { ...i, quantity: i.quantity + 1, totalPrice: i.price * (i.quantity + 1) }
        : i,
    ));
  };

  const handleDecrement = async (item) => {
    if (item.quantity <= 1) { handleRemove(item.productId); return; }
    await removeFromCart(userId, item.productId);
    await addToCart(userId, {
      id: item.productId, title: item.title,
      price: item.price, image: item.image,
    }, item.quantity - 1);
    setItems((prev) => prev.map((i) =>
      i.productId === item.productId
        ? { ...i, quantity: i.quantity - 1, totalPrice: i.price * (i.quantity - 1) }
        : i,
    ));
  };

  const handleCheckout = async () => {
    if (!deliveryLocation?.address) {
      Alert.alert('Address required', 'Please select a delivery address before placing your order.');
      setShowLocModal(true);
      return;
    }

    setCheckingOut(true);
    try {
      const customerLocation = {
        latitude:  deliveryLocation.latitude  ?? null,
        longitude: deliveryLocation.longitude ?? null,
        address:   deliveryLocation.address,
      };
      const order = await placeOrder(userId, customerLocation);
      setItems([]);
      Alert.alert(
        '🎉 Order Placed!',
        `Order #${String(order._id).slice(-6).toUpperCase()} has been placed.\nDelivering to: ${deliveryLocation.address}`,
        [{ text: 'View Orders', onPress: () => navigation.navigate('Orders') }],
      );
    } catch (error) {
      Alert.alert('Checkout failed', error.message ?? 'Unable to place the order.');
    } finally {
      setCheckingOut(false);
    }
  };

  const displayAddress = deliveryLocation?.address || savedAddress.address || '';

  return (
    <ScreenContainer backgroundColor={colors.background}>
      <DeliveryLocationModal
        visible={showLocModal}
        savedAddress={savedAddress}
        onConfirm={(loc) => { setDeliveryLocation(loc); setShowLocModal(false); }}
        onClose={() => setShowLocModal(false)}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <Text style={styles.title}>Your Cart</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loading} />
        ) : items.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="cart-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyTitle}>Cart is empty</Text>
            <Text style={styles.emptyText}>Add items from home or search.</Text>
            <TouchableOpacity style={styles.shopBtn} onPress={() => navigation.navigate('Home')}>
              <Text style={styles.shopBtnText}>Shop Now</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {items.map((item) => (
              <View key={item.productId} style={styles.item}>
                <Image source={{ uri: item.image }} style={styles.img} />
                <View style={styles.itemInfo}>
                  <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.itemPrice}>₹{item.price} each</Text>
                  <View style={styles.qtyRow}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => handleDecrement(item)}>
                      <Ionicons name="remove" size={16} color={colors.primary} />
                    </TouchableOpacity>
                    <Text style={styles.qtyText}>{item.quantity}</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => handleIncrement(item)}>
                      <Ionicons name="add" size={16} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.itemRight}>
                  <Text style={styles.itemTotal}>₹{item.totalPrice}</Text>
                  <TouchableOpacity onPress={() => handleRemove(item.productId)} style={styles.removeBtn}>
                    <Ionicons name="trash-outline" size={18} color={colors.muted} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {/* Delivery address card */}
            <TouchableOpacity style={styles.addressCard} onPress={() => setShowLocModal(true)}>
              <Ionicons name="location-outline" size={18} color={colors.primary} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.addressLabel}>Delivering to</Text>
                <Text style={styles.addressText} numberOfLines={2}>
                  {displayAddress || 'Tap to set delivery address'}
                </Text>
              </View>
              <Text style={styles.changeText}>Change</Text>
            </TouchableOpacity>

            {/* Summary */}
            <View style={styles.summary}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryValue}>₹{total}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Delivery</Text>
                <Text style={[styles.summaryValue, { color: '#2E7D32' }]}>FREE</Text>
              </View>
              <View style={[styles.summaryRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>₹{total}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.checkout, checkingOut && styles.checkoutDisabled]}
              onPress={handleCheckout}
              disabled={checkingOut}
            >
              {checkingOut
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.checkoutText}>Place Order  ₹{total}</Text>}
          </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title:           { fontSize: 24, fontWeight: '700', marginBottom: 12, color: colors.text },
  loading:         { marginTop: 20 },

  emptyCard:       { alignItems: 'center', backgroundColor: '#fff', padding: 32, borderRadius: 16, marginTop: 20 },
  emptyTitle:      { fontWeight: '700', color: colors.text, fontSize: 18, marginTop: 12 },
  emptyText:       { color: colors.muted, marginTop: 4 },
  shopBtn:         { marginTop: 16, backgroundColor: colors.primary, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24 },
  shopBtnText:     { color: '#fff', fontWeight: '700' },

  item:            { flexDirection: 'row', backgroundColor: '#fff', padding: 12, borderRadius: 14, marginBottom: 10, alignItems: 'center' },
  img:             { width: 72, height: 72, borderRadius: 10 },
  itemInfo:        { flex: 1, paddingHorizontal: 10 },
  itemTitle:       { fontWeight: '700', color: colors.text, fontSize: 13 },
  itemPrice:       { color: colors.muted, fontSize: 12, marginTop: 2 },
  qtyRow:          { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  qtyBtn:          { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  qtyText:         { marginHorizontal: 12, fontWeight: '700', fontSize: 15, color: colors.text },
  itemRight:       { alignItems: 'flex-end', justifyContent: 'space-between', height: 72 },
  itemTotal:       { color: colors.primary, fontWeight: '700', fontSize: 15 },
  removeBtn:       { padding: 4 },

  addressCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 14, marginTop: 4, marginBottom: 10 },
  addressLabel:    { fontSize: 11, color: colors.muted, fontWeight: '700', textTransform: 'uppercase' },
  addressText:     { color: colors.text, fontSize: 13, marginTop: 2 },
  changeText:      { color: colors.primary, fontWeight: '700', fontSize: 13 },

  summary:         { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12 },
  summaryRow:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryLabel:    { color: colors.muted },
  summaryValue:    { fontWeight: '600', color: colors.text },
  totalRow:        { borderTopWidth: 1, borderTopColor: '#F0EAE6', paddingTop: 10, marginTop: 4 },
  totalLabel:      { fontWeight: '700', fontSize: 16, color: colors.text },
  totalValue:      { fontWeight: '800', fontSize: 18, color: colors.primary },

  checkout:        { backgroundColor: colors.primary, padding: 16, borderRadius: 28, alignItems: 'center' },
  checkoutDisabled:{ opacity: 0.6 },
  checkoutText:    { color: '#fff', fontWeight: '700', fontSize: 16 },
});
