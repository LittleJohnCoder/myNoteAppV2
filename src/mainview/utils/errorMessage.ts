/** The one place a thrown value becomes something a human can read (CODE_STYLE §13.3). */
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
