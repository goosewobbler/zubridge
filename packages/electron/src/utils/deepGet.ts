export function deepGet(obj: any, key: string | string[], def?: any): any {
  let p: number;
  let undef;
  const path = typeof key === 'string' ? key.split('.') : key;
  for (p = 0; p < path.length; p++) {
    obj = obj ? obj[path[p]] : undef;
  }
  return obj === undef ? def : obj;
}
