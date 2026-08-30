import { canonicalizeWorkflowJson } from "../codec/codec.ts"
import type { ValidationResult } from "./types.ts"

/**
 * Validate user JSON and return the canonical document (defaults omitted).
 * Implemented only via the codec — do not reconstruct a parallel converter here.
 */
export const validateWorkflowDefinition = (input: unknown): ValidationResult =>
  canonicalizeWorkflowJson(input)
