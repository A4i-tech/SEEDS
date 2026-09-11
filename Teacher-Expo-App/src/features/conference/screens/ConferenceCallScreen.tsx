import { Alert, AlertText } from '@/components/ui/alert';
import { AlertDialog, AlertDialogBackdrop, AlertDialogBody, AlertDialogContent, AlertDialogFooter, AlertDialogHeader } from '@/components/ui/alert-dialog';
import { Badge, BadgeText } from '@/components/ui/badge';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useClassroom } from '@features/classrooms/hooks/useClassrooms';
import { useContentDrawerStore } from '@features/content';
import { EmptyState, Screen, Section, SkeletonRows } from '@shared/components/Screen';
import { SearchField } from '@shared/components/SearchField';
import { useAppToast } from '@shared/hooks/useAppToast';
import { ConnectionBanner } from '@shared/components/ConnectionBanner';
import { addSessionToHistory } from '@shared/services/sessionHistory';
import { normalizePhoneNumber } from '@shared/utils/phoneUtils';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  addParticipant,
  endConferenceCall,
  muteAll,
  muteParticipant,
  removeParticipant,
  startConferenceCall,
  unmuteAll,
  unmuteParticipant,
} from '../api/conference';
import { useConferenceSSE } from '../hooks/useConferenceSSE';
import { useConnectivity } from '../hooks/useConnectivity';
import { useConferenceStore } from '../store/conferenceStore';
import type { Participant } from '../types/conference.types';

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
  const openContentDrawer = useContentDrawerStore((state) => state.open);

  const { status: connectivity, prevStatus: prevConnectivity } = useConnectivity(isConfCallRunning);
  const { data: classroom, isPending: studentsPending } = useClassroom(classroomId ?? '');
  const [search, setSearch] = React.useState('');
  const [addingPhone, setAddingPhone] = React.useState('');
  const [removeTarget, setRemoveTarget] = React.useState<Participant | null>(null);

  const participants = Object.values(participantsMap);
  const studentCount = participants.filter((p) => p.role === 'Student').length;

  const query = search.trim().toLowerCase();
  const addableStudents = (classroom?.students ?? []).filter(
    (student) =>
      participantsMap[normalizePhoneNumber(student.phone_number)]?.call_status !== 'connected' &&
      (!query || student.name.toLowerCase().includes(query))
  );

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

  async function handleAddParticipant(phoneNumber: string, name: string) {
    setAddingPhone(phoneNumber);
    try {
      await addParticipant(confId, phoneNumber, name);
      toast.success(`${name} added`);
      setSearch('');
    } catch (err) {
      toast.error(String(err));
    } finally {
      setAddingPhone('');
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
    <>
      <Screen
        title="Live Class Call"
        subtitle={classroomName ?? undefined}
        actions={
          <>
            <Badge variant={connectivity === 'online' ? 'default' : 'destructive'}>
              <BadgeText>{connectivity}</BadgeText>
            </Badge>
            <Button variant="destructive" onPress={handleEndCall} testID="end-call">
              <ButtonText>End Call</ButtonText>
            </Button>
          </>
        }
      >
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

        <Section title="Call controls">
          <HStack className="flex-wrap gap-2">
            {!isConfCallRunning ? (
              <Button onPress={() => runAction(startConferenceCall(confId), 'Call started')} testID="start-call">
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
          </HStack>
        </Section>

        <Section title="Now playing">
          <Pressable onPress={() => openContentDrawer(confId)} testID="open-content-drawer">
            <VStack className="gap-2 rounded-xl border border-border bg-card p-4">
              {audioContentState.current_url ? (
                <>
                  <Text className="font-medium text-foreground">Audio is playing to the call</Text>
                  <Text size="xs" className="text-muted-foreground">
                    {audioContentState.status} · {audioContentState.speed}x
                  </Text>
                  <Text size="xs" className="text-primary">Tap to change song or control playback</Text>
                </>
              ) : (
                <>
                  <Text className="font-medium text-foreground">Nothing playing</Text>
                  <Text size="xs" className="text-primary">Tap to open the content library</Text>
                </>
              )}
            </VStack>
          </Pressable>
        </Section>

        <Section title="Participants" meta={`${participants.length}`}>
          {participants.length === 0 ? (
            <EmptyState title="No participants yet" hint="Add students from this classroom's roster below." />
          ) : (
            <VStack className="gap-2">
              {participants.map((participant) => (
                <VStack key={participant.phoneNumber} className="gap-3 rounded-xl border border-border bg-card p-4">
                  <HStack className="items-start justify-between gap-3">
                    <VStack className="flex-1">
                      <Text className="font-medium text-foreground">{participant.name}</Text>
                      <Text size="xs" className="text-muted-foreground">
                        {participant.role} · {participant.phoneNumber}
                      </Text>
                    </VStack>
                    <HStack className="flex-wrap justify-end gap-1.5">
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
                  <HStack className="gap-2">
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
                      <Button size="sm" variant="ghost" onPress={() => setRemoveTarget(participant)}>
                        <ButtonText>Remove</ButtonText>
                      </Button>
                    )}
                  </HStack>
                </VStack>
              ))}
            </VStack>
          )}
        </Section>

        <Section title="Add participant" meta={classroom ? `${addableStudents.length} available` : undefined}>
          <VStack className="gap-3">
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder="Search this classroom's roster"
              testID="participant-search"
            />
            {studentsPending && <SkeletonRows count={3} />}
            {!studentsPending && addableStudents.length === 0 && (
              <EmptyState title={query ? `No student matches “${search}”` : 'Everyone in this classroom is already in the call'} />
            )}
            <VStack className="gap-2">
              {addableStudents.map((student) => (
                <Pressable
                  key={student.id}
                  onPress={() => handleAddParticipant(student.phone_number, student.name)}
                  disabled={!!addingPhone}
                  testID={`add-student-${student.id}`}
                >
                  <HStack className="items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
                    <VStack className="flex-1">
                      <Text className="font-medium text-foreground">{student.name}</Text>
                      <Text size="xs" className="text-muted-foreground">{student.phone_number}</Text>
                    </VStack>
                    <Text size="xs" className="text-primary">
                      {addingPhone === student.phone_number ? 'Adding…' : 'Add'}
                    </Text>
                  </HStack>
                </Pressable>
              ))}
            </VStack>
          </VStack>
        </Section>
      </Screen>

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
    </>
  );
}
