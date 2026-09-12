import { HStack } from '@/components/ui/hstack';
import { ChevronUpIcon, Icon, PauseIcon, PlayIcon } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useAuthStore } from '@features/auth';
import { useConferenceStore } from '@features/conference/store/conferenceStore';
import { usePathname } from 'expo-router';
import React from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useContentDrawerStore } from '../store/contentDrawerStore';
import { WIDE_BREAKPOINT } from './ContentDrawer';

export function ContentBar() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const authStatus = useAuthStore((state) => state.status);
  const isDrawerOpen = useContentDrawerStore((state) => state.isOpen);
  const openDrawer = useContentDrawerStore((state) => state.open);
  const confId = useConferenceStore((state) => state.confId);
  const audioContentState = useConferenceStore((state) => state.audioContentState);

  const isAllowedRoute = pathname === '/classrooms';
  if (width >= WIDE_BREAKPOINT || authStatus !== 'authenticated' || isDrawerOpen || !isAllowedRoute) return null;

  const isLive = !!audioContentState.current_url;
  const isPlaying = audioContentState.status === 'Playing';

  return (
    <Pressable
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: insets.bottom }}
      className="border-t border-border bg-card shadow-lg"
      onPress={() => openDrawer(confId ?? undefined)}
      testID="content-bar"
    >
      <HStack className="items-center justify-between gap-3 px-5 py-3">
        <HStack className="flex-1 items-center gap-3">
          <VStack className="h-9 w-9 items-center justify-center rounded-lg bg-secondary">
            <Icon as={isLive && isPlaying ? PauseIcon : PlayIcon} className="text-foreground" />
          </VStack>
          <VStack className="flex-1">
            <Text size="sm" className="font-medium text-foreground">
              {isLive ? 'Playing to the call' : 'Content Library'}
            </Text>
            <Text size="xs" className="text-muted-foreground">
              {isLive ? `${audioContentState.status} · ${audioContentState.speed}×` : 'Tap to browse songs'}
            </Text>
          </VStack>
        </HStack>
        <Icon as={ChevronUpIcon} className="text-muted-foreground" />
      </HStack>
    </Pressable>
  );
}
