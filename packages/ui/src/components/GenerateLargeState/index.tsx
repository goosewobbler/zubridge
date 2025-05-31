import React from 'react';
import clsx from 'clsx';
import { Button } from '../Button';

// Define types for the different parameter options
type StateVariant = 'small' | 'medium' | 'large' | 'xl';
type StateOptions = {
  flatSize: number;
  nestedDepth: number;
  nestedWidth: number;
  arraySize: number;
  arrayComplexity: number;
};

// Define a union type for the handler function
type GenerateHandler =
  | ((variant: StateVariant) => void | Promise<void>)
  | ((options: StateOptions) => void | Promise<void>);

interface GenerateLargeStateProps {
  /**
   * Handler for generating large state
   * Can accept either a variant string or a detailed options object
   */
  onGenerate: GenerateHandler;

  /**
   * Flag to indicate if state generation is in progress
   */
  isGenerating?: boolean;

  /**
   * Additional CSS classes to apply to the component
   */
  className?: string;
}

/**
 * Component for generating large state for performance testing
 * Uses the simple variant approach by default
 */
export const GenerateLargeState: React.FC<GenerateLargeStateProps> = ({
  onGenerate,
  isGenerating = false,
  className = '',
}) => {
  const containerClass = clsx('max-w-[theme(--container-width)] mx-auto my-5', className);

  const handleClick = () => {
    // Cast the function to accept the variant parameter
    (onGenerate as (variant: StateVariant) => void | Promise<void>)('xl');
  };

  return (
    <div className={containerClass}>
      <Button onClick={handleClick} variant="primary" loading={isGenerating} disabled={isGenerating} className="w-full">
        Generate Large State
      </Button>
    </div>
  );
};
