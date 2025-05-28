import React from 'react';
import clsx from 'clsx';

import { Button } from '../Button';
import { CounterMethod } from '../../types';

interface CounterProps {
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
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
  onDouble,
  isLoading = false,
  className = '',
}) => {
  const rootClass = clsx('max-w-[theme(--container-width)] mx-auto my-5 mt-[60px]', className);

  return (
    <div className={rootClass}>
      <div className="flex flex-col items-center gap-4">
        <div className="flex justify-between w-full gap-4">
          <Button onClick={onDecrement} disabled={isLoading} aria-label="Decrement counter" className="flex-1">
            -
          </Button>
          <Button onClick={onIncrement} disabled={isLoading} aria-label="Increment counter" className="flex-1">
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
          onClick={() => onDouble('slow-main-thunk')}
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
        <Button
          onClick={() => onDouble('slow-object')}
          disabled={isLoading}
          aria-label="Double counter using slow action"
          className="w-full"
        >
          Double (Slow Object)
        </Button>
      </div>
    </div>
  );
};

export default Counter;
