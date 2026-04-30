export type WindowType = 'main' | 'secondary' | 'runtime';

export interface ModeInfo {
  mode: string;
  modeName: string;
}

export interface WindowInfo {
  id: string;
  type: WindowType;
  subscriptions: string[];
}

export interface CreateRuntimeWindowResult {
  success: boolean;
  windowId: string;
}

export { type BaseState, isBaseState, type State } from './state';
