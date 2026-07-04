import assert from "node:assert/strict";
import {
  knockoutWizardCanGoNextStep,
  knockoutWizardCanGoPrevStep,
  knockoutWizardMutationDisabled,
  knockoutWizardNavigationDisabled,
} from "./knockoutWizardNavigation";

// Read-only participant view: navigation enabled, mutations disabled
{
  assert.equal(
    knockoutWizardNavigationDisabled({ disabled: false }),
    false,
    "read-only browsing should not disable step navigation",
  );
  assert.equal(
    knockoutWizardMutationDisabled({ readOnly: true }),
    true,
    "read-only should disable pick mutations",
  );
  assert.equal(
    knockoutWizardCanGoNextStep({
      readOnly: true,
      step: 0,
      stepCount: 9,
      currentStepComplete: false,
    }),
    true,
    "read-only Next step should not require completing the current step",
  );
  assert.equal(
    knockoutWizardCanGoPrevStep({ step: 2 }),
    true,
  );
}

// Editable owner view: navigation still gated by step completion
{
  assert.equal(
    knockoutWizardMutationDisabled({ readOnly: false, disabled: false }),
    false,
  );
  assert.equal(
    knockoutWizardCanGoNextStep({
      readOnly: false,
      step: 0,
      stepCount: 9,
      currentStepComplete: false,
    }),
    false,
  );
  assert.equal(
    knockoutWizardCanGoNextStep({
      readOnly: false,
      step: 0,
      stepCount: 9,
      currentStepComplete: true,
    }),
    true,
  );
}

// Locked owner view with partial edit: same navigation rules as editable
{
  assert.equal(
    knockoutWizardMutationDisabled({
      readOnly: false,
      disabled: false,
      isSaving: false,
    }),
    false,
  );
  assert.equal(
    knockoutWizardCanGoNextStep({
      readOnly: false,
      step: 3,
      stepCount: 9,
      currentStepComplete: true,
    }),
    true,
  );
}

// Wizard disabled when teams are unavailable
{
  assert.equal(knockoutWizardNavigationDisabled({ disabled: true }), true);
  assert.equal(
    knockoutWizardMutationDisabled({ disabled: true, readOnly: false }),
    true,
  );
}

console.log("knockoutWizardNavigation.selftest.ts: ok");
