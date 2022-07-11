import { entryOf, depsOf, rootInputOf } from './index';

const rootRef = rootInputOf<number>();

const numberInput = depsOf([rootRef])(async input => {
  return input;
});

const numberInputConsumer = depsOf([numberInput.ref])(async input => {
  return input;
});

describe('default tests', () => {
  it('just working', async () => {
    const fn = entryOf(rootRef)
      .consume([numberInput, numberInputConsumer])
      .outcome((_, getter) => {
        const result = getter(numberInputConsumer.ref);
        return result;
      })
      .executor();

    expect(await fn(1)).toBe(1);
  });

  it('several times the same', async () => {
    const fn = entryOf(rootRef)
      .consume([numberInput, numberInputConsumer])
      .outcome((_, getter) => {
        const result = getter(numberInputConsumer.ref);
        return result;
      })
      .executor();

    expect(await fn(1)).toBe(1);
    expect(await fn(2)).toBe(2);
    expect(await fn(3)).toBe(3);
    expect(await fn(4)).toBe(4);
  });
});
