import type { ValidationResult } from "../domain/types.ts"
import { validateWorkflowDefinition } from "../domain/validate.ts"

/**
 * Single production conversion site: validate submitted workflow JSON.
 * Callers persist the submitted object after this succeeds — not a rebuilt definition.
 */
export const parseWorkflowDefinition = (input: unknown): ValidationResult =>
  validateWorkflowDefinition(input)
