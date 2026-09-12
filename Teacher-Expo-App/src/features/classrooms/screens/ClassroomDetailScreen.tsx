import { Button, ButtonText } from '@/components/ui/button';
import { HStack } from '@/components/ui/hstack';
import { CheckIcon, Icon, StarIcon } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useTeacher } from '@features/auth';
import { createConference } from '@features/conference/api/conference';
import { useConferenceStore } from '@features/conference/store/conferenceStore';
import { EmptyState, Screen, Section, SkeletonRows } from '@shared/components/Screen';
import { pluralize } from '@shared/utils/format';
import { useRouter } from 'expo-router';
import React from 'react';
import { useClassroom, useUpdateClassroom } from '../hooks/useClassrooms';
import type { ClassMember } from '../types/classroom.types';

export function ClassroomDetailScreen({ classroomId }: { classroomId: string }) {
  const router = useRouter();
  const { data: classroom, isPending, error } = useClassroom(classroomId);
  const { data: teacher } = useTeacher();
  const updateClassroom = useUpdateClassroom();
  const startConference = useConferenceStore((state) => state.startConference);
  const [isPicking, setIsPicking] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [leaderId, setLeaderId] = React.useState('');
  const [isStarting, setIsStarting] = React.useState(false);
  const [startError, setStartError] = React.useState('');

  function openPicker() {
    if (!classroom) return;
    setSelectedIds(classroom.students.map((student) => student.id));
    setLeaderId(classroom.leaders[0]?.id ?? '');
    setStartError('');
    setIsPicking(true);
  }

  function toggleStudent(studentId: string) {
    setSelectedIds((prev) => {
      if (!prev.includes(studentId)) return [...prev, studentId];
      if (leaderId === studentId) setLeaderId('');
      return prev.filter((id) => id !== studentId);
    });
  }

  async function handleStartConference() {
    if (!teacher || !classroom) return;
    const joining = classroom.students.filter((student) => selectedIds.includes(student.id));
    setIsStarting(true);
    setStartError('');
    try {
      if (leaderId !== (classroom.leaders[0]?.id ?? '')) {
        await updateClassroom.mutateAsync({
          id: classroomId,
          name: classroom.name,
          students: classroom.students.map((student) => student.id),
          leaders: leaderId ? [leaderId] : [],
          content_ids: classroom.content_ids,
        });
      }
      const { id: confId } = await createConference(
        teacher.phone_number,
        joining.map((s) => s.phone_number),
        teacher.name,
        joining.map((s) => s.name)
      );
      startConference(
        confId,
        classroomId,
        classroom.name,
        { name: teacher.name, phoneNumber: teacher.phone_number, role: 'Teacher', raised_at: -1, is_raised: false, is_muted: false, call_status: 'disconnected' },
        joining.map((s) => ({ name: s.name, phoneNumber: s.phone_number, role: 'Student' as const, raised_at: -1, is_raised: false, is_muted: false, call_status: 'disconnected' as const })),
        classroom.students.map((s) => ({ name: s.name, phoneNumber: s.phone_number }))
      );
      router.push(`/conference/${confId}`);
    } catch (err) {
      setStartError(String(err));
    } finally {
      setIsStarting(false);
    }
  }

  if (isPending) {
    return (
      <Screen title="Classroom">
        <SkeletonRows count={4} />
      </Screen>
    );
  }

  if (error || !classroom) {
    return (
      <Screen title="Classroom">
        <Text className="text-destructive">{String(error)}</Text>
      </Screen>
    );
  }

  return (
    <Screen
      title={classroom.name}
      subtitle={`${pluralize(classroom.students.length, 'student')} · ${pluralize(classroom.leaders.length, 'leader')}`}
      onBack={() => router.back()}
      actions={
        <>
          {!isPicking && (
            <Button variant="outline" onPress={() => router.push(`/classrooms/${classroomId}/edit`)}>
              <ButtonText>Edit</ButtonText>
            </Button>
          )}
          {isPicking ? (
            <Button variant="outline" onPress={() => setIsPicking(false)}>
              <ButtonText>Cancel call</ButtonText>
            </Button>
          ) : (
            <Button onPress={openPicker} disabled={!teacher} testID="start-conference">
              <ButtonText>Start Conference</ButtonText>
            </Button>
          )}
        </>
      }
    >
      {!!startError && <Text className="text-destructive">{startError}</Text>}

      {isPicking && (
        <Section
          title="Who joins this call"
          meta={`${selectedIds.length} of ${classroom.students.length}`}
          actions={
            <Button
              size="sm"
              onPress={handleStartConference}
              disabled={isStarting || selectedIds.length === 0}
              testID="confirm-start-conference"
            >
              <ButtonText>{isStarting ? 'Starting…' : `Start with ${selectedIds.length}`}</ButtonText>
            </Button>
          }
        >
          <VStack className="gap-2">
            <Text size="xs" className="text-muted-foreground">
              Tap a name to include them. Tap the star to make one of them the leader for this call.
            </Text>
            {classroom.students.map((member) => (
              <CallStudentRow
                key={member.id}
                member={member}
                isSelected={selectedIds.includes(member.id)}
                isLeader={leaderId === member.id}
                onToggle={() => toggleStudent(member.id)}
                onToggleLeader={() => setLeaderId((prev) => (prev === member.id ? '' : member.id))}
              />
            ))}
          </VStack>
        </Section>
      )}

      <Section title="Roster" meta={`${classroom.students.length}`}>
        {classroom.students.length === 0 ? (
          <EmptyState title="No students in this classroom" hint="Use Edit to add students from the school roster." />
        ) : (
          <VStack className="gap-2">
            {classroom.students.map((member) => (
              <MemberRow key={member.id} member={member} />
            ))}
          </VStack>
        )}
      </Section>
    </Screen>
  );
}

function CallStudentRow({
  member,
  isSelected,
  isLeader,
  onToggle,
  onToggleLeader,
}: {
  member: ClassMember;
  isSelected: boolean;
  isLeader: boolean;
  onToggle: () => void;
  onToggleLeader: () => void;
}) {
  return (
    <HStack
      className={`items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
        isSelected ? 'border-primary bg-secondary' : 'border-border bg-card'
      }`}
    >
      <Pressable className="flex-1" onPress={onToggle} testID={`call-student-${member.id}`}>
        <HStack className="items-center gap-3">
          <VStack
            className={`h-5 w-5 items-center justify-center rounded-md border ${
              isSelected ? 'border-primary bg-primary' : 'border-border bg-background'
            }`}
          >
            {isSelected && <Icon as={CheckIcon} size="xs" className="text-primary-foreground" />}
          </VStack>
          <VStack className="flex-1">
            <Text className="font-medium text-foreground">{member.name}</Text>
            <Text size="xs" className="text-muted-foreground">{member.phone_number}</Text>
          </VStack>
        </HStack>
      </Pressable>
      {isSelected && (
        <Pressable onPress={onToggleLeader} testID={`call-leader-${member.id}`}>
          <HStack
            className={`items-center gap-1.5 rounded-full border px-3 py-1.5 ${
              isLeader ? 'border-primary bg-primary' : 'border-border bg-background'
            }`}
          >
            <Icon as={StarIcon} className={isLeader ? 'text-primary-foreground' : 'text-muted-foreground'} />
            <Text size="xs" className={isLeader ? 'text-primary-foreground' : 'text-muted-foreground'}>
              Leader
            </Text>
          </HStack>
        </Pressable>
      )}
    </HStack>
  );
}

function MemberRow({ member }: { member: ClassMember }) {
  return (
    <HStack className="items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <VStack className="flex-1">
        <Text className="font-medium text-foreground">{member.name}</Text>
        <Text size="xs" className="text-muted-foreground">{member.phone_number}</Text>
      </VStack>
    </HStack>
  );
}
