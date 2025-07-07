import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';

// Counter slice
const counterSlice = createSlice({
  name: 'counter',
  initialState: 0,
  reducers: {
    increment: (state) => {
      console.log('[Redux Counter] Incrementing counter');
      return state + 1;
    },
    decrement: (state) => {
      console.log('[Redux Counter] Decrementing counter');
      return state - 1;
    },
  },
});

// Theme slice
const themeSlice = createSlice({
  name: 'theme',
  initialState: 'dark' as 'dark' | 'light',
  reducers: {
    toggleTheme: (state) => {
      console.log('[Redux Theme] Toggling theme');
      return state === 'dark' ? 'light' : 'dark';
    },
  },
});

// Root reducer
const rootReducer = {
  counter: counterSlice.reducer,
  theme: themeSlice.reducer,
};

// Create the Redux store
export function createStore() {
  console.log('[Redux Store] Creating Redux store with Redux Toolkit');

  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false, // For better interop with Electron
      }),
  });

  return store;
}

// Export action creators
export const actions = {
  'COUNTER:INCREMENT': counterSlice.actions.increment,
  'COUNTER:DECREMENT': counterSlice.actions.decrement,
  'THEME:TOGGLE': themeSlice.actions.toggleTheme,
};

// Export types
export type RootState = ReturnType<typeof createStore>['getState'];
