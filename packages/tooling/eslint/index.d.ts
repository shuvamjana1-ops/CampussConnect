declare const globals: Record<string, Record<string, boolean>>;

export { globals };

export function createConfig(options: { tsconfigRootDir: string }): unknown[];
