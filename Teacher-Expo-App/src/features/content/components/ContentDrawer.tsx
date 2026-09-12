import { Badge, BadgeText } from '@/components/ui/badge';
import { Button, ButtonIcon, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import {
  ChevronUpIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  CloseIcon,
  Icon,
  PauseIcon,
  PlayIcon,
} from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { Slider, SliderFilledTrack, SliderThumb, SliderTrack } from '@/components/ui/slider';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { playAudio, pauseAudio, resumeAudio, seekAudio, setPlaybackSpeed } from '@features/conference/api/conference';
import { useConferenceStore } from '@features/conference/store/conferenceStore';
import { SearchField } from '@shared/components/SearchField';
import { EmptyState, SkeletonRows } from '@shared/components/Screen';
import { saveContentToHistory } from '@shared/services/contentHistory';
import { formatDuration } from '@shared/utils/format';
import { getLanguageLabel } from '@shared/utils/languageUtils';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import React from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { getContentSasUrl } from '../api/content';
import { useContentAudioUrl, useContentList } from '../hooks/useContent';
import { useContentDrawerStore } from '../store/contentDrawerStore';
import { displayTitle, primaryAudioUrl } from '../types/content.types';
import type { Content } from '../types/content.types';

const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5];

export const WIDE_BREAKPOINT = 768;
const PANEL_WIDTH = 440;

export function ContentDrawer() {
  const isOpen = useContentDrawerStore((state) => state.isOpen);
  const confId = useContentDrawerStore((state) => state.confId);
  const close = useContentDrawerStore((state) => state.close);
  const { width, height } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  const [visible, setVisible] = React.useState(isOpen);
  const progress = useSharedValue(0);

  React.useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mounts the panel before the open animation starts
      setVisible(true);
      progress.value = withTiming(1, { duration: 240 });
    } else {
      progress.value = withTiming(0, { duration: 180 }, (finished) => {
        if (finished) runOnJS(setVisible)(false);
      });
    }
  }, [isOpen, progress]);

  const offset = isWide ? PANEL_WIDTH : height;
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.5 }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: isWide
      ? [{ translateX: (1 - progress.value) * offset }]
      : [{ translateY: (1 - progress.value) * offset }],
  }));

  if (!visible) return null;

  return (
    <Animated.View style={StyleSheet.absoluteFill} pointerEvents="box-none" testID="content-drawer">
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]} className="bg-black">
        <Pressable className="flex-1" onPress={close} testID="content-drawer-backdrop" />
      </Animated.View>
      <Animated.View
        style={[
          panelStyle,
          isWide
            ? { position: 'absolute', top: 0, bottom: 0, right: 0, width: PANEL_WIDTH }
            : { position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.round(height * 0.88) },
        ]}
        className={
          isWide
            ? 'border-l border-border bg-card shadow-lg'
            : 'overflow-hidden rounded-t-3xl border-t border-border bg-card shadow-lg'
        }
      >
        <DrawerBody confId={confId} onClose={close} />
      </Animated.View>
    </Animated.View>
  );
}

function DrawerBody({ confId, onClose }: { confId: string | null; onClose: () => void }) {
  const classroomName = useConferenceStore((state) => state.classroomName);
  const participantsMap = useConferenceStore((state) => state.participantsMap);
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState<Content | null>(null);
  const [sendError, setSendError] = React.useState('');
  const [sendingId, setSendingId] = React.useState('');
  const { data, isPending, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useContentList({});

  const items = Array.from(
    new Map((data?.pages.flatMap((page) => page.items) ?? []).map((item) => [item.id, item])).values()
  );
  const query = search.trim().toLowerCase();
  const visibleItems = query
    ? items.filter((item) => displayTitle(item).toLowerCase().includes(query))
    : items;

  const loadMore = React.useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;

    if (contentSize.height - (contentOffset.y + layoutMeasurement.height) < 160) loadMore();
  }

  const swipeUp = Gesture.Pan().onEnd((event) => {
    if (event.translationY < -30) runOnJS(loadMore)();
  });

  async function handleSelect(content: Content) {
    setSendError('');
    if (!confId) {
      setSelected(content);

      return;
    }
    const audioUrl = primaryAudioUrl(content);

    if (!audioUrl) {
      setSendError('No audio available for this content.');

      return;
    }
    setSendingId(content.id);
    try {
      const sasUrl = await getContentSasUrl(audioUrl);

      await playAudio(confId, sasUrl);
      const studentCount = Object.values(participantsMap).filter((p) => p.role === 'Student').length;

      await saveContentToHistory(
        { id: content.id, title: displayTitle(content), url: sasUrl, language: content.language },
        { classroom_name: classroomName, student_count: studentCount, was_conference: true }
      );
      setSelected(content);
    } catch (err) {
      setSendError(String(err));
    } finally {
      setSendingId('');
    }
  }

  return (
    <VStack className="flex-1">
      <HStack className="items-start justify-between gap-3 border-b border-border px-5 py-4">
        <VStack className="gap-0.5">
          <Heading size="lg" className="tracking-tight">
            Content Library
          </Heading>
          <Text size="xs" className="text-muted-foreground">
            {confId ? 'Playing to the live call' : 'Previewing on this device'}
          </Text>
        </VStack>
        <Button variant="ghost" size="icon" onPress={onClose} testID="content-drawer-close">
          <ButtonIcon as={CloseIcon} />
        </Button>
      </HStack>

      {confId ? <ConferencePlayer confId={confId} content={selected} /> : selected && <LocalPlayer content={selected} />}

      <VStack className="gap-3 px-5 pb-3 pt-4">
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search songs"
          testID="content-search"
        />
        {!!sendError && <Text size="sm" className="text-destructive">{sendError}</Text>}
      </VStack>

      <ScrollView className="flex-1" onScroll={onScroll} scrollEventThrottle={64} testID="content-list-scroll">
        <VStack className="gap-2 px-5 pb-6">
          {isPending && <SkeletonRows count={4} />}
          {!!error && <Text size="sm" className="text-destructive">{String(error)}</Text>}
          {!isPending && visibleItems.length === 0 && (
            <EmptyState
              title={query ? 'No songs match that search' : 'No content available'}
              hint={query ? 'Try a shorter search term.' : undefined}
            />
          )}

          {visibleItems.map((content) => {
            const isCurrent = selected?.id === content.id;

            return (
              <Pressable
                key={content.id}
                onPress={() => handleSelect(content)}
                disabled={sendingId === content.id}
                testID={`content-row-${content.id}`}
              >
                <HStack
                  className={`items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                    isCurrent ? 'border-primary bg-secondary' : 'border-border bg-card'
                  }`}
                >
                  <VStack className="flex-1 gap-1.5">
                    <Text className="font-medium text-foreground">{displayTitle(content)}</Text>
                    <HStack className="flex-wrap items-center gap-1.5">
                      <Badge variant="outline">
                        <BadgeText>{getLanguageLabel(content.language)}</BadgeText>
                      </Badge>
                      {!!content.theme.english && (
                        <Badge variant="secondary">
                          <BadgeText>{content.theme.english}</BadgeText>
                        </Badge>
                      )}
                    </HStack>
                  </VStack>
                  <Text size="xs" className="text-muted-foreground">
                    {sendingId === content.id ? 'Sending…' : isCurrent ? 'Selected' : 'Play'}
                  </Text>
                </HStack>
              </Pressable>
            );
          })}

          {hasNextPage && !query && (
            <GestureDetector gesture={swipeUp}>
              <Animated.View testID="content-load-more">
                <Pressable onPress={loadMore}>
                  <VStack className="items-center gap-1 rounded-xl border border-dashed border-border py-5">
                    {isFetchingNextPage ? (
                      <Spinner />
                    ) : (
                      <>
                        <Icon as={ChevronUpIcon} className="text-muted-foreground" />
                        <Text size="xs" className="text-muted-foreground">
                          Swipe up for more songs
                        </Text>
                      </>
                    )}
                  </VStack>
                </Pressable>
              </Animated.View>
            </GestureDetector>
          )}
        </VStack>
      </ScrollView>
    </VStack>
  );
}

function ProgressBar({ ratio }: { ratio: number }) {
  return (
    <VStack className="h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/20">
      <VStack className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
    </VStack>
  );
}

function ConferencePlayer({ confId, content }: { confId: string; content: Content | null }) {
  const audioContentState = useConferenceStore((state) => state.audioContentState);
  const [actionError, setActionError] = React.useState('');
  const position = audioContentState.position_seconds ?? 0;
  const duration = audioContentState.duration_seconds ?? 0;
  const isPlaying = audioContentState.status === 'Playing';

  function run(promise: Promise<unknown>) {
    setActionError('');
    promise.catch((err) => setActionError(String(err)));
  }

  if (!content && !audioContentState.current_url) {
    return (
      <VStack className="border-b border-border bg-secondary/60 px-5 py-4">
        <Text size="sm" className="text-muted-foreground">Pick a song below to play it to the call.</Text>
      </VStack>
    );
  }

  return (
    <VStack className="gap-3 border-b border-border bg-secondary/60 px-5 py-4">
      <VStack className="gap-0.5">
        <Text size="xs" className="uppercase tracking-widest text-muted-foreground">
          Now playing in call
        </Text>
        <Text className="font-semibold text-foreground">
          {content ? displayTitle(content) : 'Audio from this session'}
        </Text>
      </VStack>
      <ProgressBar ratio={duration ? position / duration : 0} />
      <HStack className="justify-between">
        <Text size="xs" className="text-muted-foreground">{formatDuration(position)}</Text>
        <Text size="xs" className="text-muted-foreground">{formatDuration(duration)}</Text>
      </HStack>
      <HStack className="items-center justify-center gap-3">
        <Button
          size="icon"
          variant="outline"
          onPress={() => run(seekAudio(confId, -10))}
          accessibilityLabel="Rewind 10 seconds"
          testID="conf-seek-back"
        >
          <ButtonIcon as={ChevronsLeftIcon} />
        </Button>
        <Button
          size="icon"
          onPress={() => run(isPlaying ? pauseAudio(confId) : resumeAudio(confId))}
          accessibilityLabel={isPlaying ? 'Pause' : 'Resume'}
          testID="conf-play-pause"
        >
          <ButtonIcon as={isPlaying ? PauseIcon : PlayIcon} />
        </Button>
        <Button
          size="icon"
          variant="outline"
          onPress={() => run(seekAudio(confId, 10))}
          accessibilityLabel="Forward 10 seconds"
          testID="conf-seek-forward"
        >
          <ButtonIcon as={ChevronsRightIcon} />
        </Button>
      </HStack>
      <HStack className="justify-center gap-2">
        {PLAYBACK_SPEEDS.map((speed) => (
          <Button
            key={speed}
            size="sm"
            variant={audioContentState.speed === speed ? 'default' : 'outline'}
            onPress={() => run(setPlaybackSpeed(confId, speed))}
            accessibilityLabel={`Playback speed ${speed}x`}
          >
            <ButtonText>{speed}×</ButtonText>
          </Button>
        ))}
      </HStack>
      {!!actionError && <Text size="sm" className="text-destructive">{actionError}</Text>}
    </VStack>
  );
}

function LocalPlayer({ content }: { content: Content }) {
  const { data: audioUrl, isPending } = useContentAudioUrl(primaryAudioUrl(content));
  const player = useAudioPlayer(audioUrl ?? null);
  const status = useAudioPlayerStatus(player);
  const recordedId = React.useRef('');

  React.useEffect(() => {
    if (status.playing && recordedId.current !== content.id && audioUrl) {
      recordedId.current = content.id;
      saveContentToHistory({ id: content.id, title: displayTitle(content), url: audioUrl, language: content.language });
    }
  }, [status.playing, content, audioUrl]);

  return (
    <VStack className="gap-3 border-b border-border bg-secondary/60 px-5 py-4">
      <VStack className="gap-0.5">
        <Text size="xs" className="uppercase tracking-widest text-muted-foreground">
          Now playing
        </Text>
        <Text className="font-semibold text-foreground">{displayTitle(content)}</Text>
      </VStack>

      {isPending && <Spinner />}
      {!isPending && !audioUrl && (
        <Text size="sm" className="text-destructive">No audio available for this content.</Text>
      )}

      {!!audioUrl && (
        <>
          <Slider
            value={status.duration ? (status.currentTime / status.duration) * 100 : 0}
            onChange={(value) => player.seekTo((value / 100) * status.duration)}
          >
            <SliderTrack>
              <SliderFilledTrack />
            </SliderTrack>
            <SliderThumb />
          </Slider>
          <HStack className="justify-between">
            <Text size="xs" className="text-muted-foreground">{formatDuration(status.currentTime)}</Text>
            <Text size="xs" className="text-muted-foreground">{formatDuration(status.duration)}</Text>
          </HStack>
          <HStack className="items-center justify-center gap-3">
            <Button
              size="icon"
              variant="outline"
              onPress={() => player.seekTo(Math.max(0, status.currentTime - 10))}
              accessibilityLabel="Rewind 10 seconds"
              testID="local-seek-back"
            >
              <ButtonIcon as={ChevronsLeftIcon} />
            </Button>
            <Button
              size="icon"
              onPress={() => (status.playing ? player.pause() : player.play())}
              accessibilityLabel={status.playing ? 'Pause' : 'Play'}
              testID="local-play-pause"
            >
              <ButtonIcon as={status.playing ? PauseIcon : PlayIcon} />
            </Button>
            <Button
              size="icon"
              variant="outline"
              onPress={() => player.seekTo(Math.min(status.duration, status.currentTime + 10))}
              accessibilityLabel="Forward 10 seconds"
              testID="local-seek-forward"
            >
              <ButtonIcon as={ChevronsRightIcon} />
            </Button>
          </HStack>
        </>
      )}
    </VStack>
  );
}
