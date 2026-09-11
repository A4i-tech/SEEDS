import { AlertDialog, AlertDialogBackdrop, AlertDialogBody, AlertDialogContent, AlertDialogFooter, AlertDialogHeader } from '@/components/ui/alert-dialog';
import { Button, ButtonText } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useAuthStore } from '@features/auth';
import { useAppToast } from '@shared/hooks/useAppToast';
import { formatRelativeTime } from '@shared/utils/format';
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useClassrooms, useDeleteClassroom, useSessionHistory } from '../hooks/useClassrooms';
import type { Classroom } from '../types/classroom.types';

export function ClassroomListScreen() {
  const router = useRouter();
  const toast = useAppToast();
  const logout = useAuthStore((state) => state.logout);
  const { data: classrooms, isPending, error } = useClassrooms();
  const { data: sessionHistory } = useSessionHistory();
  const deleteClassroom = useDeleteClassroom();
  const [deleteTarget, setDeleteTarget] = React.useState<Classroom | null>(null);

  function goToSession(groupId: string) {
    if (classrooms?.some((c) => c.id === groupId)) {
      router.push(`/classrooms/${groupId}`);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteClassroom.mutateAsync(deleteTarget.id);
      toast.success(`${deleteTarget.name} deleted`);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
    <ScrollView className="flex-1 bg-background">
      <VStack className="gap-4 p-6">
        <HStack className="items-center justify-between">
          <Heading size="xl">Classrooms</Heading>
          <HStack className="gap-3">
            <Button onPress={() => router.push('/classrooms/new')}>
              <ButtonText>New Classroom</ButtonText>
            </Button>
            <Button variant="outline" onPress={() => router.push('/content')}>
              <ButtonText>Content Library</ButtonText>
            </Button>
            <Button variant="outline" onPress={() => logout()}>
              <ButtonText>Log out</ButtonText>
            </Button>
          </HStack>
        </HStack>

        {!!sessionHistory?.length && (
          <Card className="gap-3">
            <Heading size="md">Recent Conferences</Heading>
            {sessionHistory.map((session) => (
              <Button
                key={`${session.group_id}-${session.timestamp}`}
                variant="outline"
                className="justify-between"
                onPress={() => goToSession(session.group_id)}
              >
                <VStack>
                  <ButtonText>{session.group_name}</ButtonText>
                  <Text size="xs" className="text-muted-foreground">
                    {formatRelativeTime(session.timestamp)} · {session.student_count} student
                    {session.student_count !== 1 ? 's' : ''}
                  </Text>
                </VStack>
              </Button>
            ))}
          </Card>
        )}

        {isPending && <Spinner />}
        {error && <Text className="text-destructive">{String(error)}</Text>}
        {classrooms?.length === 0 && <Text className="text-muted-foreground">No classrooms yet.</Text>}

        {classrooms?.map((classroom) => (
          <Card key={classroom.id} className="gap-3">
            <Heading size="md">{classroom.name}</Heading>
            <Text size="sm" className="text-muted-foreground">
              {classroom.students.length} Students · {classroom.leaders.length} Leaders
            </Text>
            <HStack className="gap-3">
              <Button size="sm" variant="outline" onPress={() => router.push(`/classrooms/${classroom.id}`)}>
                <ButtonText>View</ButtonText>
              </Button>
              <Button size="sm" variant="outline" onPress={() => router.push(`/classrooms/${classroom.id}/edit`)}>
                <ButtonText>Edit</ButtonText>
              </Button>
              <Button size="sm" variant="destructive" onPress={() => setDeleteTarget(classroom)}>
                <ButtonText>Delete</ButtonText>
              </Button>
            </HStack>
          </Card>
        ))}
      </VStack>

      <AlertDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <AlertDialogBackdrop />
        <AlertDialogContent>
          <AlertDialogHeader>
            <Heading size="sm">Delete {deleteTarget?.name}?</Heading>
          </AlertDialogHeader>
          <AlertDialogBody>
            <Text>This cannot be undone.</Text>
          </AlertDialogBody>
          <AlertDialogFooter>
            <Button variant="outline" onPress={() => setDeleteTarget(null)}>
              <ButtonText>Cancel</ButtonText>
            </Button>
            <Button variant="destructive" onPress={handleConfirmDelete}>
              <ButtonText>Delete</ButtonText>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScrollView>
    </SafeAreaView>
  );
}
