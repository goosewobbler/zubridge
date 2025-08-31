export function deepGet(
  obj: Record<string, unknown>,
  key: string | string[],
  def?: unknown,
): unknown {
  let p: number;
  let undef: unknown;
  const path = typeof key === 'string' ? key.split('.') : key;
  let currentObj: unknown = obj;
  for (p = 0; p < path.length; p++) {
    currentObj =
      currentObj && typeof currentObj === 'object'
        ? (currentObj as Record<string, unknown>)[path[p]]
        : undef;
  }
  return currentObj === undef ? def : currentObj;
}
