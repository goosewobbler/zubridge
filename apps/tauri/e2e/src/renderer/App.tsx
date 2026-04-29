import { invoke } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import {
  createDistinctiveCounterSlowThunk,
  createDistinctiveCounterSlowThunkForSyncHandlers,
  createDistinctiveCounterThunk,
  createDoubleCounterSlowThunk,
  createDoubleCounterSlowThunkForSyncHandlers,
  createDoubleCounterThunk,
  createDoubleCounterWithGetStateOverrideThunk,
  type ThunkContext,
} from '@zubridge/apps-shared';
import { debug } from '@zubridge/core';
import {
  getWindowSubscriptions,
  subscribe as subscribeKeys,
  unsubscribe as unsubscribeKeys,
} from '@zubridge/tauri';
import { withTauri } from '@zubridge/ui/tauri';
import { useEffect, useState } from 'react';
import type { ModeInfo, WindowInfo, WindowType } from '../types/index.js';
import { ZUBRIDGE_MODE_LABELS, ZubridgeMode } from '../utils/mode.js';

const TauriApp = withTauri();

interface AppRootProps {
  windowLabel: string;
}

export function AppRoot({ windowLabel }: AppRootProps) {
  const [windowInfo, setWindowInfo] = useState<WindowInfo | null>(null);
  const [modeInfo, setModeInfo] = useState<ModeInfo | null>(null);
  const [currentSubscriptions, setCurrentSubscriptions] = useState<string[] | '*'>('*');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [info, mode, subs] = await Promise.all([
          invoke<WindowInfo>('get_window_info'),
          invoke<ModeInfo>('get_mode'),
          getWindowSubscriptions().catch(() => [] as string[]),
        ]);
        if (cancelled) return;
        setWindowInfo(info);
        setModeInfo(mode);
        if (subs.length === 0 || subs.includes('*')) {
          setCurrentSubscriptions('*');
        } else {
          setCurrentSubscriptions(subs);
        }
      } catch (error) {
        debug('ui:error', `Failed to bootstrap window info: ${error}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!windowInfo || !modeInfo) {
    return <div>Loading window info...</div>;
  }

  const modeName = (modeInfo.modeName ?? modeInfo.mode ?? 'zustand-basic').toLowerCase();
  const modeKey = (Object.values(ZubridgeMode) as string[]).includes(modeName)
    ? (modeName as ZubridgeMode)
    : ZubridgeMode.ZustandBasic;
  const modeTitle = ZUBRIDGE_MODE_LABELS[modeKey];

  const thunkContext: ThunkContext = {
    environment: 'tauri',
    logPrefix: `RENDERER-${windowInfo.type.toUpperCase()}`,
  };

  const useSyncHandlers =
    modeKey === ZubridgeMode.Redux || modeKey === ZubridgeMode.ZustandReducers;

  const actionHandlers = {
    createWindow: async () => {
      try {
        const result = await invoke<{ success: boolean; windowId: string }>(
          'create_runtime_window',
        );
        return { success: result.success, id: result.windowId };
      } catch (error) {
        debug('ui:error', `Failed to create runtime window: ${error}`);
        return { success: false, error: String(error) };
      }
    },
    closeWindow: async () => {
      try {
        const target = await WebviewWindow.getByLabel(windowLabel);
        if (target) {
          await target.close();
        } else {
          await invoke('close_current_window');
        }
        return { success: true };
      } catch (error) {
        debug('ui:error', `Failed to close window: ${error}`);
        return { success: false, error: String(error) };
      }
    },
    quitApp: async () => {
      try {
        await invoke('quit_app');
        return { success: true };
      } catch (error) {
        debug('ui:error', `Failed to quit app: ${error}`);
        return { success: false, error: String(error) };
      }
    },
    doubleCounter: (counter: number) => createDoubleCounterThunk(counter, thunkContext),
    doubleCounterSlow: (counter: number) =>
      useSyncHandlers
        ? createDoubleCounterSlowThunkForSyncHandlers(counter, thunkContext)
        : createDoubleCounterSlowThunk(counter, thunkContext),
    distinctiveCounter: (counter: number) => createDistinctiveCounterThunk(counter, thunkContext),
    distinctiveCounterSlow: (counter: number) =>
      useSyncHandlers
        ? createDistinctiveCounterSlowThunkForSyncHandlers(counter, thunkContext)
        : createDistinctiveCounterSlowThunk(counter, thunkContext),
    doubleCounterWithGetStateOverride: (counter: number) =>
      createDoubleCounterWithGetStateOverrideThunk(counter, thunkContext),
  };

  const handleSubscribe = async (keys: string[]) => {
    try {
      const subs = await subscribeKeys(keys);
      setCurrentSubscriptions(subs.length > 0 && !subs.includes('*') ? subs : '*');
    } catch (error) {
      debug('ui:error', `Failed to subscribe: ${error}`);
    }
  };

  const handleUnsubscribe = async (keys: string[]) => {
    try {
      const subs = await unsubscribeKeys(keys);
      setCurrentSubscriptions(subs.length === 0 ? [] : subs);
    } catch (error) {
      debug('ui:error', `Failed to unsubscribe: ${error}`);
    }
  };

  return (
    <TauriApp
      windowInfo={{
        id: windowInfo.id,
        type: windowInfo.type as WindowType,
        platform: modeKey,
      }}
      windowTitle={`${windowInfo.type.charAt(0).toUpperCase()}${windowInfo.type.slice(1)} Window`}
      appName={`Zubridge - ${modeTitle} Mode`}
      actionHandlers={actionHandlers}
      currentSubscriptions={currentSubscriptions}
      onSubscribe={handleSubscribe}
      onUnsubscribe={handleUnsubscribe}
    />
  );
}
