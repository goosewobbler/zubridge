#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.

echo "Setting up E2E environment for $APP ($MODE) on Linux"
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

# Download shared packages artifact
echo "Downloading shared-packages artifact..."
RETRY_COUNT=0
MAX_RETRIES=3
RETRY_DELAY=5
DOWNLOAD_SUCCESS=false
until [ $DOWNLOAD_SUCCESS = true ] || [ $RETRY_COUNT -eq $MAX_RETRIES ]; do
  if gh release download shared-packages -A shared-packages.zip --repo $GITHUB_REPOSITORY -p "*" --clobber; then
    DOWNLOAD_SUCCESS=true
  else
    RETRY_COUNT=$((RETRY_COUNT+1))
    echo "Attempt $RETRY_COUNT to download shared-packages.zip failed. Retrying in $RETRY_DELAY seconds..."
    sleep $RETRY_DELAY
  fi
done

if [ -f "shared-packages.zip" ]; then
  unzip -o shared-packages.zip -d .
  rm shared-packages.zip
  echo "Shared packages artifact downloaded and extracted."
  echo "Listing contents of packages/tauri-plugin (if exists):"
  ls -R packages/tauri-plugin 2>/dev/null || echo "packages/tauri-plugin not found or empty."
else
  echo "::warning::shared-packages.zip not found after $MAX_RETRIES retries."
fi

# Download build artifact for the specific app
ARTIFACT_NAME="${APP_INPUT}-${MODE_INPUT}-${OS_FOR_ARTIFACT_INPUT}"
echo "Attempting to download app artifact: $ARTIFACT_NAME from tag $RELEASE_TAG_INPUT"

mkdir -p apps/${APP_DIR_INPUT}/build_output
cd apps/${APP_DIR_INPUT}/build_output

echo "Attempting to download from GitHub Release: $RELEASE_TAG_INPUT artifact ${ARTIFACT_NAME}.zip"
if ! gh release download "$RELEASE_TAG_INPUT" -A "${ARTIFACT_NAME}.zip" --repo $GITHUB_REPOSITORY --clobber; then
  echo "Failed to download ${ARTIFACT_NAME}.zip from release. Attempting to download from workflow artifacts (run_id: $GITHUB_RUN_ID)..."
  if ! gh run download "$GITHUB_RUN_ID" -n "$ARTIFACT_NAME" --repo $GITHUB_REPOSITORY; then
    echo "::error::Failed to download $ARTIFACT_NAME from release AND workflow run."
    exit 1
  fi
  echo "Successfully downloaded $ARTIFACT_NAME artifact from workflow run."
else
  echo "Successfully downloaded ${ARTIFACT_NAME}.zip from release."
fi

if [ ! -f "${ARTIFACT_NAME}.zip" ]; then
  echo "::error::Artifact zip file ${ARTIFACT_NAME}.zip not found after download attempts."
  ls -la .
  exit 1
fi

unzip -o "${ARTIFACT_NAME}.zip"
rm "${ARTIFACT_NAME}.zip"
echo "Artifact contents after download and extraction:"
ls -R .

# Determine APP_PATH_OUTPUT
APP_PATH_OUTPUT=""
if [[ "${APP_INPUT}" == "electron" ]]; then
  EXECUTABLE_NAME=$(find . -maxdepth 2 -type f -name "*.AppImage" -print -quit || true)
  if [ -z "$EXECUTABLE_NAME" ] || [ ! -f "$EXECUTABLE_NAME" ]; then
      EXECUTABLE_NAME=$(find . -maxdepth 2 -type f -name "*${APP_DIR_INPUT}*${MODE_INPUT}*" ! -name "*.blockmap" -print -quit || true)
  fi
  if [ -z "$EXECUTABLE_NAME" ] || [ ! -f "$EXECUTABLE_NAME" ]; then
      EXECUTABLE_NAME=$(find . -maxdepth 2 -type f \( -name "*.deb" -o -name "*.rpm" -o -name "*.snap" -o -name "*.tar.gz" \) -print -quit || true)
  fi

  if [ -f "$EXECUTABLE_NAME" ]; then
    chmod +x "$EXECUTABLE_NAME"
    APP_PATH_OUTPUT=$(realpath "$EXECUTABLE_NAME")
  else
    echo "::error::Electron executable not found."
    ls -R .
    exit 1
  fi
elif [[ "${APP_INPUT}" == "tauri" || "${APP_INPUT}" == "tauri-v1" ]]; then
  APPIMAGE_PATH=$(find . -path "*/appimage/*.AppImage" -type f -print -quit || true)
  if [ -z "$APPIMAGE_PATH" ] || [ ! -f "$APPIMAGE_PATH" ]; then
      APPIMAGE_PATH=$(find . -path "./*${APP_DIR_INPUT}*/*.AppImage" -type f -print -quit || true)
  fi
  if [ -z "$APPIMAGE_PATH" ] || [ ! -f "$APPIMAGE_PATH" ]; then
      APPIMAGE_PATH=$(find . -name "*.AppImage" -type f -print -quit || true)
  fi

  if [ -f "$APPIMAGE_PATH" ]; then
    chmod +x "$APPIMAGE_PATH"
    APP_PATH_OUTPUT=$(realpath "$APPIMAGE_PATH")
  else
    echo "::warning::Tauri AppImage not found. Checking for .deb."
    DEB_PATH=$(find . -name "*.deb" -type f -print -quit || true)
    if [ -f "$DEB_PATH" ]; then
      echo "Found .deb package: $DEB_PATH."
      APP_PATH_OUTPUT=$(realpath "$DEB_PATH")
    else
      echo "::error::No AppImage or .deb found for Tauri app."
      ls -R .
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
cd ../../..
