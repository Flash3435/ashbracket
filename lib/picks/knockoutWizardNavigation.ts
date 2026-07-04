/** Pick mutation controls (Clear, Change, Save, team pick) stay disabled when true. */
export function knockoutWizardMutationDisabled(args: {
  disabled?: boolean;
  readOnly?: boolean;
  isSaving?: boolean;
}): boolean {
  return Boolean(args.disabled || args.readOnly || args.isSaving);
}

/** Step pills, Back, and Next stay enabled in read-only unless the wizard itself is disabled. */
export function knockoutWizardNavigationDisabled(args: {
  disabled?: boolean;
}): boolean {
  return Boolean(args.disabled);
}

export function knockoutWizardCanGoNextStep(args: {
  readOnly?: boolean;
  step: number;
  stepCount: number;
  currentStepComplete: boolean;
}): boolean {
  if (args.step >= args.stepCount - 1) return false;
  if (args.readOnly) return true;
  return args.currentStepComplete;
}

export function knockoutWizardCanGoPrevStep(args: { step: number }): boolean {
  return args.step > 0;
}
