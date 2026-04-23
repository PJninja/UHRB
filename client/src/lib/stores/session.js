// Session management store
import { persistedStore } from './persistence.js';

// Session ID persisted to localStorage
export const sessionId = persistedStore('sessionId', null);
