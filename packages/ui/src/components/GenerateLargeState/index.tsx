import React from 'react';
import clsx from 'clsx';
import { Button } from '../Button';

interface GenerateLargeStateProps {
  onGenerate: () => Promise<void>;
  isGenerating?: boolean;
  className?: string;
}

export const GenerateLargeState: React.FC<GenerateLargeStateProps> = ({
  onGenerate,
  isGenerating = false,
  className = '',
}) => {
  const containerClass = clsx('max-w-[theme(--container-width)] mx-auto my-5', className);

  return (
    <div className={containerClass}>
      <Button onClick={onGenerate} variant="primary" loading={isGenerating} disabled={isGenerating} className="w-full">
        Generate Large State
      </Button>
    </div>
  );
};
