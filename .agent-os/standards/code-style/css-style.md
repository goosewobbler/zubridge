# CSS Style Guide

We always use the latest version of TailwindCSS for all CSS. **Biome 2.x handles all CSS formatting and TailwindCSS class ordering automatically.**

## TailwindCSS Guidelines

### Class Organization
- **Biome handles class ordering automatically** - no manual organization needed
- Use semantic class grouping in your mind, but let Biome format the final output
- Custom CSS classes should be included alongside Tailwind classes

### Responsive Design
- Use standard Tailwind breakpoints: `sm`, `md`, `lg`, `xl`, `2xl`
- Custom `xs` breakpoint (400px) is available when needed
- Let Biome handle the formatting of responsive class chains

### Dark Mode
- Use `dark:` prefix for dark mode variants
- Biome will organize these classes appropriately

### Hover and Focus States
- Use `hover:` and `focus:` prefixes as needed
- Biome handles the positioning of these classes

## Example

**Before Biome formatting:**
```html
<div class="custom-cta bg-gray-50 dark:bg-gray-900 p-4 rounded cursor-pointer w-full hover:bg-gray-100 dark:hover:bg-gray-800 xs:p-6 sm:p-8 sm:font-medium md:p-10 md:text-lg lg:p-12 lg:text-xl lg:font-semibold lg:w-3/5 xl:p-14 xl:text-2xl 2xl:p-16 2xl:text-3xl 2xl:font-bold 2xl:w-3/4">
  I'm a call-to-action!
</div>
```

**After Biome formatting (automatic):**
```html
<div class="custom-cta bg-gray-50 p-4 rounded cursor-pointer w-full hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-800 xs:p-6 sm:p-8 sm:font-medium md:p-10 md:text-lg lg:p-12 lg:text-xl lg:font-semibold lg:w-3/5 xl:p-14 xl:text-2xl 2xl:p-16 2xl:text-3xl 2xl:font-bold 2xl:w-3/4">
  I'm a call-to-action!
</div>
```

## Custom CSS
- Keep custom CSS minimal and focused on TailwindCSS gaps
- Use CSS custom properties for design tokens
- Biome will format custom CSS according to standard rules
