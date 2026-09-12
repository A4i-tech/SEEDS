import { AlertDialog, AlertDialogBackdrop, AlertDialogBody, AlertDialogContent, AlertDialogFooter, AlertDialogHeader } from '@/components/ui/alert-dialog';
import { Button, ButtonIcon, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Icon, MenuIcon, MoonIcon, SunIcon, UnlockIcon } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useAuthStore } from '@features/auth';
import { useContentDrawerStore } from '@features/content';
import { EmptyState, Screen, Section, SkeletonRows } from '@shared/components/Screen';
import { useAppToast } from '@shared/hooks/useAppToast';
import { useThemeStore } from '@shared/store/themeStore';
import { formatRelativeTime, pluralize } from '@shared/utils/format';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { WIDE_BREAKPOINT } from '@features/content';
import { useClassrooms, useDeleteClassroom, useSessionHistory } from '../hooks/useClassrooms';
import type { Classroom } from '../types/classroom.types';

export function ClassroomListScreen() {
  const router = useRouter();
  const toast = useAppToast();
  const logout = useAuthStore((state) => state.logout);
  const openContentDrawer = useContentDrawerStore((state) => state.open);
  const { data: classrooms, isPending, error } = useClassrooms();
  const { data: sessionHistory } = useSessionHistory();
  const deleteClassroom = useDeleteClassroom();
  const [deleteTarget, setDeleteTarget] = React.useState<Classroom | null>(null);
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [menuAnchor, setMenuAnchor] = React.useState({ top: 0, left: 0 });
  const menuAnchorRef = React.useRef<View>(null);
  const themeMode = useThemeStore((state) => state.mode);
  const toggleTheme = useThemeStore((state) => state.toggle);
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  const showContentLibraryButton = isWide;

  function openMenu() {
    menuAnchorRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ top: y + height + 8, left: x });
      setIsMenuOpen(true);
    });
  }

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
    <>
      <Screen
        title="Classrooms"
        subtitle={classrooms ? pluralize(classrooms.length, 'classroom') : undefined}
        leading={
          <View ref={menuAnchorRef}>
            <Button
              variant="ghost"
              size="icon"
              onPress={openMenu}
              accessibilityLabel="Open menu"
              testID="open-menu"
            >
              <ButtonIcon as={MenuIcon} />
            </Button>
          </View>
        }
        actions={
          showContentLibraryButton && (
            <Button variant="outline" onPress={() => openContentDrawer()} testID="open-content-library">
              <ButtonText>Content Library</ButtonText>
            </Button>
          )
        }
      >
        {!!sessionHistory?.length && (
          <Section title="Recent conferences">
            <VStack className="gap-2">
              {sessionHistory.map((session) => (
                <Pressable
                  key={`${session.group_id}-${session.timestamp}`}
                  onPress={() => goToSession(session.group_id)}
                >
                  <HStack className="items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
                    <VStack className="flex-1">
                      <Text className="font-medium text-foreground">{session.group_name}</Text>
                      <Text size="xs" className="text-muted-foreground">
                        {formatRelativeTime(session.timestamp)} · {session.student_count} student
                        {session.student_count !== 1 ? 's' : ''}
                      </Text>
                    </VStack>
                  </HStack>
                </Pressable>
              ))}
            </VStack>
          </Section>
        )}

        <Section
          title="All classrooms"
          actions={
            <Button size="sm" onPress={() => router.push('/classrooms/new')} testID="new-classroom">
              <ButtonText>New Classroom</ButtonText>
            </Button>
          }
        >
          {isPending && <SkeletonRows count={3} />}
          {!!error && <Text className="text-destructive">{String(error)}</Text>}
          {classrooms?.length === 0 && (
            <EmptyState title="No classrooms yet" hint="Create one to start grouping students and running calls." />
          )}

          <VStack className="gap-3">
            {classrooms?.map((classroom) => (
              <VStack key={classroom.id} className="gap-3 rounded-xl border border-border bg-card p-4">
                <VStack className="gap-0.5">
                  <Heading size="md" className="tracking-tight">{classroom.name}</Heading>
                  <Text size="xs" className="text-muted-foreground">
                    {pluralize(classroom.students.length, 'student')} · {pluralize(classroom.leaders.length, 'leader')}
                  </Text>
                </VStack>
                <VStack className="gap-2 md:flex-row md:flex-wrap">
                  <Button className="w-full md:w-auto" onPress={() => router.push(`/classrooms/${classroom.id}`)}>
                    <ButtonText>Open</ButtonText>
                  </Button>
                  <Button
                    className="w-full md:w-auto"
                    variant="outline"
                    onPress={() => router.push(`/classrooms/${classroom.id}/edit`)}
                  >
                    <ButtonText>Edit</ButtonText>
                  </Button>
                  <Button
                    className="w-full md:w-auto"
                    variant="destructive"
                    onPress={() => setDeleteTarget(classroom)}
                  >
                    <ButtonText>Delete</ButtonText>
                  </Button>
                </VStack>
              </VStack>
            ))}
          </VStack>
        </Section>
      </Screen>

      {isMenuOpen && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsMenuOpen(false)} testID="menu-backdrop" />
          <VStack
            style={{ position: 'absolute', top: menuAnchor.top, left: menuAnchor.left }}
            className="w-48 gap-1 rounded-xl border border-border bg-card p-1.5 shadow-lg"
          >
            <Pressable
              onPress={() => {
                toggleTheme();
                setIsMenuOpen(false);
              }}
              testID="menu-toggle-theme"
            >
              <HStack className="items-center gap-2 rounded-lg px-3 py-2.5">
                <Icon as={themeMode === 'dark' ? SunIcon : MoonIcon} className="text-muted-foreground" />
                <Text size="sm" className="text-foreground">
                  {themeMode === 'dark' ? 'Light theme' : 'Dark theme'}
                </Text>
              </HStack>
            </Pressable>
            <Pressable
              onPress={() => {
                setIsMenuOpen(false);
                logout();
              }}
              testID="menu-logout"
            >
              <HStack className="items-center gap-2 rounded-lg px-3 py-2.5">
                <Icon as={UnlockIcon} className="text-muted-foreground" />
                <Text size="sm" className="text-foreground">Log out</Text>
              </HStack>
            </Pressable>
          </VStack>
        </>
      )}

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
    </>
  );
}
