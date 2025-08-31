import clsx from 'clsx';
import type React from 'react';
import type { CounterMethod } from '../../types';
import { Button } from '../Button';

interface CounterActionsProps {
  onIncrement: () => void;
  onDecrement: () => void;
  onDouble: (method: CounterMethod) => void;
  onDistinctive?: (method: CounterMethod) => void;
  isLoading?: boolean;
  className?: string;
}

/**
 * CounterActions component with controls for counter operations
 */
export const CounterActions: React.FC<CounterActionsProps> = ({
  onIncrement,
  onDecrement,
  onDouble,
  onDistinctive,
  isLoading = false,
  className = '',
}) => {
  const rootClass = clsx('max-w-[theme(--container-width)] mx-auto my-5 mt-[60px]', className);

  return (
    <div className={rootClass}>
      <div className="flex flex-col items-center gap-4">
        <div className="flex justify-between w-full gap-4">
          <Button
            onClick={onDecrement}
            disabled={isLoading}
            aria-label="Decrement counter"
            className="flex-1"
          >
            -
          </Button>
          <Button
            onClick={onIncrement}
            disabled={isLoading}
            aria-label="Increment counter"
            className="flex-1"
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
          onClick={() => onDouble('thunk-get-state-override')}
          disabled={isLoading}
          aria-label="Double counter using renderer thunk with getState override"
          className="w-full"
          data-testid="doubleRendererGetStateOverride"
        >
          Double (GetState Override)
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
        {onDistinctive && (
          <Button
            onClick={() => onDistinctive('thunk')}
            disabled={isLoading}
            aria-label="Apply distinctive pattern (multiply by 3, add 2, subtract 1)"
            className="w-full"
            data-testid="distinctive-pattern-btn"
          >
            Distinctive Pattern (×3→+2→−1)
          </Button>
        )}
        {onDistinctive && (
          <Button
            onClick={() => onDistinctive('slow-thunk')}
            disabled={isLoading}
            aria-label="Apply distinctive pattern slowly (multiply by 3, add 2, subtract 1)"
            className="w-full"
            data-testid="distinctive-pattern-slow-btn"
          >
            Distinctive Pattern Slow (×3→+2→−1)
          </Button>
        )}
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
