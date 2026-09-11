import { Button, ButtonText } from '@/components/ui/button';
import { Checkbox, CheckboxIcon, CheckboxIndicator, CheckboxLabel } from '@/components/ui/checkbox';
import { CheckIcon } from '@/components/ui/icon';
import { FormControl, FormControlLabel, FormControlLabelText } from '@/components/ui/form-control';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Input, InputField } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useClassroom, useCreateClassroom, useSchoolStudents, useUpdateClassroom } from '../hooks/useClassrooms';

export function ClassroomFormScreen({ classroomId }: { classroomId?: string }) {
  const router = useRouter();
  const { data: students, isPending: studentsPending } = useSchoolStudents();
  const { data: existing } = useClassroom(classroomId ?? '');
  const createClassroom = useCreateClassroom();
  const updateClassroom = useUpdateClassroom();

  const [name, setName] = React.useState('');
  const [selectedStudentIds, setSelectedStudentIds] = React.useState<string[]>([]);
  const [leaderIds, setLeaderIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setSelectedStudentIds(existing.students.map((s) => s.id));
    setLeaderIds(existing.leaders.map((l) => l.id));
  }, [existing]);

  function toggleStudent(studentId: string) {
    setSelectedStudentIds((prev) => {
      if (prev.includes(studentId)) {
        setLeaderIds((leaders) => leaders.filter((id) => id !== studentId));
        return prev.filter((id) => id !== studentId);
      }
      return [...prev, studentId];
    });
  }

  function toggleLeader(studentId: string) {
    setLeaderIds((prev) => (prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]));
  }

  async function handleSave() {
    const payload = {
      id: classroomId,
      name,
      students: selectedStudentIds,
      leaders: leaderIds,
      content_ids: existing?.content_ids ?? [],
    };
    if (classroomId) {
      await updateClassroom.mutateAsync(payload);
    } else {
      await createClassroom.mutateAsync(payload);
    }
    router.replace('/classrooms');
  }

  const isSaving = createClassroom.isPending || updateClassroom.isPending;

  return (
    <SafeAreaView style={{ flex: 1 }}>
    <ScrollView className="flex-1 bg-background">
      <VStack className="gap-6 p-6">
        <Heading size="xl">{classroomId ? 'Edit Classroom' : 'New Classroom'}</Heading>

        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Name</FormControlLabelText>
          </FormControlLabel>
          <Input>
            <InputField value={name} onChangeText={setName} placeholder="Classroom name" />
          </Input>
        </FormControl>

        <VStack className="gap-2">
          <Heading size="sm">Students</Heading>
          {studentsPending && <Spinner />}
          {students?.map((student) => {
            const isSelected = selectedStudentIds.includes(student.id);
            return (
              <HStack key={student.id} className="items-center justify-between">
                <Checkbox value={student.id} isChecked={isSelected} onChange={() => toggleStudent(student.id)}>
                  <CheckboxIndicator>
                    <CheckboxIcon as={CheckIcon} />
                  </CheckboxIndicator>
                  <CheckboxLabel>{student.name}</CheckboxLabel>
                </Checkbox>
                {isSelected && (
                  <Checkbox value={`leader-${student.id}`} isChecked={leaderIds.includes(student.id)} onChange={() => toggleLeader(student.id)}>
                    <CheckboxIndicator>
                      <CheckboxIcon as={CheckIcon} />
                    </CheckboxIndicator>
                    <CheckboxLabel>Leader</CheckboxLabel>
                  </Checkbox>
                )}
              </HStack>
            );
          })}
        </VStack>

        <HStack className="gap-3">
          <Button onPress={handleSave} disabled={isSaving || !name}>
            <ButtonText>{isSaving ? 'Saving…' : 'Save'}</ButtonText>
          </Button>
          <Button variant="outline" onPress={() => router.back()}>
            <ButtonText>Cancel</ButtonText>
          </Button>
        </HStack>

        {(createClassroom.error || updateClassroom.error) && (
          <Text className="text-destructive">{String(createClassroom.error ?? updateClassroom.error)}</Text>
        )}
      </VStack>
    </ScrollView>
    </SafeAreaView>
  );
}
