declare module '*.yaml' {
  const data: unknown;
  export default data;
}

declare module '*.yaml?meta' {
  const data: { number: number; title: string };
  export default data;
}
