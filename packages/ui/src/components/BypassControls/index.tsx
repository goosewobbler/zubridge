import type React from 'react';
import { useEffect, useState } from 'react';
import { Button } from '../Button';

interface BypassControlsProps {
  className?: string;
}

export const BypassControls: React.FC<BypassControlsProps> = ({ className = '' }) => {
  // Initialize state from window object or default values
  const [bypassAccessControl, setBypassAccessControl] = useState(
    () => window.dispatchFlags?.bypassAccessControl || false,
  );

  const [immediate, setImmediate] = useState(() => window.dispatchFlags?.immediate || false);

  // Update the window object when state changes
  useEffect(() => {
    // Initialize the global object if it doesn't exist
    if (!window.dispatchFlags) {
      window.dispatchFlags = {
        bypassAccessControl: false,
        immediate: false,
      };
    }

    // Update the global flags
    window.dispatchFlags.bypassAccessControl = bypassAccessControl;
    window.dispatchFlags.immediate = immediate;
  }, [bypassAccessControl, immediate]);

  return (
    <div className={`bypass-controls ${className}`}>
      <h3 className="mb-3 text-lg font-semibold">Dispatch Flags</h3>
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
            onClick={() => setImmediate(!immediate)}
            variant={immediate ? 'primary' : 'secondary'}
            className="flex-1"
          >
            Immediate Dispatch
          </Button>

          {immediate && (
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
          <strong>immediate</strong>: Execute actions immediately, bypassing all queues and locks
        </p>
      </div>
    </div>
  );
};
