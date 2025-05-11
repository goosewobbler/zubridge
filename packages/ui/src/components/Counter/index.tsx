import React from 'react';
import clsx from 'clsx';

import { Button } from '../Button';
import { CounterMethod } from '../../types';

interface CounterProps {
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  onReset: () => void;
  onDouble: (method: CounterMethod) => void;
  isLoading?: boolean;
  className?: string;
}

/**
 * Counter component with controls for incrementing, decrementing, doubling, and resetting
 */
export const Counter: React.FC<CounterProps> = ({
  value = 0,
  onIncrement,
  onDecrement,
  onReset,
  onDouble,
  isLoading = false,
  className = '',
}) => {
  const rootClass = clsx('text-center mx-auto', className);

  return (
    <div className={rootClass}>
      <div>
        <h2 className="mb-4 text-2xl font-bold">Counter: {isLoading ? '...' : value}</h2>
        <div className="flex flex-col items-center gap-3 max-w-[theme(--container-width)] mx-auto">
          <div className="flex justify-between w-full gap-3" style={{ width: '300px' }}>
            <Button
              onClick={onDecrement}
              disabled={isLoading}
              aria-label="Decrement counter"
              style={{ width: 'calc(50% - 6px)' }}
            >
              -
            </Button>
            <Button
              onClick={onIncrement}
              disabled={isLoading}
              aria-label="Increment counter"
              style={{ width: 'calc(50% - 6px)' }}
            >
              +
            </Button>
          </div>
          <Button
            onClick={() => onDouble('thunk')}
            disabled={isLoading}
            aria-label="Double counter using renderer thunk"
            className="w-full"
          >
            Double (Renderer Thunk)
          </Button>
          <Button
            onClick={() => onDouble('slow-thunk')}
            disabled={isLoading}
            aria-label="Double counter using slow renderer thunk"
            className="w-full"
          >
            Double (Renderer Slow Thunk)
          </Button>
          <Button
            onClick={() => onDouble('main-thunk')}
            disabled={isLoading}
            aria-label="Double counter using main process thunk"
            className="w-full"
          >
            Double (Main Thunk)
          </Button>
          <Button
            onClick={() => onDouble('main-slow-thunk')}
            disabled={isLoading}
            aria-label="Double counter using slow main process thunk"
            className="w-full"
          >
            Double (Main Slow Thunk)
          </Button>
          <Button
            onClick={() => onDouble('object')}
            disabled={isLoading}
            aria-label="Double counter using action"
            className="w-full"
          >
            Double (Object)
          </Button>
          <Button variant="reset" onClick={onReset} disabled={isLoading} aria-label="Reset counter" className="w-full">
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Counter;
