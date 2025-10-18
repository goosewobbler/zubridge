import clsx from 'clsx';
import type React from 'react';
import Button from './Button';

/**
 * Props for the ThemeToggle component
 */
interface ThemeToggleProps {
  /**
   * The current theme
   */
  theme: 'light' | 'dark';
  /**
   * Callback to toggle the theme
   */
  onToggle: () => void;
  /**
   * Optional className to allow further styling
   */
  className?: string;
}

/**
 * Theme toggle button component that switches between light and dark themes
 */
export const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onToggle, className = '' }) => {
  const containerClass = clsx('max-w-[theme(--container-width)] mx-auto my-5', className);
  const icon = theme === 'light' ? '🌙' : '☀️';

  // Dynamic styles based on theme
  const buttonStyles = clsx(
    'w-full',
    theme === 'light' ? 'bg-light-bg text-dark-bg' : 'bg-dark-bg text-light-bg',
  );

  return (
    <div className={containerClass}>
      <Button
        className={buttonStyles}
        variant="primary"
        onClick={onToggle}
        aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
      >
        {icon} Switch Theme
      </Button>
    </div>
  );
};

export default ThemeToggle;
