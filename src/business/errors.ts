import type { ValidationIssue } from "../domain/types.ts"

export type FactoryErrorCode =
  | "not_found"
  | "validation_error"
  | "invalid_json"
  | "unavailable"
  | "internal_error"

export class FactoryError extends Error {
  readonly code: FactoryErrorCode
  readonly details?: ValidationIssue[]

  constructor(code: FactoryErrorCode, message: string, details?: ValidationIssue[]) {
    super(message)
    this.name = "FactoryError"
    this.code = code
    this.details = details
  }
}

export const httpStatusFor = (code: FactoryErrorCode): number => {
  if (code === "not_found") return 404
  if (code === "unavailable") return 503
  if (code === "internal_error") return 500
  return 400
}

export const isFactoryError = (error: unknown): error is FactoryError => error instanceof FactoryError
