import { Button, ButtonText } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useTeacher } from '@features/auth';
import { createConference } from '@features/conference/api/conference';
import { useConferenceStore } from '@features/conference/store/conferenceStore';
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useClassroom } from '../hooks/useClassrooms';

export function ClassroomDetailScreen({ classroomId }: { classroomId: string }) {
  const router = useRouter();
  const { data: classroom, isPending, error } = useClassroom(classroomId);
  const { data: teacher } = useTeacher();
  const startConference = useConferenceStore((state) => state.startConference);
  const [isStarting, setIsStarting] = React.useState(false);
  const [startError, setStartError] = React.useState('');

  if (isPending) return <Spinner />;
  if (error || !classroom) return <Text className="text-destructive">{String(error)}</Text>;

  async function handleStartConference() {
    if (!teacher || !classroom) return;
    setIsStarting(true);
    setStartError('');
    try {
      const { id: confId } = await createConference(
        teacher.phone_number,
        classroom.students.map((s) => s.phone_number),
        teacher.name,
        classroom.students.map((s) => s.name)
      );
      startConference(
        confId,
        classroomId,
        classroom.name,
        { name: teacher.name, phoneNumber: teacher.phone_number, role: 'Teacher', raised_at: -1, is_raised: false, is_muted: false, call_status: 'disconnected' },
        classroom.students.map((s) => ({ name: s.name, phoneNumber: s.phone_number, role: 'Student' as const, raised_at: -1, is_raised: false, is_muted: false, call_status: 'disconnected' as const })),
        classroom.students.map((s) => ({ name: s.name, phoneNumber: s.phone_number }))
      );
      router.push(`/conference/${confId}`);
    } catch (err) {
      setStartError(String(err));
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
    <ScrollView className="flex-1 bg-background">
      <VStack className="gap-4 p-6">
        <HStack className="items-center justify-between">
          <Heading size="xl">{classroom.name}</Heading>
          <HStack className="gap-3">
            <Button onPress={handleStartConference} disabled={isStarting || !teacher}>
              <ButtonText>{isStarting ? 'Starting…' : 'Start Conference'}</ButtonText>
            </Button>
            <Button variant="outline" onPress={() => router.push(`/classrooms/${classroomId}/edit`)}>
              <ButtonText>Edit</ButtonText>
            </Button>
          </HStack>
        </HStack>

        {startError && <Text className="text-destructive">{startError}</Text>}

        <Heading size="sm">Leaders</Heading>
        {classroom.leaders.length === 0 && <Text className="text-muted-foreground">No leaders assigned.</Text>}
        {classroom.leaders.map((member) => (
          <Card key={member.id}>
            <Text>{member.name}</Text>
            <Text size="sm" className="text-muted-foreground">{member.phone_number}</Text>
          </Card>
        ))}

        <Heading size="sm">Students</Heading>
        {classroom.students.map((member) => (
          <Card key={member.id}>
            <Text>{member.name}</Text>
            <Text size="sm" className="text-muted-foreground">{member.phone_number}</Text>
          </Card>
        ))}

        <Button variant="outline" onPress={() => router.back()}>
          <ButtonText>Back</ButtonText>
        </Button>
      </VStack>
    </ScrollView>
    </SafeAreaView>
  );
}
