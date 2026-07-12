export function sameHttpOrigin(left, right) {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    return (
      ["http:", "https:"].includes(leftUrl.protocol) &&
      ["http:", "https:"].includes(rightUrl.protocol) &&
      leftUrl.origin === rightUrl.origin
    );
  } catch {
    return false;
  }
}