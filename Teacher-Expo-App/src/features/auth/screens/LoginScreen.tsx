import { Button, ButtonText } from '@/components/ui/button';
import { FormControl, FormControlError, FormControlErrorText, FormControlLabel, FormControlLabelText } from '@/components/ui/form-control';
import { Heading } from '@/components/ui/heading';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { isValidPhoneNumber, sanitizePhoneInput } from '@shared/utils/phoneUtils';
import { useRouter } from 'expo-router';
import React from 'react';
import { Image } from 'react-native';
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
    <SafeAreaView style={{ flex: 1 }} className="bg-background">
      <VStack className="w-full max-w-md flex-1 self-center justify-center gap-6 p-6">
        <Image
          source={require('../../../../assets/images/SEEDS.png')}
          style={{ width: 56, height: 56, alignSelf: 'center' }}
          resizeMode="contain"
        />
        <VStack className="gap-1">
          <Heading size="2xl" className="tracking-tight">Teacher Login</Heading>
          <Text size="sm" className="text-muted-foreground">
            Sign in with the mobile number registered with your school.
          </Text>
        </VStack>

        <FormControl isInvalid={!!error} className="gap-2 rounded-xl border border-border bg-card p-5">
          <FormControlLabel>
            <FormControlLabelText>Phone number</FormControlLabelText>
          </FormControlLabel>
          <Input className="h-10">
            <InputField
              keyboardType="number-pad"
              value={phoneNumber}
              onChangeText={(text) => setPhoneNumber(sanitizePhoneInput(text))}
              placeholder="10-digit mobile number"
              maxLength={10}
            />
          </Input>

          <FormControlLabel className="mt-2">
            <FormControlLabelText>Password</FormControlLabelText>
          </FormControlLabel>
          <Input className="h-10">
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
