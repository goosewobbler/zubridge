import { debug } from '@zubridge/core';
import { initActionScheduler } from '../action/ActionScheduler.js';
import { ThunkScheduler } from './scheduling/ThunkScheduler.js';
import { initThunkManager as initManager } from './ThunkManager.js';

// Initialize the ThunkManager immediately when this file is imported
const scheduler = new ThunkScheduler();
const thunkManager = initManager(scheduler);

debug('thunk', 'ThunkManager initialized with scheduler');

// Initialize the ActionScheduler with the ThunkManager
const actionScheduler = initActionScheduler(thunkManager);

debug('scheduler', 'ActionScheduler initialized with ThunkManager');

// Wire up the callback so ThunkScheduler can notify ActionScheduler when tasks complete
// This ensures ActionScheduler.processQueue() is called after each thunk action completes,
// allowing queued actions to be re-evaluated
scheduler.setOnTaskCompletedCallback(() => {
  actionScheduler.processQueue();
});

debug('scheduler', 'ThunkScheduler callback wired to ActionScheduler.processQueue');

// Export the initialized components
export { thunkManager, actionScheduler };
