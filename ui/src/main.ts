/* eslint-disable no-extend-native, unicorn/no-array-sort, unicorn/no-array-reverse */
// Polyfills for older Chromium (< 110, e.g. Chrome 96): Array.prototype.toSorted / toReversed
// are ES2023 methods used across the UI. Without these, the app crashes at boot with
// "TypeError: Array.from(...).toSorted is not a function" and renders a blank page.
if (typeof Array.prototype.toSorted !== "function") {
  Array.prototype.toSorted = function toSorted<T>(
    this: T[],
    compareFn?: (a: T, b: T) => number,
  ): T[] {
    return [...this].sort(compareFn);
  };
}
if (typeof Array.prototype.toReversed !== "function") {
  Array.prototype.toReversed = function toReversed<T>(this: T[]): T[] {
    return [...this].reverse();
  };
}

import "./styles.css";
import "./ui/app.ts";
