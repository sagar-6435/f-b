import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { colors } from '../theme';
import ScreenContainer from '../components/ScreenContainer';
import { useAuth } from '../auth/AuthContext';
import { addToCart, fetchProductById, fetchProducts } from '../backend/freshBasketBackend';

export default function ProductDetailsScreen({ navigation, route }) {
  const { phoneNumber } = useAuth();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const userId = phoneNumber ? phoneNumber.replace(/\D/g, '') : null;
  const productId = route?.params?.productId;

  useEffect(() => {
    let active = true;

    const loadProduct = async () => {
      try {
        const nextProduct = productId ? await fetchProductById(productId) : (await fetchProducts())[0];
        if (active) {
          setProduct(nextProduct ?? null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadProduct();

    return () => {
      active = false;
    };
  }, [productId]);

  const handleAdd = async () => {
    if (!product) {
      return;
    }

    setSaving(true);
    try {
      await addToCart(userId, product);
      navigation.navigate('Cart');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer backgroundColor="#fff">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loading} />
        ) : product ? (
          <>
            <Image source={{ uri: product.image }} style={styles.hero} />
            <Text style={styles.title}>{product.title}</Text>
            <Text style={styles.price}>₹{product.price}</Text>
            <View style={styles.badges}>
              <View style={styles.badge}><Text>100% Organic</Text></View>
              <View style={styles.badge}><Text>Daily Fresh</Text></View>
            </View>
            <Text style={styles.desc}>{product.description || 'Experience the authentic taste of South India with our naturally fermented batter.'}</Text>
            <TouchableOpacity style={styles.add} onPress={handleAdd}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Add to Cart</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.empty}>Product not found.</Text>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 32 },
  loading: { marginTop: 40 },
  hero: { width: '100%', height: 260, borderRadius: 16 },
  title: { fontSize: 20, fontWeight: '700', marginTop: 12, color: colors.text },
  price: { color: colors.primary, fontSize: 20, marginVertical: 8 },
  badges: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  badge: { padding: 8, backgroundColor: '#F7F7F7', borderRadius: 12, marginRight: 8 },
  desc: { color: colors.muted, marginBottom: 18, lineHeight: 20 },
  add: { backgroundColor: colors.primary, padding: 14, borderRadius: 28, alignItems: 'center' },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
});