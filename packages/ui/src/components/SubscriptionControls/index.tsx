import React, { useState } from 'react';
import clsx from 'clsx';
import { Button } from '../Button';

interface SubscriptionControlsProps {
  onSubscribe: (keys: string[]) => void;
  onUnsubscribe: (keys: string[]) => void;
  currentSubscriptions: string[] | '*';
  className?: string;
}

export const SubscriptionControls: React.FC<SubscriptionControlsProps> = ({
  onSubscribe,
  onUnsubscribe,
  currentSubscriptions,
  className = '',
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

  return (
    <div className={containerClass}>
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={keys}
            onChange={(e) => setKeys(e.target.value)}
            placeholder="Enter state keys (comma-separated)"
            className="flex-1 px-3 py-2 border rounded-lg bg-[var(--color-bg)] text-[var(--color-text)]"
          />
          <Button onClick={handleSubscribe} variant="create" size="sm">
            Subscribe
          </Button>
          <Button onClick={handleUnsubscribe} variant="reset" size="sm">
            Unsubscribe
          </Button>
        </div>
        <Button onClick={handleSubscribeAll} variant="primary" size="sm">
          Subscribe All
        </Button>
        <div className="text-sm text-[var(--color-text-secondary)]">
          Current Subscriptions: {currentSubscriptions === '*' ? '*' : currentSubscriptions.join(', ')}
        </div>
      </div>
    </div>
  );
};
