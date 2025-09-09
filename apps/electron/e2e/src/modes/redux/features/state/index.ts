import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { generateTestState, initialState } from '@zubridge/apps-shared';

// Define state variant types
type StateVariant = 'small' | 'medium' | 'large' | 'xl';
interface GenerateStateOptions {
  variant?: StateVariant;
}

/**
 * State slice using Redux Toolkit
 */
export const stateSlice = createSlice({
  name: 'state',
  initialState,
  reducers: {
    reset: () => {
      console.log('[Redux Slice] Resetting state to defaults');
      return initialState;
    },
    generateLargeState: {
      reducer: (state, action: PayloadAction<Record<string, number>>) => {
        state.filler = action.payload;
      },
      prepare: (options?: GenerateStateOptions) => {
        const variant = options?.variant || 'medium';
        console.log(`[Redux Slice] Generating ${variant} test state`);

        // Use the shared generateTestState function
        const filler = generateTestState(variant);

        console.log(
          `[Redux Slice] ${variant} test state prepared (${(filler.meta as { estimatedSize: string }).estimatedSize})`,
        );

        return {
          payload: filler as Record<string, number>,
        };
      },
    },
  },
});

// Export actions and reducer
export const { reset, generateLargeState } = stateSlice.actions;
export const { reducer } = stateSlice;
