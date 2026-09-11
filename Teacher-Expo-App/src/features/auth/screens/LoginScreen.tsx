import { Button, ButtonText } from '@/components/ui/button';
import { FormControl, FormControlError, FormControlErrorText, FormControlLabel, FormControlLabelText } from '@/components/ui/form-control';
import { Heading } from '@/components/ui/heading';
import { Input, InputField } from '@/components/ui/input';
import { VStack } from '@/components/ui/vstack';
import { isValidPhoneNumber, sanitizePhoneInput } from '@shared/utils/phoneUtils';
import { useRouter } from 'expo-router';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';

export function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const [phoneNumber, setPhoneNumber] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit() {
    if (!phoneNumber || !password) {
      setError('Phone number and password are required');
      return;
    }
    if (!isValidPhoneNumber(phoneNumber)) {
      setError('Enter a valid 10-digit phone number');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      await login(phoneNumber, password);
      router.replace('/classrooms');
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <VStack className="flex-1 justify-center gap-6 bg-background p-6">
        <Heading size="xl">Teacher Login</Heading>

        <FormControl isInvalid={!!error}>
          <FormControlLabel>
            <FormControlLabelText>Phone number</FormControlLabelText>
          </FormControlLabel>
          <Input>
            <InputField
              keyboardType="number-pad"
              value={phoneNumber}
              onChangeText={(text) => setPhoneNumber(sanitizePhoneInput(text))}
              placeholder="10-digit mobile number"
              maxLength={10}
            />
          </Input>

          <FormControlLabel>
            <FormControlLabelText>Password</FormControlLabelText>
          </FormControlLabel>
          <Input>
            <InputField
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
            />
          </Input>

          <FormControlError>
            <FormControlErrorText>{error}</FormControlErrorText>
          </FormControlError>
        </FormControl>

        <Button onPress={handleSubmit} disabled={isSubmitting}>
          <ButtonText>{isSubmitting ? 'Logging in…' : 'Log in'}</ButtonText>
        </Button>
      </VStack>
    </SafeAreaView>
  );
}
