# Debugging Zubridge

Zubridge includes a built-in debugging utility that allows you to control logging across different parts of the package. This helps you understand what's happening under the hood, diagnose issues, and optimize your application.

The debugging system is built on the popular [debug](https://www.npmjs.com/package/debug) package, providing a standardized approach to debugging.

## Enabling Debug Mode

You can enable debugging in multiple ways:

### Environment Variables

The simplest way to enable debug mode using environment variables:

```bash
# Enable all Zubridge debugging
DEBUG=zubridge:* electron .

# Enable specific areas only
DEBUG=zubridge:ipc,zubridge:core electron .

# Alternative: Enable all Zubridge debugging with the ZUBRIDGE_DEBUG flag
ZUBRIDGE_DEBUG=true electron .
```

This approach works in both Node.js and Electron environments.

### Programmatic Control

For more fine-grained control in your code, you can use the debugging API:

```typescript
import { debug } from '@zubridge/core';

// Enable all debugging
debug.enable();

// Enable debugging for specific areas only
debug.enable(['ipc', 'core']);

// Disable debugging entirely
debug.disable();

// Check if debugging is enabled for a specific area
const isIpcDebugEnabled = debug.isEnabled('ipc');
```

## Debug Areas

Zubridge's debug utility organizes logs into several namespaces:

| Namespace                | Description                                             |
| ------------------------ | ------------------------------------------------------- |
| `zubridge:core`          | Core bridge functionality, initialization and lifecycle |
| `zubridge:ipc`           | IPC communication between renderer and main processes   |
| `zubridge:middleware`    | Middleware execution and tracking                        |
| `zubridge:thunk`         | Thunk processing, sequencing, and lifecycle management |
| `zubridge:windows`       | Window tracking and management                          |
| `zubridge:adapters`      | Zustand and Redux adapter-specific operations           |
| `zubridge:subscription`  | State subscription management                           |
| `zubridge:queue`         | Action queue processing and management                  |
| `zubridge:store`         | Handler resolution and store operations                 |
| `zubridge:scheduler`     | Action scheduling and priority management               |
| `zubridge:renderer`      | Renderer process operations                             |

## Direct Debugging

You can also use the debug utility directly in your code:

```typescript
import { debug } from '@zubridge/core';

// Log to the 'store' area if enabled
debug('store', 'Custom store operation:', myStoreData);

// Add your own custom area
debug('myFeature', 'Custom feature initialized');
```

## Browser/DevTools Integration

The `debug` package also works in browser environments. When debugging in the Electron renderer process, you can control debug output in the DevTools console:

```javascript
// In the browser console
localStorage.debug = 'zubridge:*'; // Enable all Zubridge debugging
localStorage.debug = 'zubridge:ipc,zubridge:store'; // Enable specific areas
localStorage.debug = ''; // Disable debugging
```

## Integration with Middleware

The debug utilities work alongside Zubridge's middleware logging system. While the debug utilities provide general operational logging, the middleware is specifically designed for logging IPC traffic and state changes.

When using both:

```typescript
import { createZustandBridge } from '@zubridge/electron/main';
import { createLoggingMiddleware } from '@zubridge/electron/middleware';
import { debug } from '@zubridge/core';

// Enable debugging for all components
debug.enable();

// Create middleware with its own, more detailed logging configuration
const middleware = createLoggingMiddleware({
  enabled: true,
  console: true,
  measure_performance: true,
  pretty_print: true,
});

// Create bridge with middleware
const bridge = createZustandBridge(store, windows, { middleware });
```

## Performance Considerations

Debugging can impact performance, especially in production environments. We recommend:

1. Disabling debug mode in production
2. Enabling only specific areas when diagnosing issues

## Troubleshooting with Debug Output

Common troubleshooting patterns:

1. **Action not being processed**: Enable `zubridge:ipc` and `zubridge:core` debug areas to trace action flow
2. **Windows not receiving updates**: Enable `zubridge:windows` debug area to see window tracking
3. **Handler resolution issues**: Enable `zubridge:store` to see action-to-handler matching
4. **Performance issues**: Enable `zubridge:core` with performance middleware to identify bottlenecks
5. **Thunk sequencing issues**: Enable `zubridge:thunk` and `zubridge:core` to see action deferral and thunk completion
6. **Middleware problems**: Enable `zubridge:middleware` to trace middleware execution and errors
7. **Resource management issues**: Enable `zubridge:ipc`, `zubridge:windows`, and `zubridge:core` to monitor cleanup and destruction

## Debugging Features

Here are some examples of enabling debugging for specific Zubridge features:

### Action Sequencing Debug

```bash
# Debug action deferral and thunk locking
DEBUG=zubridge:core,zubridge:ipc electron .
```

Look for log messages about:
- Action deferral when thunks are running
- Thunk registration and completion
- Action queue processing

### Async Action Debug

```bash
# Debug promise-based actions and error propagation
DEBUG=zubridge:ipc,zubridge:middleware electron .
```

Monitor:
- Action acknowledgments and completions
- Error propagation from main to renderer
- Timeout handling

### Bypass Flags Debug

```bash
# Debug bypass flag usage
DEBUG=zubridge:core electron .
```

Watch for:
- Actions bypassing thunk locks
- Access control overrides
- Security-related warnings
