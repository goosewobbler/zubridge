import { createUseStore } from '@zubridge/electron';
import { useDispatch } from '@zubridge/electron';
import type { State } from '../types/state.js';

// Create a shared store hook for the runtime window
const useStore = createUseStore<State>();

// Get the counter element
const counterElement = document.getElementById('counter');
if (!counterElement) throw new Error('Counter element not found');

// Get the button elements
const decrementButton = document.getElementById('decrement');
const incrementButton = document.getElementById('increment');
if (!decrementButton || !incrementButton) throw new Error('Button elements not found');

// Create the dispatch function
const dispatch = useDispatch<State>();

// Subscribe to state changes
useStore((state) => {
  counterElement.textContent = state.counter.toString();
});

// Add event listeners
decrementButton.addEventListener('click', () => {
  dispatch('COUNTER:DECREMENT');
});

incrementButton.addEventListener('click', () => {
  dispatch('COUNTER:INCREMENT');
});
