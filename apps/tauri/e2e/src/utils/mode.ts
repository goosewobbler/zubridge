/**
 * Mirrors `apps/electron/e2e/src/utils/mode.ts` so renderer-side code can
 * read the active mode regardless of platform.
 */

export enum ZubridgeMode {
  ZustandBasic = 'zustand-basic',
  ZustandHandlers = 'zustand-handlers',
  ZustandReducers = 'zustand-reducers',
  Redux = 'redux',
  Custom = 'custom',
}

export const ZUBRIDGE_MODE_LABELS: Record<ZubridgeMode, string> = {
  [ZubridgeMode.ZustandBasic]: 'Zustand Basic',
  [ZubridgeMode.ZustandHandlers]: 'Zustand Handlers',
  [ZubridgeMode.ZustandReducers]: 'Zustand Reducers',
  [ZubridgeMode.Redux]: 'Redux',
  [ZubridgeMode.Custom]: 'Custom',
};

export function parseZubridgeMode(value: string | undefined | null): ZubridgeMode {
  switch ((value ?? '').toLowerCase()) {
    case ZubridgeMode.ZustandBasic:
    case 'basic':
      return ZubridgeMode.ZustandBasic;
    case ZubridgeMode.ZustandHandlers:
    case 'handlers':
      return ZubridgeMode.ZustandHandlers;
    case ZubridgeMode.ZustandReducers:
    case 'reducers':
      return ZubridgeMode.ZustandReducers;
    case ZubridgeMode.Redux:
      return ZubridgeMode.Redux;
    case ZubridgeMode.Custom:
      return ZubridgeMode.Custom;
    default:
      return ZubridgeMode.ZustandBasic;
  }
}
