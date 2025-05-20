#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.

echo "Setting up E2E environment for $APP_INPUT ($MODE_INPUT) on Linux"
echo "APP_DIR: $APP_DIR_INPUT"
echo "MODE: $MODE_INPUT"

# Ensure WebKitWebDriver is available and set path for tauri-driver
if [[ "$APP_INPUT" == "tauri" || "$APP_INPUT" == "tauri-v1" ]]; then
  echo "Searching for WebKitWebDriver..."
  WEBKIT_DRIVER_PATH=""
  # Attempt 1: `which` command
  WEBKIT_DRIVER_PATH=$(which WebKitWebDriver || true)

  # Attempt 2: Common known paths if `which` fails
  if [ -z "$WEBKIT_DRIVER_PATH" ] || [ ! -f "$WEBKIT_DRIVER_PATH" ]; then
    echo "WebKitWebDriver not found via 'which'. Checking common installed paths..."
    COMMON_PATHS=(
      "/usr/lib/x86_64-linux-gnu/webkit2gtk-4.0/WebKitWebDriver"
      "/usr/libexec/WebKitWebDriver"
      "/usr/lib/webkit2gtk-4.0/WebKitWebDriver"
      "/usr/lib/webkit2gtk-5.0/WebKitWebDriver"
    )
    for path_to_check in "${COMMON_PATHS[@]}"; do
      if [ -f "$path_to_check" ]; then
        WEBKIT_DRIVER_PATH="$path_to_check"
        echo "Found WebKitWebDriver at $WEBKIT_DRIVER_PATH"
        break
      fi
    done
  fi

  # Attempt 3: Broad file search if still not found
  if [ -z "$WEBKIT_DRIVER_PATH" ] || [ ! -f "$WEBKIT_DRIVER_PATH" ]; then
    echo "::warning::WebKitWebDriver not found by common paths. Attempting broad search..."
    WEBKIT_DRIVER_PATH=$(find /usr -name WebKitWebDriver -type f -print -quit 2>/dev/null || true)
  fi

  # Set environment variable if found
  if [ ! -z "$WEBKIT_DRIVER_PATH" ] && [ -f "$WEBKIT_DRIVER_PATH" ]; then
    echo "Using WebKitWebDriver at: $WEBKIT_DRIVER_PATH"
    echo "TAURI_WEBDRIVER_WEBKITDRIVER_PATH=$WEBKIT_DRIVER_PATH" >> $GITHUB_ENV
    echo "Exported TAURI_WEBDRIVER_WEBKITDRIVER_PATH to GITHUB_ENV"
  else
    echo "::error::WebKitWebDriver could not be found after all attempts. tauri-driver will likely fail."
  fi
fi

# shared-packages artifact is now downloaded by the workflow YAML

echo "Listing contents of packages/ (after shared-packages download by workflow):"
ls -R packages/ 2>/dev/null || echo "packages/ directory not found or empty."
echo "Listing contents of packages/tauri-plugin (if exists):"
ls -R packages/tauri-plugin 2>/dev/null || echo "packages/tauri-plugin not found or empty."


# Download build artifact for the specific app
# ARTIFACT_NAME_INPUT is expected to be like 'app-mode-os-buildid'
echo "Attempting to download app artifact: $ARTIFACT_NAME_INPUT using tag $RELEASE_TAG_INPUT"

mkdir -p apps/"$APP_DIR_INPUT"/build_output
cd apps/"$APP_DIR_INPUT"/build_output

DOWNLOADED_APP_ARTIFACT_NAME="${ARTIFACT_NAME_INPUT}.zip" # Default to .zip for release assets

echo "Attempting to download from GitHub Release: $RELEASE_TAG_INPUT asset pattern ${DOWNLOADED_APP_ARTIFACT_NAME}"
if ! gh release download "$RELEASE_TAG_INPUT" -p "$DOWNLOADED_APP_ARTIFACT_NAME" --repo "$GITHUB_REPOSITORY" --clobber; then
  echo "Failed to download $DOWNLOADED_APP_ARTIFACT_NAME from release. Attempting to download $ARTIFACT_NAME_INPUT from workflow artifacts (run_id: $GITHUB_RUN_ID)..."
  # gh run download downloads the artifact as a zip if it's a directory upload
  if ! gh run download "$GITHUB_RUN_ID" -n "$ARTIFACT_NAME_INPUT" --repo "$GITHUB_REPOSITORY"; then
    echo "::error::Failed to download app artifact from release (as $DOWNLOADED_APP_ARTIFACT_NAME) AND from workflow run (as $ARTIFACT_NAME_INPUT)."
    exit 1
  fi
  echo "Successfully downloaded $ARTIFACT_NAME_INPUT artifact from workflow run (this will be a .zip file)."
  # If downloaded from workflow, the file will be named $ARTIFACT_NAME_INPUT.zip
  # (gh run download automatically zips directory artifacts and appends .zip if no specific file given)
  # However, the -n flag downloads the artifact preserving its name. If it was a dir, it's zipped.
  # Let's assume it IS zipped and the name of the zip file matches ARTIFACT_NAME_INPUT
  # If the artifact uploaded was a directory, `gh run download` creates a zip file.
  # We need to find that zip. Often it's simply named after the artifact.
  # The `gh run download -n "$ARTIFACT_NAME_INPUT"` command downloads the artifact, which is a zip file,
  # and names it "$ARTIFACT_NAME_INPUT" (without an additional .zip extension).

  # DOWNLOADED_APP_ARTIFACT_NAME is still "${ARTIFACT_NAME_INPUT}.zip" for the unzip step later
  # The actual downloaded file from `gh run download` will be named "$ARTIFACT_NAME_INPUT"
  ACTUAL_DOWNLOADED_FILE_FROM_RUN="$ARTIFACT_NAME_INPUT"

  if [ ! -f "$ACTUAL_DOWNLOADED_FILE_FROM_RUN" ]; then
      echo "::error:: Workflow artifact $ACTUAL_DOWNLOADED_FILE_FROM_RUN not found after gh run download."
      ls -la .
      exit 1
  else
      echo "Successfully found workflow artifact $ACTUAL_DOWNLOADED_FILE_FROM_RUN. Renaming to $DOWNLOADED_APP_ARTIFACT_NAME for unzipping."
      mv "$ACTUAL_DOWNLOADED_FILE_FROM_RUN" "$DOWNLOADED_APP_ARTIFACT_NAME"
  fi
else
  echo "Successfully downloaded $DOWNLOADED_APP_ARTIFACT_NAME from release."
fi

if [ ! -f "$DOWNLOADED_APP_ARTIFACT_NAME" ]; then
  echo "::error::Artifact zip file $DOWNLOADED_APP_ARTIFACT_NAME not found after download attempts."
  ls -la .
  exit 1
fi

unzip -o "$DOWNLOADED_APP_ARTIFACT_NAME"
rm "$DOWNLOADED_APP_ARTIFACT_NAME"
echo "Artifact contents after download and extraction:"
ls -R .

# Determine APP_PATH_OUTPUT
APP_PATH_OUTPUT=""
if [[ "$APP_INPUT" == "electron" ]]; then
  # For Electron, the build process creates a directory like 'linux-unpacked' or similar containing the executable
  # Or it could be an AppImage directly.
  # The artifact uploaded for electron is apps/electron-example/dist-{mode} which contains the packaged app.
  # Inside this, for Linux, we expect something like an AppImage or a directory with the executable.

  # Search for AppImage first within the extracted contents
  EXECUTABLE_NAME=$(find . -name "*.AppImage" -type f -print -quit || true)

  if [ -z "$EXECUTABLE_NAME" ] || [ ! -f "$EXECUTABLE_NAME" ]; then
    echo "No AppImage found. Searching for other executables..."
    # Try to find an executable matching the app name in common unpacked directories
    # APP_DIR_INPUT is like 'electron-example', PRODUCT_NAME is often similar or defined in package.json
    # A common pattern is 'appname' or 'AppName'
    # We'll look for a file that doesn't end with .so, and preferably matches parts of APP_DIR_INPUT

    # Heuristic: derive a possible product name (e.g., electron-example -> electron-example)
    # This is a simplification; a real productName might be different.
    POSSIBLE_PRODUCT_NAME="${APP_DIR_INPUT}"

    # Search in 'linux-unpacked' or similar directory patterns first
    # We want an executable file that is NOT a .so and ideally matches the product name.
    # If not, take any executable that's not a .so file.
    SEARCH_DIRS=(".") # Start with current directory
    # Add common unpacked dir names if they exist to prioritize them
    if [ -d "./linux-unpacked" ]; then SEARCH_DIRS+=("./linux-unpacked"); fi
    if [ -d "./linux-x64-unpacked" ]; then SEARCH_DIRS+=("./linux-x64-unpacked"); fi # Another common pattern

    FOUND_EXEC=""
    for search_dir in "${SEARCH_DIRS[@]}"; do
      if [ -d "$search_dir" ]; then
        # Prioritize executable matching the possible product name (case-insensitive)
        FOUND_EXEC=$(find "$search_dir" -maxdepth 1 -type f -iname "$POSSIBLE_PRODUCT_NAME" -executable ! -name "*.so" -print -quit || true)
        if [ -f "$FOUND_EXEC" ]; then
          break
        fi
        # Fallback: any executable in this dir not ending in .so
        FOUND_EXEC=$(find "$search_dir" -maxdepth 1 -type f -executable ! -name "*.so" -print -quit || true)
        if [ -f "$FOUND_EXEC" ]; then
          break
        fi
      fi
    done
    EXECUTABLE_NAME="$FOUND_EXEC"
  fi

  if [ -f "$EXECUTABLE_NAME" ]; then
    chmod +x "$EXECUTABLE_NAME"
    APP_PATH_OUTPUT=$(realpath "$EXECUTABLE_NAME")
  else
    echo "::error::Electron executable not found after extraction."
    ls -R . # Show what was extracted
    exit 1
  fi
elif [[ "$APP_INPUT" == "tauri" || "$APP_INPUT" == "tauri-v1" ]]; then
  # Tauri apps on Linux are typically .AppImage or .deb
  # The artifact uploaded for tauri is apps/{APP_NAME}-example/src-tauri/target/release/bundle/
  # which contains appimage/, deb/, etc. subdirectories.

  # Look for AppImage inside an 'appimage' directory or directly
  APPIMAGE_PATH=$(find . -path "*/appimage/*.AppImage" -o -name "*.AppImage" -type f -print -quit || true)

  if [ -f "$APPIMAGE_PATH" ]; then
    chmod +x "$APPIMAGE_PATH"
    APP_PATH_OUTPUT=$(realpath "$APPIMAGE_PATH")
  else
    echo "::warning::Tauri AppImage not found. Checking for .deb package."
    DEB_PATH=$(find . -path "*/deb/*.deb" -o -name "*.deb" -type f -print -quit || true)
    if [ -f "$DEB_PATH" ]; then
      echo "Found .deb package: $DEB_PATH. E2E tests might not be able to directly execute this type of artifact."
      APP_PATH_OUTPUT=$(realpath "$DEB_PATH") # WDIO might not be able to use a .deb directly
    else
      echo "::error::No AppImage or .deb found for Tauri app after extraction."
      ls -R . # Show what was extracted
      exit 1
    fi
  fi
fi

if [ -z "$APP_PATH_OUTPUT" ]; then
  echo "::error::Application executable/bundle could not be determined."
  ls -R .
  exit 1
fi

echo "Final determined APP_PATH_OUTPUT: $APP_PATH_OUTPUT"
echo "app_path=$APP_PATH_OUTPUT" >> "$GITHUB_OUTPUT"
cd ../../.. # Go back to the workspace root relative to where we were (apps/APP_DIR/build_output)
