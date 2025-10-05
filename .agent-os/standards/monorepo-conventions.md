# Monorepo Conventions

**Version:** 1.0.0
**Last Updated:** 2025-10-05

## Directory vs Package Naming Pattern

### When Directory Name ≠ Package Name

Many monorepos use **short directory names** with **full package names** in manifests:

**Example:**
```
packages/
├── core/                   # Directory: short
│   ├── Cargo.toml          # name = "zubridge-core" (full)
│   └── src/
├── tauri-plugin/           # Directory: short
│   ├── Cargo.toml          # name = "tauri-plugin-zubridge" (full)
│   └── package.json        # name = "@zubridge/tauri-plugin" (scoped)
├── utils/                  # Directory: short
│   └── package.json        # name = "@zubridge/utils" (scoped)
```

### When to Use This Pattern
- Multi-language monorepos (TypeScript + Rust)
- Projects publishing to multiple registries (npm + crates.io)
- Large monorepos where brevity aids navigation

### Implementation Rules
1. **Check existing pattern** in the monorepo first
2. **Directory naming**: Minimal, descriptive (e.g., `core/`, `utils/`)
3. **Rust crate naming**: Full kebab-case with project prefix (e.g., `zubridge-core`)
4. **npm package naming**: Scoped (e.g., `@zubridge/utils`)
5. **Consistency**: Follow the established pattern across all packages

## Package Renaming Checklist

When renaming packages in a monorepo, include these steps in technical specs:

```markdown
### Package Renaming Steps
1. **Rename directory** (if needed): `packages/old-name/` → `packages/new-name/`
2. **Update package manifest**:
   - package.json: `"name": "@scope/old"` → `"name": "@scope/new"`
   - Cargo.toml: `name = "old"` → `name = "new"`
3. **Update all imports** across codebase:
   - Find: `from '@scope/old'` → Replace: `from '@scope/new'`
   - Find: `use old::` → Replace: `use new::`
4. **Update build tool configs**:
   - Turbo pipeline references
   - TypeScript path mappings (tsconfig.json)
   - Workspace dependencies in other packages
5. **Update CI/CD workflows**:
   - Working directory paths
   - Package name references in jobs
6. **Update documentation**:
   - README references
   - Package-specific docs
```

---

## Changelog

### v1.0.0 (2025-10-05)
- Initial version with monorepo package naming conventions
- Added directory vs package naming pattern documentation
- Added implementation rules for multi-language monorepos
- Added package renaming checklist for technical specs
