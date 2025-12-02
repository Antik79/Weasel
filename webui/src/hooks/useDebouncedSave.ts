import { useRef, useCallback, useEffect } from "react";
import { showToast } from "../App";

/**
 * Hook for debounced autosave operations
 * @param saveFunction Function to call for saving data
 * @param mutateFunction Function to revalidate SWR cache after save
 * @param delay Debounce delay in milliseconds (default: 500ms)
 * @returns Debounced save function
 */
export function useDebouncedSave<T>(
  saveFunction: (data: T) => Promise<void>,
  mutateFunction: () => Promise<any>,
  delay: number = 500
) {
  const timeoutRef = useRef<NodeJS.Timeout>();

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const debouncedSave = useCallback(
    async (data: T, showSuccessToast: boolean = true) => {
      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout
      timeoutRef.current = setTimeout(async () => {
        try {
          await saveFunction(data);
          await mutateFunction();
          if (showSuccessToast) {
            showToast("Settings saved", "success");
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          showToast(`Failed to save: ${message}`, "error");
          console.error("Debounced save failed:", error);
        }
      }, delay);
    },
    [saveFunction, mutateFunction, delay]
  );

  return debouncedSave;
}
