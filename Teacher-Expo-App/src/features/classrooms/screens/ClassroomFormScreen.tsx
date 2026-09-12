import { Button, ButtonText } from '@/components/ui/button';
import { FormControl, FormControlLabel, FormControlLabelText } from '@/components/ui/form-control';
import { HStack } from '@/components/ui/hstack';
import { CloseIcon, Icon } from '@/components/ui/icon';
import { Input, InputField } from '@/components/ui/input';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { EmptyState, Screen, Section, SkeletonRows } from '@shared/components/Screen';
import { SearchField } from '@shared/components/SearchField';
import { pluralize } from '@shared/utils/format';
import { useRouter } from 'expo-router';
import React from 'react';
import { useClassroom, useCreateClassroom, useSchoolStudents, useUpdateClassroom } from '../hooks/useClassrooms';
import type { ClassMember } from '../types/classroom.types';

export function ClassroomFormScreen({ classroomId }: { classroomId?: string }) {
  const router = useRouter();
  const { data: students, isPending: studentsPending } = useSchoolStudents();
  const { data: existing } = useClassroom(classroomId ?? '');
  const createClassroom = useCreateClassroom();
  const updateClassroom = useUpdateClassroom();

  const [name, setName] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [selectedStudentIds, setSelectedStudentIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setSelectedStudentIds(existing.students.map((s) => s.id));
  }, [existing]);

  function toggleStudent(studentId: string) {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  }

  async function handleSave() {
    const payload = {
      id: classroomId,
      name,
      students: selectedStudentIds,
      leaders: (existing?.leaders ?? []).map((l) => l.id).filter((id) => selectedStudentIds.includes(id)),
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
  const query = search.trim().toLowerCase();
  const selectedStudents = (students ?? []).filter((student) => selectedStudentIds.includes(student.id));
  const results = (students ?? []).filter(
    (student) => !selectedStudentIds.includes(student.id) && (!query || student.name.toLowerCase().includes(query))
  );

  return (
    <Screen
      title={classroomId ? 'Edit Classroom' : 'New Classroom'}
      subtitle={pluralize(selectedStudentIds.length, 'student')}
      onBack={() => router.back()}
      actions={
        <Button onPress={handleSave} disabled={isSaving || !name} testID="save-classroom">
          <ButtonText>{isSaving ? 'Saving…' : 'Save'}</ButtonText>
        </Button>
      }
    >
      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Classroom name</FormControlLabelText>
        </FormControlLabel>
        <Input className="h-10">
          <InputField value={name} onChangeText={setName} placeholder="e.g. Grade 5 — Section A" testID="classroom-name" />
        </Input>
      </FormControl>

      <Section title="Selected students" meta={`${selectedStudents.length}`}>
        {selectedStudents.length === 0 ? (
          <EmptyState title="No students yet" hint="Search below and tap a name to add them to this classroom." />
        ) : (
          <VStack className="gap-2">
            {selectedStudents.map((student) => (
              <SelectedStudentRow
                key={student.id}
                student={student}
                onRemove={() => toggleStudent(student.id)}
              />
            ))}
          </VStack>
        )}
      </Section>

      <Section title="Add students" meta={students ? `${results.length} available` : undefined}>
        <VStack className="gap-3">
          <SearchField
            value={search}
            onChangeText={setSearch}
            placeholder="Search students by name"
            testID="student-search"
          />
          {studentsPending && <SkeletonRows count={3} />}
          {!studentsPending && results.length === 0 && (
            <EmptyState title={query ? `No student matches “${search}”` : 'Everyone is already selected'} />
          )}
          <VStack className="gap-2">
            {results.map((student) => (
              <Pressable key={student.id} onPress={() => toggleStudent(student.id)} testID={`student-${student.id}`}>
                <HStack className="items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
                  <VStack className="flex-1">
                    <Text className="font-medium text-foreground">{student.name}</Text>
                    <Text size="xs" className="text-muted-foreground">{student.phone_number}</Text>
                  </VStack>
                  <Text size="xs" className="text-primary">Add</Text>
                </HStack>
              </Pressable>
            ))}
          </VStack>
        </VStack>
      </Section>

      {(createClassroom.error || updateClassroom.error) && (
        <Text className="text-destructive">{String(createClassroom.error ?? updateClassroom.error)}</Text>
      )}
    </Screen>
  );
}

function SelectedStudentRow({ student, onRemove }: { student: ClassMember; onRemove: () => void }) {
  return (
    <HStack className="items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <VStack className="flex-1">
        <Text className="font-medium text-foreground">{student.name}</Text>
        <Text size="xs" className="text-muted-foreground">{student.phone_number}</Text>
      </VStack>
      <Pressable onPress={onRemove} testID={`remove-${student.id}`}>
        <Icon as={CloseIcon} className="text-muted-foreground" />
      </Pressable>
    </HStack>
  );
}
