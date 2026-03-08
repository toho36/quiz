declare module 'bun:test' {
  type TestCallback = () => void | Promise<void>;

  export function describe(name: string, fn: TestCallback): void;
  export function test(name: string, fn: TestCallback): void;
  export function it(name: string, fn: TestCallback): void;
  export function beforeAll(fn: TestCallback): void;
  export function afterAll(fn: TestCallback): void;
  export function beforeEach(fn: TestCallback): void;
  export function afterEach(fn: TestCallback): void;
  export function expect(actual: unknown): any;
  export const mock: {
    module(specifier: string, factory: () => Record<string, unknown>): void;
    restore(): void;
  };
  export function spyOn<T extends object, K extends keyof T>(object: T, method: K): any;
}