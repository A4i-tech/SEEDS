import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import '@/global.css';
import { useAuthStore } from '@features/auth';
import { queryClient } from '@shared/services/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from 'expo-router';
import { useFonts } from 'expo-font';
import { Slot, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });
  const hydrateAuth = useAuthStore((state) => state.hydrate);
  const authStatus = useAuthStore((state) => state.status);

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded && authStatus !== 'idle') {
      SplashScreen.hideAsync();
    }
  }, [loaded, authStatus]);

  useEffect(() => {
    hydrateAuth();
  }, [hydrateAuth]);

  if (authStatus === 'idle') return null;

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const pathname = usePathname();
  const router = useRouter();
  const authStatus = useAuthStore((state) => state.status);
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (authStatus === 'unauthenticated' && pathname !== '/') {
      router.replace('/');
    } else if (authStatus === 'authenticated' && pathname === '/') {
      router.replace('/classrooms');
    }
  }, [authStatus, pathname, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <GluestackUIProvider mode="system">
              <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
              <Slot />
            </GluestackUIProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
