import { Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import classes from './RemediationSteps.module.css';

const steps = ['upload', 'remediating', 'review'] as const;

function stepClass(index: number, activeStep: number): string {
  if (index === activeStep) return `${classes.step} ${classes.active}`;
  return classes.step;
}

function circleClass(index: number, activeStep: number): string {
  if (index <= activeStep) return `${classes.circle} ${classes.filled}`;
  return classes.circle;
}

function ariaCurrent(index: number, activeStep: number): 'step' | undefined {
  if (index === activeStep) return 'step';
  return undefined;
}

export function RemediationSteps({ activeStep }: { activeStep: number }) {
  const { t } = useTranslation();

  return (
    <div>
      <Text className={classes.label}>{t('makeAccessible.stepsLabel')}</Text>
      <ol className={classes.steps} aria-label={t('makeAccessible.stepsLabel')}>
        {steps.map((step, index) => (
          <li
            key={step}
            className={stepClass(index, activeStep)}
            aria-current={ariaCurrent(index, activeStep)}
          >
            <span className={circleClass(index, activeStep)}>{index + 1}</span>
            <span className={classes.name}>{t(`makeAccessible.steps.${step}`)}</span>
            {index < steps.length - 1 && <span className={classes.line} aria-hidden />}
          </li>
        ))}
      </ol>
    </div>
  );
}
