import { SearchIcon } from '@/components/ui/icon';
import { Input, InputField, InputIcon, InputSlot } from '@/components/ui/input';
import React from 'react';

export function SearchField({
  value,
  onChangeText,
  placeholder,
  testID,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  testID?: string;
}) {
  return (
    <Input className="h-10">
      <InputSlot>
        <InputIcon as={SearchIcon} />
      </InputSlot>
      <InputField value={value} onChangeText={onChangeText} placeholder={placeholder} testID={testID} />
    </Input>
  );
}
