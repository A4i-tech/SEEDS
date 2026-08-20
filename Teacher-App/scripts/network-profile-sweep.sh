#!/usr/bin/env bash
# Automated network-profile sweep for the Teacher-App conference flow.
#
# Drives the real installed app (adb + uiautomator, no Espresso/Hilt involved,
# so it isn't affected by the androidTest FakeSeedsService override) through:
#   splash throttle-setup dialog (pick profile) -> classroom list -> open
#   classroom -> Start Call -> hold -> End Call
# once per profile in ThrottleProfiles.ALL / arrays.xml throttle_network_profiles.
# Every real HTTP call the app makes is already logged by MetricsLogger to
# <externalFilesDir>/throttle-metrics.csv - this script just drives the taps
# and pulls that CSV down at the end.
#
# Requires: app already installed (debug build) and already logged in
# (is_logged_in persists, so the sweep skips LoginActivity).
#
# Usage:
#   ./network-profile-sweep.sh [classroom_name] [hold_seconds]
#
# Env:
#   PROFILES        space-separated subset of profile names, default = all 10
#   OUT_CSV         local path to pull the CSV to, default ./network-profile-sweep-results.csv

set -euo pipefail

PACKAGE="com.example.seeds"
MAIN_ACTIVITY="com.example.seeds.ui.Login.SplashScreenActivity"
CLASSROOM_NAME="${1:-test}"
HOLD_SECONDS="${2:-15}"
OUT_CSV="${OUT_CSV:-./network-profile-sweep-results.csv}"

ALL_PROFILES=(Off 255Kbps 332Kbps slow_3g 409Kbps 719Kbps fast_3g 1.3Mbps 2.6Mbps 5.0Mbps)
read -r -a PROFILES <<< "${PROFILES:-${ALL_PROFILES[*]}}"

dump_ui() {
    adb exec-out uiautomator dump /dev/tty 2>/dev/null | tr '>' '>\n'
}

# Prints "cx cy" for the first node whose text/content-desc contains $1, or nothing.
find_center() {
    local needle="$1"
    dump_ui | grep -iF "$needle" | head -1 | grep -oE 'bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' | \
        sed -E 's/bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]"/\1 \2 \3 \4/' | \
        awk '{printf "%d %d", int(($1+$3)/2), int(($2+$4)/2)}'
}

tap_text() {
    local needle="$1"
    local coords
    coords=$(find_center "$needle")
    if [ -z "$coords" ]; then
        echo "  ! could not find '$needle' on screen, skipping tap" >&2
        return 1
    fi
    # shellcheck disable=SC2086
    adb shell input tap $coords
}

wait_for_text() {
    local needle="$1"
    local timeout="${2:-15}"
    local waited=0
    while [ "$waited" -lt "$timeout" ]; do
        if dump_ui | grep -qiF "$needle"; then
            return 0
        fi
        sleep 1
        waited=$((waited + 1))
    done
    echo "  ! timed out waiting for '$needle'" >&2
    return 1
}

run_profile() {
    local profile="$1"
    echo "=== Profile: $profile ==="

    adb shell am force-stop "$PACKAGE" >/dev/null
    adb shell am start -S -n "$PACKAGE/$MAIN_ACTIVITY" >/dev/null
    sleep 2

    # Spinner always opens on "Off" (fresh view each relaunch); open it, then pick the profile.
    tap_text "Off"
    sleep 1
    tap_text "$profile"
    sleep 1
    tap_text "Start testing"

    wait_for_text "$CLASSROOM_NAME" 15 || return 1
    tap_text "$CLASSROOM_NAME"

    wait_for_text "Start call" 10 || return 1
    tap_text "Start call"

    # Assign-leader dialog defaults to "No leader" selected; just confirm it.
    wait_for_text "Assign" 5 && tap_text "Assign"

    echo "  call starting, holding ${HOLD_SECONDS}s..."
    sleep "$HOLD_SECONDS"

    tap_text "End call"
    sleep 3

    echo "  done: $profile"
}

echo "Sweeping profiles: ${PROFILES[*]}"
echo "Classroom: $CLASSROOM_NAME  Hold: ${HOLD_SECONDS}s"

for profile in "${PROFILES[@]}"; do
    run_profile "$profile" || echo "  ! $profile failed, continuing with next profile"
done

echo
echo "Pulling throttle-metrics.csv..."
MSYS_NO_PATHCONV=1 adb pull "/sdcard/Android/data/$PACKAGE/files/throttle-metrics.csv" "$OUT_CSV"
echo "Done. Results: $OUT_CSV"
