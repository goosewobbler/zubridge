#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Script Inputs (Environment Variables) ---
# Note: GitHub Actions automatically makes workflow inputs available as INPUT_*, capitalized.
PACKAGES_INPUT="${INPUT_PACKAGES}" # Require explicit packages to be provided
DRY_RUN="${INPUT_DRY_RUN:-false}"
NEW_VERSION="${NEW_VERSION}" # Needs to be passed explicitly in env block

# --- Input Validation ---
if [[ -z "$NEW_VERSION" ]]; then
  echo "::error::NEW_VERSION environment variable is required."
  exit 1
fi

echo "--- Verification Script Start ---"
echo "Packages Input: $PACKAGES_INPUT"
echo "Dry Run: $DRY_RUN"
echo "Version to Verify: $NEW_VERSION"

# --- Helper Function ---
check_pkg_exists_locally() {
  local raw_pkg_name=$1
  local simple_pkg_name=$(echo "$raw_pkg_name" | sed 's#^@zubridge/##')
  # Check relative to GITHUB_WORKSPACE if set, otherwise current dir
  local base_path="${GITHUB_WORKSPACE:-.}"
  if [[ -f "$base_path/packages/$simple_pkg_name/package.json" ]]; then
    return 0 # Exists
  else
    return 1 # Doesn't exist
  fi
}

# Function to verify a package on npm with retries
verify_package_on_npm() {
  local pkg=$1
  local version=$2
  local max_attempts=5
  local attempt=1
  local initial_wait=15
  local wait_time=$initial_wait

  echo "Starting verification of $pkg@$version (will retry up to $max_attempts times)"

  while [ $attempt -le $max_attempts ]; do
    echo "Attempt $attempt/$max_attempts: Verifying $pkg@$version..."

    # Use pnpm view with --json to get structured output
    pnpm_output=$(pnpm view "$pkg@$version" version --json 2>/dev/null) || true

    if [[ "$pnpm_output" == "\"$version\"" ]]; then
      echo "✅ $pkg@$version verified successfully on attempt $attempt"
      return 0
    else
      if [ $attempt -lt $max_attempts ]; then
        echo "Package $pkg@$version not found on NPM yet. Waiting ${wait_time}s before retry..."
        sleep $wait_time
        # Increase wait time for next attempt (exponential backoff)
        wait_time=$((wait_time * 2))
        attempt=$((attempt + 1))
      else
        echo "::error::Failed to verify $pkg@$version after $max_attempts attempts"
        return 1
      fi
    fi
  done

  return 1
}

# --- Determine Packages to Verify ---
PACKAGES_TO_VERIFY=()
echo "Determining packages to verify..."

# Parse specific packages list
if [[ "$PACKAGES_INPUT" == *","* ]]; then
  # Custom list
  IFS=',' read -ra PKG_LIST <<< "$PACKAGES_INPUT"
  for pkg_raw in "${PKG_LIST[@]}"; do
    pkg_raw_trimmed=$(echo "$pkg_raw" | xargs)
    # Ensure it's scoped and exists locally
    if [[ "$pkg_raw_trimmed" == @zubridge/* ]] && check_pkg_exists_locally "$pkg_raw_trimmed"; then
      PACKAGES_TO_VERIFY+=("$pkg_raw_trimmed")
    else
      echo "::warning::Skipping verification for non-existent/non-scoped package: $pkg_raw_trimmed"
    fi
  done
else
  # Single package
  if [[ "$PACKAGES_INPUT" == @zubridge/* ]] && check_pkg_exists_locally "$PACKAGES_INPUT"; then
    PACKAGES_TO_VERIFY+=("$PACKAGES_INPUT")
  else
    echo "::warning::Skipping verification for non-existent/non-scoped package: $PACKAGES_INPUT"
  fi
fi

echo "Verifying specified packages: ${PACKAGES_TO_VERIFY[*]}"

# Exit if no packages determined for verification
if [[ ${#PACKAGES_TO_VERIFY[@]} -eq 0 ]]; then
  echo "::warning::No valid packages determined for verification based on input '$PACKAGES_INPUT'. Skipping verification."
  exit 0
fi

# --- Dry Run Logic ---
if [[ "$DRY_RUN" == "true" ]]; then
  echo "--- Dry Run Mode --- "
  echo "DRY RUN: Would verify the following packages were published successfully:"
  for pkg in "${PACKAGES_TO_VERIFY[@]}"; do
    echo "  - $pkg@$NEW_VERSION"
  done
  echo "DRY RUN: Would check each package on NPM with exponential backoff retries"
  echo "--- Verification Script End (Dry Run) ---"
  exit 0 # Exit successfully for dry run
fi

# --- Actual Verification Logic ---
echo "--- Actual Verification on NPM --- "
echo "::group::Verifying published packages on NPM"

verification_failed=false
for pkg in "${PACKAGES_TO_VERIFY[@]}"; do
  # Check if pnpm is available
  if ! command -v pnpm &> /dev/null; then
      echo "::error::pnpm command could not be found. Please ensure pnpm is installed and in PATH."
      exit 1
  fi

  if ! verify_package_on_npm "$pkg" "$NEW_VERSION"; then
    verification_failed=true
  fi
done

echo "::endgroup::"

if $verification_failed; then
  echo "::error::One or more packages failed verification after multiple attempts."
  echo "--- Verification Script End (Failed) ---"
  exit 1
else
  echo "All specified packages verified successfully on NPM."
  echo "--- Verification Script End (Success) ---"
fi
