import React, { useState } from 'react';
import clsx from 'clsx';
import { Button } from '../Button';

interface SubscriptionControlsProps {
  onSubscribe: (keys: string[]) => void;
  onUnsubscribe: (keys: string[]) => void;
  className?: string;
  onReset?: () => void;
}

export const SubscriptionControls: React.FC<SubscriptionControlsProps> = ({
  onSubscribe,
  onUnsubscribe,
  className = '',
  onReset,
}) => {
  const [keys, setKeys] = useState('');
  const containerClass = clsx('max-w-[theme(--container-width)] mx-auto my-5', className);

  const handleSubscribe = () => {
    const keyArray = keys
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    if (keyArray.length > 0) {
      onSubscribe(keyArray);
      setKeys('');
    }
  };

  const handleUnsubscribe = () => {
    const keyArray = keys
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    if (keyArray.length > 0) {
      onUnsubscribe(keyArray);
      setKeys('');
    }
  };

  const handleSubscribeAll = () => {
    onSubscribe(['*']);
  };

  const handleUnsubscribeAll = () => {
    onUnsubscribe(['*']);
  };

  return (
    <div className={containerClass}>
      <div className="flex flex-col gap-4">
        <input
          type="text"
          value={keys}
          onChange={(e) => setKeys(e.target.value)}
          placeholder="Enter state keys (comma-separated)"
          className="flex-1 px-3 py-2 border rounded-lg bg-[var(--color-bg)] text-[var(--color-text)] w-full placeholder:text-opacity-60 placeholder:text-[var(--color-text)]"
        />
        <div className="flex gap-4">
          <Button onClick={handleSubscribe} variant="primary" className="flex-1">
            Subscribe
          </Button>
          <Button onClick={handleUnsubscribe} variant="primary" className="flex-1">
            Unsubscribe
          </Button>
        </div>
        <Button onClick={handleSubscribeAll} variant="primary" className="w-full">
          Subscribe All
        </Button>
        <Button onClick={handleUnsubscribeAll} variant="primary" className="w-full">
          Unsubscribe All
        </Button>

        {onReset && (
          <div className="pt-4 mt-4 border-t border-gray-300 dark:border-gray-700">
            <Button onClick={onReset} variant="reset" className="w-full">
              Reset State
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
