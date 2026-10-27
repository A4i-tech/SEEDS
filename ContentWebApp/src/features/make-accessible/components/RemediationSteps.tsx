import { Stepper, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

const steps = ['upload', 'remediating', 'review'] as const;

export function RemediationSteps({ activeStep }: { activeStep: number }) {
  const { t } = useTranslation();

  return (
    <div>
      <Text variant="eyebrow" size="sm">
        {t('makeAccessible.stepsLabel')}
      </Text>
      <Stepper active={activeStep} iconSize={28} aria-label={t('makeAccessible.stepsLabel')}>
        {steps.map((step) => (
          <Stepper.Step key={step} label={t(`makeAccessible.steps.${step}`)} />
        ))}
      </Stepper>
    </div>
  );
}
