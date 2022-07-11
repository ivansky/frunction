import { Concat } from 'typescript-tuple';

const UNKNOWN_REFERENCE_NAME = `Unknown`;

type SomeAsyncFn<R = any> = (...args: any[]) => Promise<R>;

class Reference<F extends SomeAsyncFn> {
  constructor(
    // public readonly fraction: Fraction<F>,
    public readonly name: string = UNKNOWN_REFERENCE_NAME,
    public readonly symbol = Symbol(name),
    public readonly isOptional = false
  ) {}

  optional(): OptionalReference<F> {
    return new OptionalReference<F>(this.name, this.symbol);
  }
}

class OptionalReference<F extends SomeAsyncFn> extends Reference<F> {
  constructor(name: string, symbol: symbol) {
    super(name, symbol, true);
  }
}

function getFnName<F extends (...args: any[]) => Promise<any>>(fn: F): string {
  return (
    (fn as unknown as { displayName?: string })['displayName'] ||
    fn.name ||
    UNKNOWN_REFERENCE_NAME
  );
}

class Fraction<F extends (...args: any[]) => Promise<any>> {
  constructor(
    public deps: Reference<any>[],
    private fn: F,
    name: string = getFnName(fn),
    public readonly ref = new Reference<F>(name)
  ) {}

  // ref might be optional(ref)
  awaitsFor(ref: unknown) {}

  optional() {
    return this.ref.optional();
  }

  async execute(...args: Parameters<F>): Promise<Awaited<ReturnType<F>>> {
    return await this.fn(...args);
  }
}

type ExtractEntryArgType<FR extends Frunction<any, any>> = FR extends Frunction<
  infer A,
  any
>
  ? A
  : never;

type ExtractOutcomeType<FR extends Frunction<any, any>> = FR extends Frunction<
  any,
  infer O
>
  ? O
  : never;

type ExtractReferenceResultType<T extends Reference<any>> = T extends Reference<
  infer F
>
  ? Awaited<ReturnType<F>>
  : never;

type ExtractFractionResultType<T extends Fraction<any>> = T extends Fraction<
  infer F
>
  ? Awaited<ReturnType<F>>
  : never;

type MapFractionsResult<Tuple extends [...Fraction<any>[]]> = {
  [Index in keyof Tuple]: ExtractFractionResultType<Tuple[Index]>;
} & { length: Tuple['length'] };

const inputRef = new Reference<any>('frunction-input');
const outputRef = new Reference<any>('frunction-output');

function rootInputOf<Input>() {
  return inputRef as Reference<SomeAsyncFn<Input>>;
}

class Frunction<
  EntryArg = never,
  List extends Fraction<any>[] = [],
  Outcome = undefined
> {
  private entries: Fraction<any>[] = [];
  private bySymbol = new Map<symbol, Fraction<any>>();
  private bySymbolDegree = new Map<symbol, number>();
  private bySymbolChildren = new Map<symbol, Fraction<any>[]>();

  constructor(
    private readonly fractions: Fraction<any>[],
    private readonly outcomeHandler = (
      results: MapFractionsResult<List>,
      resultGetter: <T extends Reference<any>>(
        r: T
      ) => ExtractReferenceResultType<T>
    ): Outcome => undefined as unknown as Outcome
  ) {
    const outputFraction = new Fraction(
      fractions.map(f => f.ref),
      (results: any[], getter: any) =>
        Promise.resolve(this.outcomeHandler(results as any, getter)),
      outputRef.name,
      outputRef
    );

    this.bySymbolDegree.set(outputFraction.ref.symbol, fractions.length);

    // prebuilt some mappings on construction
    // to speed-up later execution
    fractions.concat([outputFraction]).forEach(f => {
      const { ref, deps } = f;
      const degree =
        deps.length === 1 && deps[0].symbol === inputRef.symbol
          ? 0
          : deps.length;
      this.bySymbol.set(ref.symbol, f);
      this.bySymbolDegree.set(ref.symbol, degree);

      if (!degree) this.entries.push(f);

      // set backward links, parent => [...children]
      deps.forEach(d => {
        if (!this.bySymbolChildren.has(d.symbol)) {
          this.bySymbolChildren.set(d.symbol, [f]);
        } else {
          this.bySymbolChildren.get(d.symbol)!.push(f);
        }
      });
    });
  }

  // clone<NewEntryArg = EntryArg, NewOutcome = Outcome>() {
  //   return new Frunction<NewEntryArg, List, NewOutcome>(
  //     this.fractions,
  //     this.outcomeHandler
  //   );
  // }

  consume<Adds extends Fraction<any>[]>(fractions: Adds) {
    return new Frunction<EntryArg, Concat<List, Adds>, Outcome>(
      this.fractions.concat(fractions)
    );
  }

  outcome<
    O extends (
      results: MapFractionsResult<List>,
      resultGetter: <T extends Reference<any>>(
        r: T
      ) => ExtractReferenceResultType<T>
    ) => any | Promise<any>
  >(handler: O) {
    return new Frunction<EntryArg, List, Awaited<ReturnType<O>>>(
      this.fractions,
      handler
    );
  }

  executor(): (income: EntryArg) => Promise<Outcome> {
    return (income: EntryArg) => {
      return new Promise((resolve, reject) => {
        const resultMap = new Map<symbol, any>();
        const executionDegree = new Map(this.bySymbolDegree);

        resultMap.set(inputRef.symbol, income);

        const execute = (f: Fraction<any>) => {
          const results = f.deps.map(d => resultMap.get(d.symbol));

          // exit on output fraction
          if (f.ref.symbol === outputRef.symbol) {
            f.execute(results, (ref: Reference<any>) =>
              resultMap.get(ref.symbol)
            ).then(resolve);
            return;
          }

          f.execute(...results)
            .then(result => {
              resultMap.set(f.ref.symbol, result);

              this.bySymbolChildren.get(f.ref.symbol)?.forEach(child => {
                const nextDegree =
                  (executionDegree.get(child.ref.symbol) || 1) - 1;
                executionDegree.set(child.ref.symbol, nextDegree);
                if (!nextDegree) execute(child);
              });
            })
            .catch(reject);
        };

        this.entries.forEach(execute);
      });
    };
  }

  static entryOf<StartEntryArg = never>(
    ref?: Reference<SomeAsyncFn<StartEntryArg>>
  ) {
    return new Frunction<StartEntryArg>([]);
  }

  static buildFn<StartEntryArg = never, OutcomeResult = void>() {
    return new Frunction<StartEntryArg, [], OutcomeResult>([]);
  }
}

const { entryOf, buildFn } = Frunction;

export { entryOf, buildFn, rootInputOf };

type ConsumeFunction<
  D1 extends Reference<any> = never,
  D2 extends Reference<any> = never,
  D3 extends Reference<any> = never,
  D4 extends Reference<any> = never,
  D5 extends Reference<any> = never,
  D6 extends Reference<any> = never,
  D7 extends Reference<any> = never,
  D8 extends Reference<any> = never
> = <
  F extends (
    ...args: [
      ExtractReferenceResultType<D1>,
      ExtractReferenceResultType<D2>,
      ExtractReferenceResultType<D3>,
      ExtractReferenceResultType<D4>,
      ExtractReferenceResultType<D5>,
      ExtractReferenceResultType<D6>,
      ExtractReferenceResultType<D7>,
      ExtractReferenceResultType<D8>
    ]
  ) => Promise<unknown>
>(
  fn: F
) => Fraction<F>;

export function depsOf(
  deps: [],
  nameOrRef?: string | Reference<any>
): ConsumeFunction;
export function depsOf<D1 extends Reference<any>>(
  deps: [D1],
  nameOrRef?: string | Reference<any>
): ConsumeFunction<D1>;
export function depsOf<D1 extends Reference<any>, D2 extends Reference<any>>(
  deps: [D1, D2],
  nameOrRef?: string | Reference<any>
): ConsumeFunction<D1, D2>;
// export function depsOf<D1, D2, D3>(
//   deps: [D1, D2, D3]
// ): ConsumeFunction<D1, D2, D3>;
// export function depsOf<D1, D2, D3, D4>(
//   deps: [D1, D2, D3, D4]
// ): ConsumeFunction<D1, D2, D3, D4>;
// export function depsOf<D1, D2, D3, D4, D5>(
//   deps: [D1, D2, D3, D4, D5]
// ): ConsumeFunction<D1, D2, D3, D4, D5>;
// export function depsOf<D1, D2, D3, D4, D5, D6>(
//   deps: [D1, D2, D3, D4, D5, D6]
// ): ConsumeFunction<D1, D2, D3, D4, D5, D6>;
// export function depsOf<D1, D2, D3, D4, D5, D6, D7>(
//   deps: [D1, D2, D3, D4, D5, D6, D7]
// ): ConsumeFunction<D1, D2, D3, D4, D5, D6, D7>;
// export function depsOf<D1, D2, D3, D4, D5, D6, D7, D8>(
//   deps: [D1, D2, D3, D4, D5, D6, D7, D8]
// ): ConsumeFunction<D1, D2, D3, D4, D5, D6, D7, D8>;

export function depsOf(
  deps: any[],
  nameOrRef?: string | Reference<any>
): ConsumeFunction {
  return function (fn) {
    return new Fraction<any>(
      deps,
      fn,
      typeof nameOrRef === 'object' ? nameOrRef.name : nameOrRef,
      typeof nameOrRef === 'object' ? nameOrRef : undefined
    );
  };
}

const requestFraction = depsOf([])(async function req() {
  return { headers: { a: 'a' } } as { headers: Record<string, string> };
});

const authFraction = depsOf([requestFraction.ref])(async function auth(req) {
  return { token: req.headers['auth_token'] };
});

const networkClientFraction = depsOf([authFraction.optional()])(
  async function networkClient(auth) {
    class NetworkClient {
      constructor(public token: string) {}
    }

    return new NetworkClient(auth?.token);
  }
);

networkClientFraction.execute({ token: 'a' });

type Ctx = { req: { headers: {} }; res: {} };

entryOf<Ctx>()
  .consume([requestFraction, authFraction, networkClientFraction])
  .outcome(results => {})
  .executor();
