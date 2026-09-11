import { Button, ButtonIcon, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { CloseIcon } from '@/components/ui/icon';
import { Slider, SliderFilledTrack, SliderThumb, SliderTrack } from '@/components/ui/slider';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { saveContentToHistory } from '@shared/services/contentHistory';
import { formatDuration } from '@shared/utils/format';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useRouter } from 'expo-router';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useContentAudioUrl, useContentItem } from '../hooks/useContent';
import { displayTitle, primaryAudioUrl } from '../types/content.types';

export function ContentDetailScreen({ contentId }: { contentId: string }) {
  const router = useRouter();
  const { data: content, isPending, error } = useContentItem(contentId);
  const { data: audioUrl, isPending: audioPending } = useContentAudioUrl(
    content ? primaryAudioUrl(content) : null
  );

  const player = useAudioPlayer(audioUrl ?? null);
  const status = useAudioPlayerStatus(player);
  const hasRecordedHistory = React.useRef(false);

  React.useEffect(() => {
    if (status.playing && !hasRecordedHistory.current && content && audioUrl) {
      hasRecordedHistory.current = true;
      saveContentToHistory({ id: content.id, title: displayTitle(content), url: audioUrl, language: content.language });
    }
  }, [status.playing, content, audioUrl]);

  if (isPending) return <Spinner />;
  if (error || !content) return <Text className="text-destructive">{String(error)}</Text>;

  return (
    <SafeAreaView style={{ flex: 1 }}>
    <VStack className="flex-1 gap-6 bg-background p-6">
      <HStack className="items-center justify-between">
        <Heading size="xl">{displayTitle(content)}</Heading>
        <Button variant="outline" size="sm" onPress={() => router.back()}>
          <ButtonIcon as={CloseIcon} />
        </Button>
      </HStack>

      {content.description && <Text className="text-muted-foreground">{content.description}</Text>}

      {audioPending && <Spinner />}
      {!audioPending && !audioUrl && <Text className="text-destructive">No audio available for this content.</Text>}

      {audioUrl && (
        <VStack className="gap-3">
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
            <Text size="sm">{formatDuration(status.currentTime)}</Text>
            <Text size="sm">{formatDuration(status.duration)}</Text>
          </HStack>
          <HStack className="justify-center gap-4">
            <Button variant="outline" onPress={() => player.seekTo(Math.max(0, status.currentTime - 10))}>
              <ButtonText>-10s</ButtonText>
            </Button>
            <Button onPress={() => (status.playing ? player.pause() : player.play())}>
              <ButtonText>{status.playing ? 'Pause' : 'Play'}</ButtonText>
            </Button>
            <Button variant="outline" onPress={() => player.seekTo(Math.min(status.duration, status.currentTime + 10))}>
              <ButtonText>+10s</ButtonText>
            </Button>
          </HStack>
        </VStack>
      )}
    </VStack>
    </SafeAreaView>
  );
}
