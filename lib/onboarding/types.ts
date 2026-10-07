export type StepState = { errors?: Record<string, string>; values?: Record<string, string | string[]> };

/** A server action as used with useActionState in the onboarding forms. */
export type StepAction = (prev: StepState, formData: FormData) => Promise<StepState>;
