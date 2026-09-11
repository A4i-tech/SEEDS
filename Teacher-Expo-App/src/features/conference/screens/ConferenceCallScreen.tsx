import { Alert, AlertText } from '@/components/ui/alert';
import { AlertDialog, AlertDialogBackdrop, AlertDialogBody, AlertDialogContent, AlertDialogFooter, AlertDialogHeader } from '@/components/ui/alert-dialog';
import { Badge, BadgeText } from '@/components/ui/badge';
import { Button, ButtonText } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useAppToast } from '@shared/hooks/useAppToast';
import { ConnectionBanner } from '@shared/components/ConnectionBanner';
import { addSessionToHistory } from '@shared/services/sessionHistory';
import { sanitizePhoneInput } from '@shared/utils/phoneUtils';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  addParticipant,
  endConferenceCall,
  muteAll,
  muteParticipant,
  pauseAudio,
  removeParticipant,
  resumeAudio,
  seekAudio,
  setPlaybackSpeed,
  startConferenceCall,
  unmuteAll,
  unmuteParticipant,
} from '../api/conference';
import { useConferenceSSE } from '../hooks/useConferenceSSE';
import { useConnectivity } from '../hooks/useConnectivity';
import { useConferenceStore } from '../store/conferenceStore';
import type { Participant } from '../types/conference.types';

const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5];

export function ConferenceCallScreen({ confId }: { confId: string }) {
  const router = useRouter();
  const toast = useAppToast();
  const queryClient = useQueryClient();
  useConferenceSSE(confId);

  const classroomId = useConferenceStore((state) => state.classroomId);
  const classroomName = useConferenceStore((state) => state.classroomName);
  const isConfCallRunning = useConferenceStore((state) => state.isConfCallRunning);
  const conferenceHoldDetected = useConferenceStore((state) => state.conferenceHoldDetected);
  const audioContentState = useConferenceStore((state) => state.audioContentState);
  const participantsMap = useConferenceStore((state) => state.participantsMap);
  const notifications = useConferenceStore((state) => state.notifications);
  const dismissNotification = useConferenceStore((state) => state.dismissNotification);
  const reset = useConferenceStore((state) => state.reset);

  const { status: connectivity, prevStatus: prevConnectivity } = useConnectivity(isConfCallRunning);
  const [newPhone, setNewPhone] = React.useState('');
  const [newName, setNewName] = React.useState('');
  const [removeTarget, setRemoveTarget] = React.useState<Participant | null>(null);

  const participants = Object.values(participantsMap);
  const studentCount = participants.filter((p) => p.role === 'Student').length;

  function runAction(promise: Promise<unknown>, successMessage?: string) {
    promise
      .then(() => {
        if (successMessage) toast.success(successMessage);
      })
      .catch((err) => toast.error(String(err)));
  }

  async function handleEndCall() {
    try {
      await endConferenceCall(confId);
      await addSessionToHistory({
        group_id: classroomId ?? confId,
        group_name: classroomName ?? 'Classroom',
        student_count: studentCount,
      });
      queryClient.invalidateQueries({ queryKey: ['sessionHistory'] });
      reset();
      router.back();
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function handleAddParticipant() {
    try {
      await addParticipant(confId, newPhone, newName || undefined);
      toast.success('Participant added');
      setNewPhone('');
      setNewName('');
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function handleConfirmRemove() {
    if (!removeTarget) return;
    try {
      await removeParticipant(confId, removeTarget.phoneNumber);
      toast.success(`${removeTarget.name} removed`);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setRemoveTarget(null);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
    <ScrollView className="flex-1 bg-background">
      <VStack className="gap-4 p-6">
        <HStack className="items-center justify-between">
          <Heading size="xl">Live Class Call</Heading>
          <Badge variant={connectivity === 'online' ? 'default' : 'destructive'}>
            <BadgeText>{connectivity}</BadgeText>
          </Badge>
        </HStack>

        <ConnectionBanner status={connectivity} prevStatus={prevConnectivity} />

        {notifications.map((notification, index) => (
          <Alert key={index}>
            <AlertText>
              {notification.type === 'conference_hold_detected'
                ? 'Hold detected on conference audio'
                : `${notification.participantName ?? notification.participantPhone} has left the call`}
            </AlertText>
            <Button size="sm" variant="outline" onPress={() => dismissNotification(index)}>
              <ButtonText>Dismiss</ButtonText>
            </Button>
          </Alert>
        ))}

        {conferenceHoldDetected && (
          <Alert variant="destructive">
            <AlertText>Hold detected on conference audio.</AlertText>
          </Alert>
        )}

        <HStack className="gap-3">
          {!isConfCallRunning ? (
            <Button onPress={() => runAction(startConferenceCall(confId), 'Call started')}>
              <ButtonText>Start Call</ButtonText>
            </Button>
          ) : (
            <>
              <Button variant="outline" onPress={() => runAction(muteAll(confId))}>
                <ButtonText>Mute All</ButtonText>
              </Button>
              <Button variant="outline" onPress={() => runAction(unmuteAll(confId))}>
                <ButtonText>Unmute All</ButtonText>
              </Button>
            </>
          )}
          <Button variant="destructive" onPress={handleEndCall}>
            <ButtonText>End Call</ButtonText>
          </Button>
        </HStack>

        <Heading size="sm">Now Playing</Heading>
        <Card className="gap-2">
          {audioContentState.current_url ? (
            <>
              <Text size="sm" className="truncate">{audioContentState.current_url}</Text>
              <Text size="sm" className="text-muted-foreground">Status: {audioContentState.status}</Text>
              <HStack className="gap-3">
                <Button size="sm" variant="outline" onPress={() => runAction(seekAudio(confId, -10))}>
                  <ButtonText>-10s</ButtonText>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onPress={() =>
                    runAction(audioContentState.status === 'Playing' ? pauseAudio(confId) : resumeAudio(confId))
                  }
                >
                  <ButtonText>{audioContentState.status === 'Playing' ? 'Pause' : 'Resume'}</ButtonText>
                </Button>
                <Button size="sm" variant="outline" onPress={() => runAction(seekAudio(confId, 10))}>
                  <ButtonText>+10s</ButtonText>
                </Button>
              </HStack>
              <HStack className="gap-2">
                {PLAYBACK_SPEEDS.map((speed) => (
                  <Button
                    key={speed}
                    size="sm"
                    variant={audioContentState.speed === speed ? 'default' : 'outline'}
                    onPress={() => runAction(setPlaybackSpeed(confId, speed))}
                  >
                    <ButtonText>{speed}x</ButtonText>
                  </Button>
                ))}
              </HStack>
            </>
          ) : (
            <Text className="text-muted-foreground">Nothing playing.</Text>
          )}
          <Button variant="outline" onPress={() => router.push(`/content?confId=${confId}`)}>
            <ButtonText>Play Content</ButtonText>
          </Button>
        </Card>

        <Heading size="sm">Participants</Heading>
        {participants.length === 0 && <Text className="text-muted-foreground">No participants yet.</Text>}
        {participants.map((participant) => (
          <Card key={participant.phoneNumber} className="gap-2">
            <HStack className="items-center justify-between">
              <VStack>
                <Text bold>{participant.name}</Text>
                <Text size="sm" className="text-muted-foreground">
                  {participant.role} · {participant.phoneNumber}
                </Text>
              </VStack>
              <HStack className="gap-2">
                <Badge variant={participant.call_status === 'connected' ? 'default' : 'outline'}>
                  <BadgeText>{participant.call_status}</BadgeText>
                </Badge>
                {participant.is_raised && (
                  <Badge variant="secondary">
                    <BadgeText>Hand raised</BadgeText>
                  </Badge>
                )}
              </HStack>
            </HStack>
            <HStack className="gap-3">
              <Button
                size="sm"
                variant="outline"
                onPress={() =>
                  runAction(
                    participant.is_muted
                      ? unmuteParticipant(confId, participant.phoneNumber)
                      : muteParticipant(confId, participant.phoneNumber)
                  )
                }
              >
                <ButtonText>{participant.is_muted ? 'Unmute' : 'Mute'}</ButtonText>
              </Button>
              {participant.role === 'Student' && (
                <Button size="sm" variant="destructive" onPress={() => setRemoveTarget(participant)}>
                  <ButtonText>Remove</ButtonText>
                </Button>
              )}
            </HStack>
          </Card>
        ))}

        <Heading size="sm">Add Participant</Heading>
        <HStack className="gap-3">
          <Input className="flex-1">
            <InputField
              value={newPhone}
              onChangeText={(text) => setNewPhone(sanitizePhoneInput(text))}
              placeholder="Phone number"
              keyboardType="number-pad"
            />
          </Input>
          <Input className="flex-1">
            <InputField value={newName} onChangeText={setNewName} placeholder="Name (optional)" />
          </Input>
          <Button onPress={handleAddParticipant} disabled={!newPhone}>
            <ButtonText>Add</ButtonText>
          </Button>
        </HStack>
      </VStack>

      <AlertDialog isOpen={!!removeTarget} onClose={() => setRemoveTarget(null)}>
        <AlertDialogBackdrop />
        <AlertDialogContent>
          <AlertDialogHeader>
            <Heading size="sm">Remove {removeTarget?.name}?</Heading>
          </AlertDialogHeader>
          <AlertDialogBody>
            <Text>They will be disconnected from the call.</Text>
          </AlertDialogBody>
          <AlertDialogFooter>
            <Button variant="outline" onPress={() => setRemoveTarget(null)}>
              <ButtonText>Cancel</ButtonText>
            </Button>
            <Button variant="destructive" onPress={handleConfirmRemove}>
              <ButtonText>Remove</ButtonText>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScrollView>
    </SafeAreaView>
  );
}
