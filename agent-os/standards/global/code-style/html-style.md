# HTML Style Guide

**Biome 2.x handles all HTML formatting automatically.** This guide covers semantic and structural conventions that complement Biome's formatting.

## HTML Structure Guidelines

### Semantic HTML
- Use semantic HTML elements (`<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<aside>`, `<footer>`)
- Prefer semantic elements over generic `<div>` containers
- Use appropriate heading hierarchy (`h1` → `h2` → `h3`, etc.)

### Accessibility
- Always include `alt` attributes for images
- Use proper `aria-*` attributes when needed
- Ensure proper focus management for interactive elements
- Use semantic HTML for better screen reader support

### Form Elements
- Use proper `<label>` elements associated with form controls
- Group related form elements with `<fieldset>` and `<legend>`
- Use appropriate input types (`email`, `tel`, `url`, etc.)

## Biome HTML Formatting

Biome automatically handles:
- **Indentation**: 2 spaces (configured in Biome)
- **Line breaks**: Automatic wrapping at 100 characters
- **Attribute formatting**: Consistent spacing and alignment
- **Self-closing tags**: Automatic conversion where appropriate

## Example

**Before Biome formatting:**
```html
<div class="container"><header class="flex flex-col space-y-2 md:flex-row md:space-y-0 md:space-x-4"><h1 class="text-primary dark:text-primary-300">Page Title</h1><nav class="flex flex-col space-y-2 md:flex-row md:space-y-0 md:space-x-4"><a href="/" class="btn-ghost">Home</a><a href="/about" class="btn-ghost">About</a></nav></header></div>
```

**After Biome formatting (automatic):**
```html
<div class="container">
  <header class="flex flex-col space-y-2 md:flex-row md:space-y-0 md:space-x-4">
    <h1 class="text-primary dark:text-primary-300">Page Title</h1>
    <nav class="flex flex-col space-y-2 md:flex-row md:space-y-0 md:space-x-4">
      <a href="/" class="btn-ghost">Home</a>
      <a href="/about" class="btn-ghost">About</a>
    </nav>
  </header>
</div>
```

## JSX/TSX Considerations
- Use self-closing tags for elements without children: `<img />` instead of `<img></img>`
- Use camelCase for React props: `onClick`, `className`
- Biome handles JSX formatting according to React conventions
