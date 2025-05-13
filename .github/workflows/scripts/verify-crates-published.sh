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

echo "--- Crates.io Verification Script Start ---"
echo "Packages Input: $PACKAGES_INPUT"
echo "Dry Run: $DRY_RUN"
echo "Version to Verify: $NEW_VERSION"

# --- Helper Functions ---
# Function to map directory name to crate name
get_crate_name() {
  local pkg_dir=$1

  case "$pkg_dir" in
    "tauri-plugin")
      echo "tauri-plugin-zubridge"
      ;;
    "middleware")
      echo "zubridge-middleware"
      ;;
    *)
      echo ""
      ;;
  esac
}

# Function to check if a package is a Rust crate
is_rust_crate() {
  local pkg_dir=$1
  case "$pkg_dir" in
    "tauri-plugin"|"middleware")
      return 0 # True, is a Rust crate
      ;;
    *)
      return 1 # False, not a Rust crate
      ;;
  esac
}

# Function to verify a crate on crates.io with retries
verify_crate_on_cratesio() {
  local crate_name=$1
  local version=$2
  local max_attempts=10
  local attempt=1
  local initial_wait=30
  local wait_time=$initial_wait

  echo "Starting verification of $crate_name@$version (will retry up to $max_attempts times)"

  while [ $attempt -le $max_attempts ]; do
    echo "Attempt $attempt/$max_attempts: Verifying $crate_name@$version..."

    # Make a direct API request to crates.io
    api_output=$(curl -s "https://crates.io/api/v1/crates/$crate_name/$version" | grep -E "\"version\":\"$version\"") || true

    if [[ -n "$api_output" ]]; then
      echo "✅ $crate_name@$version verified successfully via crates.io API on attempt $attempt"
      return 0
    fi

    if [ $attempt -lt $max_attempts ]; then
      echo "Crate $crate_name@$version not found on crates.io yet. Waiting ${wait_time}s before retry..."
      sleep $wait_time
      # Increase wait time for next attempt (exponential backoff)
      wait_time=$((wait_time * 2))
      attempt=$((attempt + 1))
    else
      echo "::error::Failed to verify $crate_name@$version after $max_attempts attempts"
      return 1
    fi
  done

  return 1
}

# --- Determine Crates to Verify ---
CRATES_TO_VERIFY=()
echo "Determining crates to verify..."

# Parse specific packages list
if [[ "$PACKAGES_INPUT" == *","* ]]; then
  # Custom list of package directories
  IFS=',' read -ra PKG_LIST <<< "$PACKAGES_INPUT"
  for pkg_dir in "${PKG_LIST[@]}"; do
    pkg_dir_trimmed=$(echo "$pkg_dir" | xargs)

    # Only process Rust crates
    if is_rust_crate "$pkg_dir_trimmed"; then
      crate_name=$(get_crate_name "$pkg_dir_trimmed")
      if [[ -n "$crate_name" ]]; then
        CRATES_TO_VERIFY+=("$crate_name")
        echo "Will verify crate $crate_name from directory $pkg_dir_trimmed"
      else
        echo "::warning::Could not determine crate name for directory: $pkg_dir_trimmed"
      fi
    else
      echo "Skipping non-Rust package: $pkg_dir_trimmed"
    fi
  done
else
  # Single package directory
  if is_rust_crate "$PACKAGES_INPUT"; then
    crate_name=$(get_crate_name "$PACKAGES_INPUT")
    if [[ -n "$crate_name" ]]; then
      CRATES_TO_VERIFY+=("$crate_name")
      echo "Will verify crate $crate_name from directory $PACKAGES_INPUT"
    else
      echo "::warning::Could not determine crate name for directory: $PACKAGES_INPUT"
    fi
  else
    echo "Skipping non-Rust package: $PACKAGES_INPUT"
  fi
fi

echo "Verifying specified crates: ${CRATES_TO_VERIFY[*]}"

# Exit if no crates determined for verification
if [[ ${#CRATES_TO_VERIFY[@]} -eq 0 ]]; then
  echo "::warning::No valid Rust crates determined for verification based on input '$PACKAGES_INPUT'. Skipping verification."
  exit 0
fi

# --- Dry Run Logic ---
if [[ "$DRY_RUN" == "true" ]]; then
  echo "--- Dry Run Mode --- "
  echo "DRY RUN: Would verify the following crates were published successfully:"
  for crate in "${CRATES_TO_VERIFY[@]}"; do
    echo "  - $crate@$NEW_VERSION"
  done
  echo "DRY RUN: Would check each crate on crates.io with exponential backoff retries"
  echo "--- Verification Script End (Dry Run) ---"
  exit 0 # Exit successfully for dry run
fi

# --- Actual Verification Logic ---
echo "--- Actual Verification on crates.io --- "
echo "::group::Verifying published crates on crates.io"

verification_failed=false
for crate in "${CRATES_TO_VERIFY[@]}"; do
  # Check if curl is available
  if ! command -v curl &> /dev/null; then
      echo "::error::curl command could not be found. Please ensure curl is installed and in PATH."
      exit 1
  fi

  if ! verify_crate_on_cratesio "$crate" "$NEW_VERSION"; then
    verification_failed=true
  fi
done

echo "::endgroup::"

if $verification_failed; then
  echo "::error::One or more crates failed verification after multiple attempts."
  echo "--- Verification Script End (Failed) ---"
  exit 1
else
  echo "All specified crates verified successfully on crates.io."
  echo "--- Verification Script End (Success) ---"
fi
