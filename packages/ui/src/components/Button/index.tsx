import clsx from 'clsx';
import type React from 'react';
import type { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'create' | 'reset' | 'close' | 'link' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

/**
 * Button component with various styles based on the variant prop
 */
export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  disabled = false,
  children,
  ...props
}) => {
  // Generate Tailwind classes based on variant
  const getVariantClasses = () => {
    switch (variant) {
      case 'create':
        return 'bg-[var(--color-create)] hover:bg-[var(--color-create-hover)] active:bg-[var(--color-create-active)]';
      case 'reset':
        return 'bg-[var(--color-reset)] hover:bg-[var(--color-reset-hover)] active:bg-[var(--color-reset-active)]';
      case 'close':
        return 'bg-[var(--color-close)] hover:bg-[var(--color-close-hover)] active:bg-[var(--color-close-active)]';
      case 'secondary':
        return 'bg-purple-400 hover:bg-purple-500 active:bg-purple-600';
      case 'link':
        return 'bg-transparent text-primary hover:text-primary-dark underline hover:no-underline';
      case 'outline':
        return 'bg-transparent border border-primary text-primary hover:bg-primary/10';
      default:
        return 'bg-primary hover:bg-primary-dark active:bg-primary-darker';
    }
  };

  // Generate Tailwind classes based on size
  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'py-1 px-3 text-xs';
      case 'lg':
        return 'py-3 px-6 text-base';
      default:
        return 'py-2 px-4 text-sm';
    }
  };

  const buttonClasses = clsx(
    // Base styles
    'cursor-pointer font-medium rounded-lg transition-all duration-200 min-w-[theme(--button-width)] whitespace-nowrap w-full',
    // Text color (white for most variants)
    variant !== 'link' && variant !== 'outline' ? 'text-white' : '',
    // Variant specific styles
    getVariantClasses(),
    // Size specific styles
    getSizeClasses(),
    // Interactive states
    'hover:-translate-y-[1px] hover:shadow-sm',
    'active:translate-y-[1px] active:shadow-none',
    // Disabled state
    (disabled || loading) &&
      'bg-gray-400 cursor-not-allowed transform-none hover:bg-gray-400 hover:shadow-none',
    // Custom classes
    className,
  );

  return (
    <button className={buttonClasses} disabled={disabled || loading} {...props}>
      {loading ? <span className="inline-block">Loading...</span> : children}
    </button>
  );
};

export default Button;
