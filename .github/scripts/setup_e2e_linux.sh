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
      "/usr/libexec/webkit2gtk-4.1/WebKitWebDriver"
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

  # Attempt 4: If still not found, try apt-file search and install
  if [ -z "$WEBKIT_DRIVER_PATH" ] || [ ! -f "$WEBKIT_DRIVER_PATH" ]; then
    echo "::warning::WebKitWebDriver still not found. Attempting apt-file search..."
    if command -v apt-file &> /dev/null; then
      PACKAGE_PROVIDING_WEBKITDRIVER=$(apt-file search --fixed-string --non-interactive WebKitWebDriver | awk -F':' '{print $1}' | head -n 1 || true)
      if [ ! -z "$PACKAGE_PROVIDING_WEBKITDRIVER" ]; then
        echo "apt-file suggests WebKitWebDriver might be provided by package: $PACKAGE_PROVIDING_WEBKITDRIVER"
        echo "Attempting to install $PACKAGE_PROVIDING_WEBKITDRIVER..."
        sudo apt-get install -y "$PACKAGE_PROVIDING_WEBKITDRIVER"
        echo "Installation of $PACKAGE_PROVIDING_WEBKITDRIVER attempted. Re-searching for WebKitWebDriver..."

        # Re-run search attempts after potential install
        WEBKIT_DRIVER_PATH=$(which WebKitWebDriver || true)
        if [ -z "$WEBKIT_DRIVER_PATH" ] || [ ! -f "$WEBKIT_DRIVER_PATH" ]; then
          COMMON_PATHS_RETRY=(
            "/usr/libexec/webkit2gtk-4.1/WebKitWebDriver"
            "/usr/lib/x86_64-linux-gnu/webkit2gtk-4.0/WebKitWebDriver"
            "/usr/libexec/WebKitWebDriver"
            "/usr/lib/webkit2gtk-4.0/WebKitWebDriver"
            "/usr/lib/webkit2gtk-5.0/WebKitWebDriver"
          )
          for path_to_check_retry in "${COMMON_PATHS_RETRY[@]}"; do
            if [ -f "$path_to_check_retry" ]; then
              WEBKIT_DRIVER_PATH="$path_to_check_retry"
              echo "Found WebKitWebDriver at $WEBKIT_DRIVER_PATH after apt-file install."
              break
            fi
          done
        fi
        if [ -z "$WEBKIT_DRIVER_PATH" ] || [ ! -f "$WEBKIT_DRIVER_PATH" ]; then
           WEBKIT_DRIVER_PATH=$(find /usr -name WebKitWebDriver -type f -print -quit 2>/dev/null || true)
           if [ ! -z "$WEBKIT_DRIVER_PATH" ] && [ -f "$WEBKIT_DRIVER_PATH" ]; then
             echo "Found WebKitWebDriver via find after apt-file install: $WEBKIT_DRIVER_PATH"
           fi
        fi
      else
        echo "::warning::apt-file search found no package providing WebKitWebDriver."
      fi
    else
      echo "::warning::apt-file command not found. Cannot attempt dynamic package installation for WebKitWebDriver."
    fi
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
  echo "Successfully attempted to download $ARTIFACT_NAME_INPUT artifact from workflow run."

  # Check if gh run download already extracted the contents (common for directory artifacts)
  # For Electron, we expect a dir like 'linux-unpacked'. For Tauri, 'appimage' or 'deb'.
  EXPECTED_CONTENT_DIR=""
  if [[ "$APP_INPUT" == "electron" ]] && [ -d "./linux-unpacked" ]; then
    EXPECTED_CONTENT_DIR="./linux-unpacked"
  elif ([[ "$APP_INPUT" == "tauri" ]] || [[ "$APP_INPUT" == "tauri-v1" ]]) && [ -d "./appimage" ]; then
    EXPECTED_CONTENT_DIR="./appimage"
  elif ([[ "$APP_INPUT" == "tauri" ]] || [[ "$APP_INPUT" == "tauri-v1" ]]) && [ -d "./deb" ]; then # Fallback for Tauri if no appimage dir
    EXPECTED_CONTENT_DIR="./deb"
  fi

  if [ ! -z "$EXPECTED_CONTENT_DIR" ]; then
    echo "It appears gh run download extracted the artifact contents directly. Skipping explicit unzip."
    # The content is already in the current directory (build_output)
    # No mv or unzip needed. The subsequent find commands for executables will work relative to here.
  else
    echo "Expected content directories not found. Assuming gh run download provided a zip file."
    # DOWNLOADED_APP_ARTIFACT_NAME is still "${ARTIFACT_NAME_INPUT}.zip"
    FOUND_ZIP_FROM_RUN=$(find . -maxdepth 1 -name '*.zip' -type f -print -quit || true)

    if [ -z "$FOUND_ZIP_FROM_RUN" ] || [ ! -f "$FOUND_ZIP_FROM_RUN" ]; then
        echo "::error:: No .zip file found in current directory after gh run download, and direct content extraction was not detected."
        ls -la .
        exit 1
    else
        echo "Found downloaded workflow artifact (zip): $FOUND_ZIP_FROM_RUN. Renaming to $DOWNLOADED_APP_ARTIFACT_NAME for unzipping."
        mv "$FOUND_ZIP_FROM_RUN" "$DOWNLOADED_APP_ARTIFACT_NAME"

        if [ ! -f "$DOWNLOADED_APP_ARTIFACT_NAME" ]; then # Check after mv
          echo "::error::Artifact zip file $DOWNLOADED_APP_ARTIFACT_NAME still not found after rename attempt."
          ls -la .
          exit 1
        fi
        unzip -o "$DOWNLOADED_APP_ARTIFACT_NAME"
        rm "$DOWNLOADED_APP_ARTIFACT_NAME"
    fi
  fi
else
  echo "Successfully downloaded $DOWNLOADED_APP_ARTIFACT_NAME from release."
  # If downloaded from release, it's definitely a zip file named $DOWNLOADED_APP_ARTIFACT_NAME
  if [ ! -f "$DOWNLOADED_APP_ARTIFACT_NAME" ]; then
    echo "::error::Artifact zip file $DOWNLOADED_APP_ARTIFACT_NAME not found after release download."
    ls -la .
    exit 1
  fi
  unzip -o "$DOWNLOADED_APP_ARTIFACT_NAME"
  rm "$DOWNLOADED_APP_ARTIFACT_NAME"
fi

# Ensure artifact extraction happened one way or another before proceeding
# (This check is now implicitly handled by the logic above leading to exit if issues)

echo "Artifact contents after download and potential extraction:"
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
        # 1. Try to find by POSSIBLE_PRODUCT_NAME (case-insensitive), ignoring initial executable flag
        CANDIDATE_EXEC=$(find "$search_dir" -maxdepth 1 -type f -iname "$POSSIBLE_PRODUCT_NAME" ! -name "*.so" -print -quit || true)
        if [ -f "$CANDIDATE_EXEC" ]; then
          echo "Found candidate by name: $CANDIDATE_EXEC"
          chmod +x "$CANDIDATE_EXEC"
          # Verify it's now executable
          if [ -x "$CANDIDATE_EXEC" ]; then
            echo "Candidate $CANDIDATE_EXEC is now executable. Using it."
            FOUND_EXEC="$CANDIDATE_EXEC"
            break
          else
            echo "::warning:: Candidate $CANDIDATE_EXEC found by name but could not be made executable."
          fi
        fi

        # 2. Fallback: any executable in this dir not ending in .so (original fallback)
        echo "No suitable candidate by name in $search_dir, or it could not be made executable. Looking for any other executable..."
        CANDIDATE_EXEC=$(find "$search_dir" -maxdepth 1 -type f -executable ! -name "*.so" -print -quit || true)
        if [ -f "$CANDIDATE_EXEC" ]; then
          echo "Found other executable: $CANDIDATE_EXEC"
          FOUND_EXEC="$CANDIDATE_EXEC"
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

# This global variable will be set by download_app_artifact or gh_run_download_fallback
# It indicates the base path (relative to script's PWD) where the executable can be found.
# e.g., "." if contents are directly in PWD, or "./linux-unpacked" if they are in a subfolder.
UNZIPPED_PATH="."

gh_run_download_fallback() {
    echo "Attempting gh run download fallback for artifact: $ARTIFACT_NAME_INPUT"
    # Create a unique temporary directory for the download
    local temp_download_dir="gh_run_download_temp_$(date +%s)"
    mkdir -p "$temp_download_dir"

    local original_pwd
    original_pwd=$(pwd) # Save the original working directory

    # Change to the temporary directory to download the artifact
    pushd "$temp_download_dir" > /dev/null

    if ! gh run download "$ARTIFACT_NAME_INPUT" -R "$GITHUB_REPOSITORY" -r "$GITHUB_RUN_ID"; then
        echo "Error: gh run download failed for artifact $ARTIFACT_NAME_INPUT from run $GITHUB_RUN_ID."
        popd > /dev/null # Return from temp_download_dir
        rm -rf "$temp_download_dir" # Clean up
        exit 1
    fi

    echo "DEBUG: Contents of temporary download directory '$temp_download_dir' after gh run download:"
    ls -la . # List contents of the temp directory

    # Reset UNZIPPED_PATH, it will be set based on outcome.
    # This global variable refers to path relative to $original_pwd
    # Default to "." meaning content is expected at $original_pwd root after processing
    UNZIPPED_PATH="."

    # Case 1: Tauri artifact is pre-extracted into appimage/, deb/, or rpm/ directories
    if [[ "$E2E_APP_TYPE_INPUT" == "tauri" && ( -d "./appimage" || -d "./deb" || -d "./rpm" ) ]]; then
        echo "Tauri artifact appears to be pre-extracted. Moving relevant directories to $original_pwd"
        # Move only the relevant directories to the original working directory.
        [[ -d "./appimage" ]] && mv "./appimage" "$original_pwd/"
        [[ -d "./deb" ]] && mv "./deb" "$original_pwd/"
        [[ -d "./rpm" ]] && mv "./rpm" "$original_pwd/"
        # UNZIPPED_PATH remains "." because find_executable looks for ./appimage etc. from $original_pwd
    # Case 2: Electron artifact is pre-extracted into linux-unpacked/
    elif [[ "$E2E_APP_TYPE_INPUT" == "electron" && -d "./linux-unpacked" ]]; then
        echo "Electron artifact appears to be pre-extracted. Moving ./linux-unpacked to $original_pwd"
        mv "./linux-unpacked" "$original_pwd/"
        UNZIPPED_PATH="./linux-unpacked" # Executable will be found within this path relative to $original_pwd
    # Case 3: No pre-extracted known structure, look for a .zip file
    else
        local zip_to_unzip=""
        # Check for a zip file matching the artifact name
        if [[ -f "${ARTIFACT_NAME_INPUT}.zip" ]]; then
            zip_to_unzip="${ARTIFACT_NAME_INPUT}.zip"
            echo "Found exact artifact zip: $zip_to_unzip in $temp_download_dir."
        else
            # If not found, look for any .zip file
            local generic_zip_file
            generic_zip_file=$(find . -maxdepth 1 -name "*.zip" -print -quit)
            if [[ -n "$generic_zip_file" ]]; then
                zip_to_unzip="$generic_zip_file"
                echo "Found generic zip file: $zip_to_unzip in $temp_download_dir."
                # Optional: rename if desired, but not strictly necessary if $zip_to_unzip is used directly
                # if [[ "$zip_to_unzip" != "${ARTIFACT_NAME_INPUT}.zip" ]]; then
                #    echo "Note: Zip file name $zip_to_unzip differs from artifact name ${ARTIFACT_NAME_INPUT}.zip."
                # fi
            fi
        fi

        if [[ -n "$zip_to_unzip" ]]; then
            echo "Unzipping $zip_to_unzip from $temp_download_dir directly into $original_pwd ..."
            # Unzip directly into the original PWD.
            if ! unzip -q "$zip_to_unzip" -d "$original_pwd"; then
                echo "Error: Failed to unzip $zip_to_unzip into $original_pwd."
                popd > /dev/null; rm -rf "$temp_download_dir"; exit 1
            fi
            echo "Artifact unzipped successfully into $original_pwd."
            # After unzipping to original_pwd, determine the UNZIPPED_PATH
            # If Electron, and linux-unpacked now exists in original_pwd, update UNZIPPED_PATH
            if [[ "$E2E_APP_TYPE_INPUT" == "electron" && -d "$original_pwd/linux-unpacked" ]]; then
                UNZIPPED_PATH="./linux-unpacked"
            # For Tauri, an AppImage or other structures might be at the root of original_pwd
            # find_executable will search from UNZIPPED_PATH="." in that case.
            fi
        else
            # Failure: No pre-extracted dirs and no zip file found
            echo "Error: After gh run download, no recognized pre-extracted directories (appimage/, deb/, rpm/, linux-unpacked/) were found, and no .zip file (neither ${ARTIFACT_NAME_INPUT}.zip nor any other *.zip) was found in $temp_download_dir."
            echo "DEBUG: Final listing of $temp_download_dir contents before error:"
            ls -la .
            popd > /dev/null; rm -rf "$temp_download_dir"; exit 1
        fi
    fi

    popd > /dev/null # Return to original_pwd
    rm -rf "$temp_download_dir" # Clean up temp directory

    echo "Artifact processed. Search base for executable (UNZIPPED_PATH relative to $(pwd)) is: $UNZIPPED_PATH"
    # The global UNZIPPED_PATH variable is now set correctly for find_executable_and_export_path
}

# Function to find the executable and export its path
# Takes one argument: the base path to search within (UNZIPPED_PATH)
find_executable_and_export_path() {
    local base_path="$1"
    echo "Searching for executable in $base_path"

    # Search for AppImage first
    EXECUTABLE_NAME=$(find "$base_path" -name "*.AppImage" -type f -print -quit || true)

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
        SEARCH_DIRS=("$base_path") # Start with the provided base_path
        # Add common unpacked dir names if they exist to prioritize them
        if [ -d "$base_path/linux-unpacked" ]; then SEARCH_DIRS+=("$base_path/linux-unpacked"); fi
        if [ -d "$base_path/linux-x64-unpacked" ]; then SEARCH_DIRS+=("$base_path/linux-x64-unpacked"); fi # Another common pattern

        FOUND_EXEC=""
        for search_dir in "${SEARCH_DIRS[@]}"; do
            if [ -d "$search_dir" ]; then
                # 1. Try to find by POSSIBLE_PRODUCT_NAME (case-insensitive), ignoring initial executable flag
                CANDIDATE_EXEC=$(find "$search_dir" -maxdepth 1 -type f -iname "$POSSIBLE_PRODUCT_NAME" ! -name "*.so" -print -quit || true)
                if [ -f "$CANDIDATE_EXEC" ]; then
                    echo "Found candidate by name: $CANDIDATE_EXEC"
                    chmod +x "$CANDIDATE_EXEC"
                    # Verify it's now executable
                    if [ -x "$CANDIDATE_EXEC" ]; then
                        echo "Candidate $CANDIDATE_EXEC is now executable. Using it."
                        FOUND_EXEC="$CANDIDATE_EXEC"
                        break
                    else
                        echo "::warning:: Candidate $CANDIDATE_EXEC found by name but could not be made executable."
                    fi
                fi

                # 2. Fallback: any executable in this dir not ending in .so (original fallback)
                echo "No suitable candidate by name in $search_dir, or it could not be made executable. Looking for any other executable..."
                CANDIDATE_EXEC=$(find "$search_dir" -maxdepth 1 -type f -executable ! -name "*.so" -print -quit || true)
                if [ -f "$CANDIDATE_EXEC" ]; then
                    echo "Found other executable: $CANDIDATE_EXEC"
                    FOUND_EXEC="$CANDIDATE_EXEC"
                    break
                fi
            fi
        done
        EXECUTABLE_NAME="$FOUND_EXEC"
    fi

    if [ -f "$EXECUTABLE_NAME" ]; then
        chmod +x "$EXECUTABLE_NAME"
        APP_PATH_OUTPUT=$(realpath "$EXECUTABLE_NAME")
        echo "Found executable: $APP_PATH_OUTPUT"
        echo "app_path=$APP_PATH_OUTPUT" >> "$GITHUB_OUTPUT"
    else
        echo "::error::Executable not found in $base_path"
        ls -R "$base_path"
        exit 1
    fi
}
