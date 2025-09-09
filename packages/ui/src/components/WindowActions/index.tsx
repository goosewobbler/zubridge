import clsx from 'clsx';
import type React from 'react';
import { Button } from '../Button';

interface WindowActionsProps {
  onClose?: () => void;
  onCloseWindow?: () => void;
  onQuitApp?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onOpenDevTools?: () => void;
  onCreateWindow?: () => void;
  className?: string;
  isMainWindow?: boolean;
}

/**
 * WindowActions component that provides buttons for window management
 */
export const WindowActions: React.FC<WindowActionsProps> = ({
  onClose,
  onCloseWindow,
  onQuitApp,
  onMinimize,
  onMaximize,
  onOpenDevTools,
  onCreateWindow,
  className = '',
  isMainWindow = false,
}) => {
  const handleClose = onClose || onCloseWindow;

  const containerClasses = clsx('max-w-[theme(--container-width)] mx-auto my-4', className);

  const showCreateWindow = Boolean(onCreateWindow);
  const showQuitApp = Boolean(onQuitApp && isMainWindow);
  const showClose = Boolean(handleClose && !isMainWindow);

  // For main window: Create + Quit side by side
  // For non-main: Create + Close side by side
  const showSideBySideButtons = showCreateWindow || showQuitApp || showClose;

  // Determine which button pairs with Create Window
  const _pairWithCreate = isMainWindow ? showQuitApp : showClose;
  // The second button is either Quit (main window) or Close (non-main)
  const secondButton = isMainWindow ? showQuitApp : showClose;
  const secondButtonAction = isMainWindow ? onQuitApp : handleClose;
  const secondButtonVariant = 'close';
  const secondButtonText = isMainWindow ? 'Quit App' : 'Close';

  return (
    <div className={containerClasses}>
      <div className="flex flex-col items-center gap-3">
        {/* Create Window and Quit/Close side by side */}
        {showSideBySideButtons && (
          <div className="flex w-full justify-between gap-3" style={{ width: '300px' }}>
            {showCreateWindow ? (
              <Button
                onClick={onCreateWindow}
                variant="create"
                style={{ width: secondButton ? 'calc(50% - 6px)' : '100%' }}
              >
                Create Window
              </Button>
            ) : null}

            {secondButton ? (
              <Button
                onClick={secondButtonAction}
                variant={secondButtonVariant}
                style={{ width: showCreateWindow ? 'calc(50% - 6px)' : '100%' }}
              >
                {secondButtonText}
              </Button>
            ) : null}
          </div>
        )}

        {onMinimize && (
          <Button onClick={onMinimize} variant="outline" className="w-full">
            Minimize
          </Button>
        )}

        {onMaximize && (
          <Button onClick={onMaximize} variant="outline" className="w-full">
            Maximize
          </Button>
        )}

        {onOpenDevTools && (
          <Button onClick={onOpenDevTools} variant="secondary" className="w-full">
            Dev Tools
          </Button>
        )}
      </div>
    </div>
  );
};

export default WindowActions;
