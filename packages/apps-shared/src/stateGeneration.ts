/**
 * Shared state generation utilities for testing across all modes
 */

/**
 * Generate a complex nested object structure
 * @param depth Current depth level
 * @param maxDepth Maximum depth to reach
 * @param width Number of properties per level
 * @param prefix Key prefix for identification
 * @returns A complex nested object
 */
export function generateComplexState(depth = 0, maxDepth = 3, width = 3, prefix = ''): Record<string, any> {
  const result: Record<string, any> = {};

  // Base case - at max depth just create leaf values
  if (depth >= maxDepth) {
    for (let i = 0; i < width; i++) {
      const key = `${prefix}leaf_${i}`;

      // Create different types of values
      switch (i % 5) {
        case 0:
          result[key] = Math.random() * 1000;
          break; // Number
        case 1:
          result[key] = `Value ${Math.random().toString(36).substring(2, 8)}`;
          break; // String
        case 2:
          result[key] = [1, 2, 3, 4, 5].slice(0, Math.floor(Math.random() * 5) + 1);
          break; // Array
        case 3:
          result[key] = new Date().toISOString();
          break; // Date string
        case 4:
          result[key] = Math.random() > 0.5;
          break; // Boolean
      }
    }
    return result;
  }

  // Generate nested structures
  for (let i = 0; i < width; i++) {
    const key = `${prefix}level_${depth}_${i}`;

    // Create different types at each level
    switch (i % 3) {
      case 0:
        // Recursive nested object
        result[key] = generateComplexState(depth + 1, maxDepth, width, `${key}_`);
        break;
      case 1:
        // Array of objects
        result[key] = Array(Math.floor(Math.random() * 3) + 2)
          .fill(null)
          .map((_, idx) => generateComplexState(depth + 1, maxDepth - 1, width - 1, `${key}_item_${idx}_`));
        break;
      case 2:
        // Mix of values and nested objects
        result[key] = {
          id: `ID_${Math.random().toString(36).substring(2, 8)}`,
          timestamp: Date.now(),
          value: Math.random() * 100,
          active: Math.random() > 0.5,
          children: generateComplexState(depth + 1, maxDepth - 1, width - 1, `${key}_child_`),
        };
        break;
    }
  }

  return result;
}

/**
 * Generate a flat object with many simple key-value pairs
 * @param count Number of key-value pairs to generate
 * @returns A flat object with many key-value pairs
 */
export function generateFlatState(count: number): Record<string, number> {
  const result: Record<string, number> = {};
  for (let i = 0; i < count; i++) {
    result[`key${i}`] = Math.random();
  }
  return result;
}

/**
 * Generate a large array of objects
 * @param count Number of objects to generate
 * @param complexity Complexity of each object (1-5)
 * @returns An array of objects
 */
export function generateLargeArray(count: number, complexity = 1): any[] {
  return Array(count)
    .fill(0)
    .map((_, i) => {
      // Basic object structure
      const obj: Record<string, any> = {
        id: i,
        name: `Item ${i}`,
        value: Math.random() * 1000,
        isActive: Math.random() > 0.5,
        timestamp: Date.now() + i,
      };

      // Add more properties based on complexity
      if (complexity >= 2) {
        obj.tags = Array(Math.floor(Math.random() * 5) + 1)
          .fill(0)
          .map(() => Math.random().toString(36).substring(2, 8));
      }

      if (complexity >= 3) {
        obj.metadata = {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: Math.floor(Math.random() * 10) + 1,
        };
      }

      if (complexity >= 4) {
        obj.statistics = {
          views: Math.floor(Math.random() * 1000),
          likes: Math.floor(Math.random() * 100),
          shares: Math.floor(Math.random() * 50),
          comments: Array(Math.floor(Math.random() * 3))
            .fill(0)
            .map(() => ({
              id: Math.random().toString(36).substring(2, 10),
              text: `Comment ${Math.random().toString(36).substring(2, 10)}`,
              author: `User ${Math.floor(Math.random() * 100)}`,
            })),
        };
      }

      if (complexity >= 5) {
        obj.config = generateComplexState(0, 2, 2, `obj${i}_`);
      }

      return obj;
    });
}

/**
 * Generate a comprehensive test state for performance benchmarking
 *
 * @param options Configuration options
 * @param variant The variant of state to generate: small, medium, large, xl
 * @returns A complex state object
 */
export function generateTestState(
  variant: 'small' | 'medium' | 'large' | 'xl' = 'medium',
  options?: Partial<{
    flatSize: number;
    nestedDepth: number;
    nestedWidth: number;
    arraySize: number;
    arrayComplexity: number;
  }>,
): Record<string, any> {
  // Define variants with predetermined sizes
  const variants = {
    small: { flatSize: 100, nestedDepth: 2, nestedWidth: 2, arraySize: 50, arrayComplexity: 2 },
    medium: { flatSize: 1000, nestedDepth: 3, nestedWidth: 3, arraySize: 200, arrayComplexity: 3 },
    large: { flatSize: 5000, nestedDepth: 4, nestedWidth: 4, arraySize: 500, arrayComplexity: 4 },
    xl: { flatSize: 100_000, nestedDepth: 7, nestedWidth: 7, arraySize: 10_000, arrayComplexity: 5 },
  };

  // Get the base configuration from the variant
  const baseConfig = variants[variant];

  // Override with any custom options
  const config = { ...baseConfig, ...(options || {}) };

  return {
    // Legacy flat structure (for backward compatibility)
    flat: generateFlatState(config.flatSize),

    // Complex nested structure
    nested: generateComplexState(0, config.nestedDepth, config.nestedWidth),

    // Arrays of various sizes and complexities
    arrays: {
      numbers: Array(Math.floor(config.flatSize / 2))
        .fill(0)
        .map(() => Math.random() * 1000),
      strings: Array(Math.floor(config.flatSize / 5))
        .fill(0)
        .map(() => Math.random().toString(36).substring(2, 10)),
      objects: generateLargeArray(config.arraySize, config.arrayComplexity),
    },

    // Metadata for verification
    meta: {
      generatedAt: new Date().toISOString(),
      variant,
      options: config,
      estimatedSize: `~${Math.floor(
        (config.flatSize * 8 + // ~8 bytes per flat key-value
          Math.pow(config.nestedWidth, config.nestedDepth) * 20 + // ~20 bytes per nested item
          (config.flatSize / 2) * 8 + // ~8 bytes per number
          (config.flatSize / 5) * 10 + // ~10 bytes per string
          config.arraySize * 50 * config.arrayComplexity) / // ~50 bytes per object × complexity
          1024,
      )} KB`,
    },
  };
}
