import type { useRouter } from 'expo-router';

export const HIT_SLOP = 8;

export function goBackOr(router: ReturnType<typeof useRouter>, fallbackHref: string): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallbackHref as never);
  }
}
