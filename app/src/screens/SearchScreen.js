import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { colors } from '../theme';
import ScreenContainer from '../components/ScreenContainer';
import { addToCart, searchProducts } from '../backend/freshBasketBackend';
import { useAuth } from '../auth/AuthContext';

export default function SearchScreen({ navigation }) {
  const { phoneNumber } = useAuth();
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const userId = phoneNumber ? phoneNumber.replace(/\D/g, '') : null;

  useEffect(() => {
    let active = true;

    const loadResults = async () => {
      setLoading(true);
      try {
        const nextProducts = await searchProducts(query);
        if (active) {
          setProducts(nextProducts);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    const timer = setTimeout(loadResults, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const handleAdd = async (product) => {
    setSavingId(product.id);
    try {
      await addToCart(userId, product);
      navigation.navigate('Cart');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <ScreenContainer backgroundColor={colors.background}>
      <TextInput
        style={styles.search}
        placeholder="Search fresh batters, mixes & more"
        value={query}
        onChangeText={setQuery}
        placeholderTextColor={colors.muted}
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('Product', { productId: item.id })}>
              <Image source={{ uri: item.image }} style={styles.img} />
              <View style={{ flex: 1, paddingLeft: 12 }}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.price}>₹{item.price}</Text>
              </View>
              <TouchableOpacity style={styles.add} onPress={() => handleAdd(item)}>
                {savingId === item.id ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff' }}>+</Text>}
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No products found.</Text>}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  search: { backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 10, color: colors.text },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 10 },
  img: { width: 72, height: 72, borderRadius: 8 },
  title: { fontWeight: '700', color: colors.text },
  price: { color: colors.primary, marginTop: 6 },
  add: { backgroundColor: colors.primary, padding: 10, borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  loadingWrap: { paddingVertical: 24 },
  empty: { color: colors.muted, textAlign: 'center', paddingVertical: 20 },
});