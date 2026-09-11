import { ClassroomFormScreen } from '@features/classrooms';
import { useLocalSearchParams } from 'expo-router';

export default function EditClassroom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ClassroomFormScreen classroomId={id} />;
}
