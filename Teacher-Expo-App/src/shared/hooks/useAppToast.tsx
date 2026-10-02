import { Toast, ToastDescription, useToast } from '@/components/ui/toast';

type ToastAction = 'success' | 'error' | 'warning' | 'info';

export function useAppToast() {
  const toast = useToast();

  function show(action: ToastAction, message: string) {
    toast.show({
      placement: 'top',
      render: ({ id }) => (
        <Toast nativeID={`toast-${id}`} action={action}>
          <ToastDescription>{message}</ToastDescription>
        </Toast>
      ),
    });
  }

  return {
    success: (message: string) => show('success', message),
    error: (message: string) => show('error', message),
    warning: (message: string) => show('warning', message),
    info: (message: string) => show('info', message),
  };
}
