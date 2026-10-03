import { useFonts, Lora_600SemiBold, Lora_700Bold } from '@expo-google-fonts/lora';
import {
  NunitoSans_400Regular,
  NunitoSans_600SemiBold,
  NunitoSans_700Bold,
  NunitoSans_800ExtraBold,
} from '@expo-google-fonts/nunito-sans';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { initDb } from '../lib/db';
import { useColors, useStyles, type Palette } from '../lib/theme';
import { loadThemePreference } from '../lib/themePreference';

// Before the first render, so a saved light/dark choice never flashes the other theme.
loadThemePreference();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Lora_600SemiBold,
    Lora_700Bold,
    NunitoSans_400Regular,
    NunitoSans_600SemiBold,
    NunitoSans_700Bold,
    NunitoSans_800ExtraBold,
  });
  const [dbReady, setDbReady] = useState(false);
  const colors = useColors();
  const styles = useStyles(makeStyles);

  useEffect(() => {
    initDb().then(() => setDbReady(true));
  }, []);

  if (!fontsLoaded || !dbReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="camera" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="results" />
          <Stack.Screen name="beer/[id]" />
          <Stack.Screen name="scan-debug" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
