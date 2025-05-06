import React from 'react';

// Common component props
export interface BaseProps {
  className?: string;
  id?: string;
}

// Counter method
export type CounterMethod = 'thunk' | 'object' | 'action' | 'main-thunk';

// Button variants
export type ButtonVariant = 'primary' | 'secondary' | 'reset' | 'create' | 'close';

// Button props
export interface ButtonProps extends BaseProps {
  onClick?: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
  children: React.ReactNode;
}

// Counter props
export interface CounterProps extends BaseProps {
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  onDouble: (method: CounterMethod) => void;
  onReset: () => void;
  isLoading?: boolean;
}

// Header props
export interface HeaderProps extends BaseProps {
  windowId: number | string;
  windowTitle: string;
  bridgeStatus?: 'ready' | 'error' | 'initializing';
}

// Theme props
export interface ThemeToggleProps extends BaseProps {
  isDark: boolean;
  onToggle: () => void;
}

// Window Display props
export interface WindowDisplayProps extends BaseProps {
  windowId: number | string;
  windowTitle: string;
  bridgeStatus?: 'ready' | 'error' | 'initializing';
  isRuntimeWindow?: boolean;
  children: React.ReactNode;
}

// Window Actions props
export interface WindowActionsProps extends BaseProps {
  onCreateWindow?: () => void;
  onCloseWindow?: () => void;
  onQuitApp?: () => void;
  isMainWindow?: boolean;
}
