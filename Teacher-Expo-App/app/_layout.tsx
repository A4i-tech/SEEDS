import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import '@/global.css';
import { useAuthStore } from '@features/auth';
import { useConferenceStore } from '@features/conference/store/conferenceStore';
import { ContentBar, ContentDrawer } from '@features/content';
import { useAppToast } from '@shared/hooks/useAppToast';
import { queryClient } from '@shared/services/queryClient';
import { useThemeStore } from '@shared/store/themeStore';
import { QueryClientProvider } from '@tanstack/react-query';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
 Stack, usePathname, useRouter } from 'expo-router';
import { useFonts } from 'expo-font';

import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';
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
  const hydrateTheme = useThemeStore((state) => state.hydrate);
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
    hydrateTheme();
  }, [hydrateAuth, hydrateTheme]);

  if (authStatus === 'idle') return null;

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const pathname = usePathname();
  const router = useRouter();
  const authStatus = useAuthStore((state) => state.status);
  const themeMode = useThemeStore((state) => state.mode);

  useEffect(() => {
    if (authStatus === 'unauthenticated' && pathname !== '/') {
      router.replace('/');
    } else if (authStatus === 'authenticated' && pathname === '/') {
      router.replace('/classrooms');
    }
  }, [authStatus, pathname, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={themeMode === 'dark' ? DarkTheme : DefaultTheme}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <GluestackUIProvider mode={themeMode}>
              <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
              <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
              <ContentBar />
              <ContentDrawer />
              <ActiveConferenceGuard />
            </GluestackUIProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function ActiveConferenceGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useAppToast();
  const isConfCallRunning = useConferenceStore((state) => state.isConfCallRunning);
  const confId = useConferenceStore((state) => state.confId);
  const conferencePath = confId ? `/conference/${confId}` : null;

  useEffect(() => {
    if (!isConfCallRunning || !conferencePath || pathname === conferencePath) return;
    router.replace(conferencePath);
    toast.warning('End the conference before leaving.');
    // toast is a fresh object every render; including it would re-fire the guard
  }, [isConfCallRunning, conferencePath, pathname, router]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isConfCallRunning) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);

    return () => subscription.remove();
  }, [isConfCallRunning]);

  // expo-router does not re-render on a browser history pop that lands on the same
  // route tree, so snap back from the popstate event itself as well.
  useEffect(() => {
    if (Platform.OS !== 'web' || !isConfCallRunning || !conferencePath) return;
    const onPopState = () => router.replace(conferencePath);

    window.addEventListener('popstate', onPopState);

    return () => window.removeEventListener('popstate', onPopState);
  }, [isConfCallRunning, conferencePath, router]);

  return null;
}
