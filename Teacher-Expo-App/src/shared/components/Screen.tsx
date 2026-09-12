import { Button, ButtonIcon } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { ChevronLeftIcon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import React from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function Screen({
  title,
  subtitle,
  actions,
  onBack,
  leading,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onBack?: () => void;
  leading?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-background">
      <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingBottom: 112 }}>
        <VStack className="w-full max-w-3xl self-center gap-7 px-5 py-6 md:px-8 md:py-10">
          <HStack className="flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
            <HStack className="items-end gap-3">
              {onBack && (
                <Button variant="ghost" size="icon" onPress={onBack} accessibilityLabel="Go back" testID="screen-back">
                  <ButtonIcon as={ChevronLeftIcon} />
                </Button>
              )}
              {leading}
              <VStack className="gap-1">
                <Heading size="2xl" className="tracking-tight">
                  {title}
                </Heading>
                {subtitle && (
                  <Text size="sm" className="text-muted-foreground">
                    {subtitle}
                  </Text>
                )}
              </VStack>
            </HStack>
            {actions && <HStack className="flex-wrap items-center gap-2">{actions}</HStack>}
          </HStack>
          {children}
        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}

export function Section({
  title,
  meta,
  actions,
  children,
}: {
  title: string;
  meta?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <VStack className="gap-3">
      <HStack className="items-center justify-between gap-3">
        <HStack className="items-baseline gap-2">
          <Text size="xs" className="font-semibold uppercase tracking-widest text-muted-foreground">
            {title}
          </Text>
          {meta && <Text size="xs" className="text-muted-foreground">{meta}</Text>}
        </HStack>
        {actions}
      </HStack>
      {children}
    </VStack>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <VStack className="items-center gap-1 rounded-xl border border-dashed border-border bg-card/40 px-5 py-8">
      <Text className="font-medium text-foreground">{title}</Text>
      {hint && (
        <Text size="sm" className="text-center text-muted-foreground">
          {hint}
        </Text>
      )}
    </VStack>
  );
}

export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <VStack className="gap-3">
      {Array.from({ length: count }).map((_, index) => (
        <VStack key={index} className="gap-2 rounded-xl border border-border bg-card p-4">
          <VStack className="h-4 w-1/3 rounded bg-muted-foreground/20" />
          <VStack className="h-3 w-1/2 rounded bg-muted-foreground/10" />
        </VStack>
      ))}
    </VStack>
  );
}
