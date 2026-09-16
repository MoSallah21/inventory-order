export const appErrorCodes = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "CONFLICT",
  "INSUFFICIENT_STOCK",
  "INVALID_STATUS_TRANSITION",
  "DUPLICATE_REQUEST",
  "CONFIGURATION_ERROR",
  "EXTERNAL_SERVICE_ERROR",
  "INTERNAL_ERROR",
] as const;

export type AppErrorCode = (typeof appErrorCodes)[number];

export type BrowserError = {
  code: AppErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
};

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function serializeError(error: unknown): BrowserError {
  if (error instanceof AppError) {
    const fieldMessage = error.fieldErrors
      ? Object.values(error.fieldErrors)
          .flat()
          .find((message) => typeof message === "string" && message.length > 0)
      : undefined;
    return {
      code: error.code,
      message: fieldMessage ?? error.message,
      ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
  };
}
