import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ScreenContainer({ children, backgroundColor = '#FFF8F4', centered = false, style }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const horizontalPadding = width < 380 ? 14 : 18;

  return (
    <View style={[styles.outer, { backgroundColor }, style]}>
      <View
        style={[
          styles.inner,
          {
            paddingHorizontal: horizontalPadding,
            paddingTop: insets.top + 10,
            paddingBottom: insets.bottom + 12,
            justifyContent: centered ? 'center' : 'flex-start',
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    alignItems: 'center',
  },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
  },
});
