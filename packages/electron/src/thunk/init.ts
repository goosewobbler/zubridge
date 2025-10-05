import { debug } from '@zubridge/utils';
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

// Export the initialized components
export { thunkManager, actionScheduler };
