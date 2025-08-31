import React, { useState, useEffect } from 'react';
import { Button } from '../Button';

interface BypassControlsProps {
  className?: string;
}

export const BypassControls: React.FC<BypassControlsProps> = ({ className = '' }) => {
  // Initialize state from window object or default values
  const [bypassAccessControl, setBypassAccessControl] = useState(
    () => window.bypassFlags?.bypassAccessControl || false,
  );

  const [bypassThunkLock, setBypassThunkLock] = useState(
    () => window.bypassFlags?.bypassThunkLock || false,
  );

  // Update the window object when state changes
  useEffect(() => {
    // Initialize the global object if it doesn't exist
    if (!window.bypassFlags) {
      window.bypassFlags = {
        bypassAccessControl: false,
        bypassThunkLock: false,
      };
    }

    // Update the global flags
    window.bypassFlags.bypassAccessControl = bypassAccessControl;
    window.bypassFlags.bypassThunkLock = bypassThunkLock;
  }, [bypassAccessControl, bypassThunkLock]);

  return (
    <div className={`bypass-controls ${className}`}>
      <h3 className="mb-3 text-lg font-semibold">Bypass Flags</h3>
      <div className="flex flex-col gap-3">
        <div className="flex items-center">
          <Button
            onClick={() => setBypassAccessControl(!bypassAccessControl)}
            variant={bypassAccessControl ? 'primary' : 'secondary'}
            className="flex-1"
          >
            Bypass Access Control
          </Button>

          {bypassAccessControl && (
            <div className="px-2 py-1 ml-2 text-xs text-green-800 bg-green-100 rounded-md dark:bg-green-900 dark:text-green-200">
              Enabled
            </div>
          )}
        </div>

        <div className="flex items-center">
          <Button
            onClick={() => setBypassThunkLock(!bypassThunkLock)}
            variant={bypassThunkLock ? 'primary' : 'secondary'}
            className="flex-1"
          >
            Bypass Thunk Lock
          </Button>

          {bypassThunkLock && (
            <div className="px-2 py-1 ml-2 text-xs text-green-800 bg-green-100 rounded-md dark:bg-green-900 dark:text-green-200">
              Enabled
            </div>
          )}
        </div>
      </div>

      <div className="p-3 mt-4 text-sm bg-gray-100 rounded-md dark:bg-gray-800">
        <p className="mb-2">
          <strong>bypassAccessControl</strong>: Allows accessing state that this window isn't
          subscribed to
        </p>
        <p>
          <strong>bypassThunkLock</strong>: Allows actions to execute even when a thunk is in
          progress
        </p>
      </div>
    </div>
  );
};
