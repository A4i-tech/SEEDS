import { Badge, BadgeText } from '@/components/ui/badge';
import { Button, ButtonText } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Input, InputField } from '@/components/ui/input';
import { Pressable } from '@/components/ui/pressable';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { getLanguageLabel } from '@shared/utils/languageUtils';
import { playAudio } from '@features/conference/api/conference';
import { useConferenceStore } from '@features/conference/store/conferenceStore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { saveContentToHistory } from '@shared/services/contentHistory';
import { getContentSasUrl } from '../api/content';
import { useContentList } from '../hooks/useContent';
import { displayTitle, primaryAudioUrl } from '../types/content.types';
import type { Content } from '../types/content.types';

export function ContentListScreen() {
  const router = useRouter();
  const { confId } = useLocalSearchParams<{ confId?: string }>();
  const classroomName = useConferenceStore((state) => state.classroomName);
  const participantsMap = useConferenceStore((state) => state.participantsMap);
  const [language, setLanguage] = React.useState('');
  const [theme, setTheme] = React.useState('');
  const [playingError, setPlayingError] = React.useState('');
  const [playingId, setPlayingId] = React.useState('');
  const { data, isPending, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useContentList({
    language: language || undefined,
    theme: theme || undefined,
  });

  const items = Array.from(
    new Map((data?.pages.flatMap((page) => page.items) ?? []).map((item) => [item.id, item])).values()
  );

  async function handlePress(content: Content) {
    if (!confId) {
      router.push(`/content/${content.id}`);
      return;
    }
    const audioUrl = primaryAudioUrl(content);
    if (!audioUrl) {
      setPlayingError('No audio available for this content.');
      return;
    }
    setPlayingError('');
    setPlayingId(content.id);
    try {
      const sasUrl = await getContentSasUrl(audioUrl);
      await playAudio(confId, sasUrl);
      const studentCount = Object.values(participantsMap).filter((p) => p.role === 'Student').length;
      await saveContentToHistory(
        { id: content.id, title: displayTitle(content), url: sasUrl, language: content.language },
        { classroom_name: classroomName, student_count: studentCount, was_conference: true }
      );
      router.back();
    } catch (err) {
      setPlayingError(String(err));
    } finally {
      setPlayingId('');
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
    <ScrollView className="flex-1 bg-background">
      <VStack className="gap-4 p-6">
        <Heading size="xl">{confId ? 'Pick a song to play' : 'Content Library'}</Heading>
        {playingError && <Text className="text-destructive">{playingError}</Text>}

        <HStack className="gap-3">
          <Input className="flex-1">
            <InputField value={language} onChangeText={setLanguage} placeholder="Language (e.g. en, hi)" />
          </Input>
          <Input className="flex-1">
            <InputField value={theme} onChangeText={setTheme} placeholder="Theme" />
          </Input>
        </HStack>

        {isPending && <Spinner />}
        {error && <Text className="text-destructive">{String(error)}</Text>}
        {!isPending && items.length === 0 && <Text className="text-muted-foreground">No content found.</Text>}

        {items.map((content) => (
          <Pressable key={content.id} onPress={() => handlePress(content)} disabled={playingId === content.id}>
            <Card className="gap-2">
              <Heading size="md">{playingId === content.id ? 'Sending…' : displayTitle(content)}</Heading>
              <HStack className="gap-2">
                <Badge variant="outline">
                  <BadgeText>{getLanguageLabel(content.language)}</BadgeText>
                </Badge>
                {content.theme.english && (
                  <Badge variant="secondary">
                    <BadgeText>{content.theme.english}</BadgeText>
                  </Badge>
                )}
              </HStack>
            </Card>
          </Pressable>
        ))}

        {hasNextPage && (
          <Button variant="outline" onPress={() => fetchNextPage()} disabled={isFetchingNextPage}>
            <ButtonText>{isFetchingNextPage ? 'Loading…' : 'Load more'}</ButtonText>
          </Button>
        )}
      </VStack>
    </ScrollView>
    </SafeAreaView>
  );
}
