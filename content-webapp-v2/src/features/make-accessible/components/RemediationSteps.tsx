import { Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import classes from './RemediationSteps.module.css';

const steps = ['upload', 'remediating', 'review'] as const;

export function RemediationSteps({ activeStep }: { activeStep: number }) {
  const { t } = useTranslation();

  return (
    <div>
      <Text className={classes.label}>{t('makeAccessible.stepsLabel')}</Text>
      <ol className={classes.steps} aria-label={t('makeAccessible.stepsLabel')}>
        {steps.map((step, index) => (
          <li
            key={step}
            className={index === activeStep ? `${classes.step} ${classes.active}` : classes.step}
            aria-current={index === activeStep ? 'step' : undefined}
          >
            <span className={index <= activeStep ? `${classes.circle} ${classes.filled}` : classes.circle}>
              {index + 1}
            </span>
            <span className={classes.name}>{t(`makeAccessible.steps.${step}`)}</span>
            {index < steps.length - 1 && <span className={classes.line} aria-hidden />}
          </li>
        ))}
      </ol>
    </div>
  );
}
