/**
 * What version this is.
 *
 * Two numbers that move independently and must not be conflated. `APP_VERSION`
 * is the native APK and only changes when someone installs one. The bundle
 * version is the web half, which updates over the air — often several times
 * between APK releases.
 *
 * The app version used to be hardcoded in the web bundle, which meant it
 * travelled with OTA updates and so could never actually track the APK. It is
 * reported by the plugin now, and this constant is only the fallback for a
 * build that has no native half.
 */

export const APP_VERSION = "1.8.6";

let bundleVersion: string | null = null;

export function setBundleVersion(version: string | null) {
  bundleVersion = version;
}

export function currentBundleVersion(): string | null {
  return bundleVersion;
}
