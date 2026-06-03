import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialIcons, AntDesign } from '@expo/vector-icons';
import * as Location from 'expo-location';

import { useAuth } from '../auth/AuthContext';
import { addToCart, fetchProducts } from '../backend/freshBasketBackend';

const categories = ['All', 'Idly', 'Dosa', 'Vada', 'Mixes'];

export default function HomeScreen({ navigation }) {
  const { phoneNumber } = useAuth();
  const [locationText, setLocationText] = useState('Tap to capture');
  const [locationLoading, setLocationLoading] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [products, setProducts] = useState([]);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isSmallScreen = width < 380;
  const horizontalSpace = isSmallScreen ? 12 : 16;
  const productImageHeight = width < 360 ? 150 : width < 420 ? 170 : 180;
  const userId = phoneNumber ? phoneNumber.replace(/\D/g, '') : null;

  useEffect(() => {
    let active = true;

    const loadProducts = async () => {
      try {
        const nextProducts = await fetchProducts();
        if (active) {
          setProducts(nextProducts);
        }
      } finally {
        if (active) {
          setLoadingProducts(false);
        }
      }
    };

    loadProducts();

    return () => {
      active = false;
    };
  }, []);

  const captureLocation = async () => {
    if (locationLoading) {
      return;
    }

    setLocationLoading(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        setLocationText('Location permission denied');
        return;
      }

      const currentPosition = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const [place] = await Location.reverseGeocodeAsync({
        latitude: currentPosition.coords.latitude,
        longitude: currentPosition.coords.longitude,
      });

      const parts = [place?.city, place?.region].filter(Boolean);
      setLocationText(parts.length > 0 ? parts.join(', ') : 'Current location captured');
    } catch (error) {
      setLocationText('Unable to capture location');
    } finally {
      setLocationLoading(false);
    }
  };

  const handleAddToCart = async (product) => {
    await addToCart(userId, product);
    navigation.navigate('Cart');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View
        style={[
          styles.header,
          {
            paddingHorizontal: horizontalSpace,
            paddingTop: insets.top + 10,
          },
        ]}
      >
        <Text style={[styles.logoText, isSmallScreen && styles.logoTextSmall]}>Fresh Basket</Text>
        <TouchableOpacity style={styles.locationBtn} onPress={captureLocation} activeOpacity={0.85}>
          {locationLoading ? <ActivityIndicator color="#fff" /> : <Feather name="map-pin" size={14} color="#fff" />}
          <View style={styles.locationCopy}>
            <Text style={styles.locationBtnText} numberOfLines={1}>
              {locationLoading ? 'Locating...' : locationText}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={[styles.searchContainer, { paddingHorizontal: horizontalSpace }]}>
        <TouchableOpacity style={styles.searchBox} activeOpacity={0.85} onPress={() => navigation.navigate('Search')}>
          <Feather name="search" size={18} color="#888" />
          <Text style={styles.searchPlaceholder}>Search fresh batters, mixes & more</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.filterBtn}>
          <MaterialIcons name="tune" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.categoryRow, { paddingHorizontal: horizontalSpace }]}
      >
        {categories.map((item, index) => (
          <TouchableOpacity key={item} style={[styles.categoryChip, index === 0 && styles.activeChip]}>
            <Text style={[styles.categoryText, index === 0 && styles.activeChipText]}>{item}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {loadingProducts ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#A1330E" />
            <Text style={styles.loadingText}>Loading products...</Text>
          </View>
        ) : (
          products.map((item) => (
            <View key={item.id} style={[styles.card, { marginHorizontal: horizontalSpace }]}>
              <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('Product', { productId: item.id })}>
                {item.tag ? (
                  <View style={styles.tag}>
                    <Text style={styles.tagText}>{item.tag}</Text>
                  </View>
                ) : null}

                <Image source={{ uri: item.image }} style={[styles.productImage, { height: productImageHeight }]} />
              </TouchableOpacity>

              <View style={styles.cardContent}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.rating}>☆ {item.rating}</Text>
                </View>

                <Text style={styles.description}>{item.description || 'Freshly prepared and naturally fermented for authentic taste.'}</Text>

                <View style={styles.bottomRow}>
                  <Text style={styles.price}>₹{item.price}</Text>

                  <TouchableOpacity style={styles.cartBtn} onPress={() => handleAddToCart(item)}>
                    <Feather name="shopping-cart" size={16} color="#000" />
                    <Text style={styles.cartText}>Add to Cart</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}

        <View style={[styles.deliveryCard, { marginHorizontal: horizontalSpace }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={styles.greenDot} />
            <View>
              <Text style={styles.deliveryTitle}>Delivered Daily</Text>
              <Text style={styles.deliveryText}>Next delivery starts at 6:00 AM tomorrow.</Text>
            </View>
          </View>

          <TouchableOpacity>
            <Text style={styles.scheduleText}>View Schedule</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F2EC' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logoText: { fontSize: 24, fontWeight: '700', color: '#A1330E' },
  logoTextSmall: { fontSize: 20 },
  locationBtn: { flexDirection: 'row', alignItems: 'center', maxWidth: '58%', backgroundColor: '#A1330E', paddingHorizontal: 12, paddingVertical: 11, borderRadius: 18 },
  locationCopy: { flex: 1, marginLeft: 8 },
  locationBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0EBE4', borderRadius: 20, paddingHorizontal: 14, height: 48 },
  searchPlaceholder: { flex: 1, marginLeft: 10, color: '#888' },
  filterBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F57C00', justifyContent: 'center', alignItems: 'center', marginLeft: 10 },
  categoryRow: { paddingVertical: 18 },
  categoryChip: { backgroundColor: '#E8E1D9', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 18, marginRight: 10 },
  activeChip: { backgroundColor: '#9C3A0D' },
  categoryText: { color: '#666', fontSize: 13 },
  activeChipText: { color: '#fff', fontWeight: '600' },
  card: { backgroundColor: '#F3EEE7', marginBottom: 18, borderRadius: 24, overflow: 'hidden' },
  tag: { position: 'absolute', top: 12, left: 12, zIndex: 10, backgroundColor: '#3B4D00', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  tagText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  productImage: { width: '100%' },
  cardContent: { padding: 16 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between' },
  title: { flex: 1, fontSize: 22, fontWeight: '600', color: '#111' },
  rating: { color: '#2E7D32', fontSize: 14 },
  description: { color: '#777', marginTop: 8, lineHeight: 20, fontSize: 13 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 },
  price: { fontSize: 28, color: '#A12200', fontWeight: '700' },
  cartBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F57C00', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 25, gap: 8 },
  cartText: { fontWeight: '600' },
  deliveryCard: { backgroundColor: '#DDF0D3', marginBottom: 30, borderRadius: 20, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greenDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'green', marginRight: 10 },
  deliveryTitle: { fontWeight: '600', color: '#2E7D32' },
  deliveryText: { fontSize: 12, color: '#4F6D4F' },
  scheduleText: { color: '#2E7D32', textDecorationLine: 'underline' },
  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32 },
  loadingText: { marginTop: 10, color: '#7E6B61', fontWeight: '600' },
  plusBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F57C00', justifyContent: 'center', alignItems: 'center' },
});