import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert,
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

export default function CartScreen({ navigation }) {
  const { phoneNumber, userProfile } = useAuth();
  const [items, setItems]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const userId = phoneNumber ? phoneNumber.replace(/\D/g, '') : null;

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
    if (item.quantity <= 1) {
      handleRemove(item.productId);
      return;
    }
    // Remove and re-add with quantity - 1
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
    if (!userProfile?.address && !userProfile?.addressLine) {
      Alert.alert(
        'Address required',
        'Please add a delivery address in your profile before placing an order.',
        [
          { text: 'Go to Profile', onPress: () => navigation.navigate('Profile') },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }

    setCheckingOut(true);
    try {
      // Try to get current location for delivery partner matching
      let customerLocation = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          customerLocation = {
            latitude:  pos.coords.latitude,
            longitude: pos.coords.longitude,
            address:   userProfile?.address ?? '',
          };
        }
      } catch {
        // Location is optional — proceed without it
      }

      const order = await placeOrder(userId, customerLocation);
      setItems([]);

      Alert.alert(
        '🎉 Order Placed!',
        `Order #${String(order._id).slice(-6).toUpperCase()} has been placed.\nA delivery partner near you will be notified.`,
        [{ text: 'View Orders', onPress: () => navigation.navigate('Orders') }],
      );
    } catch (error) {
      Alert.alert('Checkout failed', error.message ?? 'Unable to place the order.');
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <ScreenContainer backgroundColor={colors.background}>
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
                  {/* Quantity controls */}
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

            {/* Delivery address preview */}
            <View style={styles.addressCard}>
              <Ionicons name="location-outline" size={18} color={colors.primary} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.addressLabel}>Delivering to</Text>
                <Text style={styles.addressText} numberOfLines={2}>
                  {userProfile?.address || userProfile?.addressLine
                    ? (userProfile.address || `${userProfile.addressLine}, ${userProfile.city}`)
                    : 'No address set — tap to add'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
                <Text style={styles.changeText}>Change</Text>
              </TouchableOpacity>
            </View>

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
