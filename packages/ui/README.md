# @zubridge/ui

Shared UI components and styles for Zubridge applications. This package provides reusable components, styling utilities, and themes that can be used across both Electron and Tauri applications.

## Installation

```bash
npm install @zubridge/ui
# or
yarn add @zubridge/ui
```

## Usage

```tsx
import { Button, Counter, ThemeToggle } from '@zubridge/ui';
import '@zubridge/ui/styles.css';

function App() {
  return (
    <div>
      <Counter value={5} onIncrement={() => {}} onDecrement={() => {}} onReset={() => {}} onDouble={() => {}} />
      <ThemeToggle isDark={false} onToggle={() => {}} />
      <Button variant="primary">Click Me</Button>
    </div>
  );
}
```

## Components

The package includes the following components:

- **Button**: Standard button with various styles and variants
- **Counter**: Counter component with increment, decrement, double, and reset actions
- **ThemeToggle**: Toggle button for switching between light and dark themes
- **Header**: Application header with title and status indicator

## Styling with Tailwind CSS

All components use Tailwind CSS for styling. The package includes a pre-built CSS file you can import:

```tsx
import '@zubridge/ui/styles.css';
```

### Adding to Your Project

If you want to customize the UI further, you can extend the Tailwind configuration in your project:

```js
// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './node_modules/@zubridge/ui/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      // Your customizations...
    },
  },
  plugins: [],
};
```

### Theme Customization

Components use Tailwind CSS with customized colors and other design tokens. You can override these in your project's Tailwind config:

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          light: '#a78bfa', // Lighter shade
          DEFAULT: '#8b5cf6', // Base purple
          dark: '#7c3aed', // Darker shade
          darker: '#6d28d9', // Even darker
        },
        // See the full configuration for other colors...
      },
    },
  },
};
```

## Development

```bash
# Install dependencies
npm install

# Run development build with watch mode
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## License

MIT
