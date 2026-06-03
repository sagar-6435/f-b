import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import OTPScreen from './src/screens/OTPScreen';
import DesignSystemScreen from './src/screens/DesignSystemScreen';
import SearchScreen from './src/screens/SearchScreen';
import ProductDetailsScreen from './src/screens/ProductDetailsScreen';
import DashboardHubScreen from './src/screens/DashboardHubScreen';
import AdminDashboardScreen from './src/screens/AdminDashboardScreen';
import SupplierDashboardScreen from './src/screens/SupplierDashboardScreen';
import DeliveryDashboardScreen from './src/screens/DeliveryDashboardScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import MainTabs from './src/navigation/MainTabs';
import { AuthProvider } from './src/auth/AuthContext';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <AuthProvider>
      <SafeAreaProvider>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="OTP" component={OTPScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="DesignSystem" component={DesignSystemScreen} />
            <Stack.Screen name="Search" component={SearchScreen} />
            <Stack.Screen name="Product" component={ProductDetailsScreen} />
            <Stack.Screen name="DashboardHub" component={DashboardHubScreen} />
            <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
            <Stack.Screen name="SupplierDashboard" component={SupplierDashboardScreen} />
            <Stack.Screen name="DeliveryDashboard" component={DeliveryDashboardScreen} />
            <Stack.Screen name="MainTabs" component={MainTabs} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </AuthProvider>
  );
}
