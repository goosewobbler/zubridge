# JavaScript Style Guide

**Biome 2.x handles all JavaScript/TypeScript formatting automatically.** This guide covers coding conventions and patterns that complement Biome's formatting.

## Biome JavaScript Configuration

Biome automatically handles:
- **Indentation**: 2 spaces
- **Line width**: 100 characters
- **Quotes**: Single quotes for strings
- **Semicolons**: Always required
- **Trailing commas**: Always added
- **Import organization**: Automatic sorting and grouping

## JavaScript Conventions

### Variable Declarations
- Use `const` by default, `let` when reassignment is needed
- Avoid `var` - use `const` or `let` instead
- Use descriptive variable names that explain intent

### Functions
- Prefer arrow functions for short, simple functions
- Use function declarations for complex logic or when hoisting is needed
- Use default parameters instead of `||` fallbacks
- Keep functions focused on a single responsibility

### TypeScript
- Use explicit types for function parameters and return values
- Prefer interfaces over types for object shapes
- Use `unknown` instead of `any` when type is truly unknown
- Use type assertions sparingly and with proper type guards

### Async/Await
- Prefer `async/await` over Promise chains
- Handle errors with try/catch blocks
- Use `Promise.all()` for parallel operations
- Avoid mixing async/await with Promise chains

### Error Handling
- Use specific error types when possible
- Always handle errors appropriately
- Log errors with context for debugging
- Use early returns to reduce nesting

### Conditional Logic
- **Never use nested ternary statements** - extract logic into separate functions or use if/else statements
- Use early returns to reduce nesting
- Prefer explicit if/else statements over complex ternary expressions
- Extract complex conditions into well-named boolean variables

### Module Organization
- Import directly from source files: `import { Component } from './components/Button'`
- Prefer explicit imports over re-exports for better tree-shaking
- Use consistent import ordering (external → internal → relative)

## Examples

### Basic Formatting

**Before Biome formatting:**
```javascript
const user={name:"John",age:30,email:"john@example.com"};function processUser(user){if(!user.email){throw new Error("Email is required");}return{...user,processed:true};}const result=processUser(user);console.log(result);
```

**After Biome formatting (automatic):**
```javascript
const user = {
  name: 'John',
  age: 30,
  email: 'john@example.com',
};

function processUser(user) {
  if (!user.email) {
    throw new Error('Email is required');
  }
  return {
    ...user,
    processed: true,
  };
}

const result = processUser(user);
console.log(result);
```

### Avoiding Nested Ternaries

**❌ Avoid nested ternaries:**
```javascript
// Don't do this - hard to read and maintain
const status = user.isActive 
  ? user.hasPermission 
    ? user.role === 'admin' 
      ? 'active-admin' 
      : 'active-user'
    : 'inactive'
  : 'suspended';
```

**✅ Extract logic instead:**
```javascript
// Do this - clear and maintainable
function getUserStatus(user) {
  if (!user.isActive) {
    return 'suspended';
  }
  
  if (!user.hasPermission) {
    return 'inactive';
  }
  
  return user.role === 'admin' ? 'active-admin' : 'active-user';
}

const status = getUserStatus(user);
```

### Import Organization

**✅ Proper import ordering:**
```javascript
// External libraries first
import React from 'react';
import { useState, useEffect } from 'react';
import { NextPage } from 'next';

// Internal modules
import { Button } from './components/Button';
import { useAuth } from '../hooks/useAuth';

// Relative imports last
import './styles.css';
```

## React/JSX Conventions
- Use functional components with hooks
- Use `useCallback` and `useMemo` for performance optimization
- Extract custom hooks for reusable logic
- Use proper dependency arrays in useEffect
- Prefer composition over inheritance
