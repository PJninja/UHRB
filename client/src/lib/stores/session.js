// Session management store
import { persistedStore } from './persistence.js';

// Session ID persisted to localStorage
export const sessionId = persistedStore('sessionId', null);

// Last server-issued balance token — presented when creating a new session after
// the previous one expires so the server can restore the correct candy balance.
export const balanceToken = persistedStore('balanceToken', null);
