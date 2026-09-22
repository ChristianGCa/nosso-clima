export interface SingleFlight {
  run<Value>(key: string, operation: () => Promise<Value>): Promise<Value>;
}

export function createSingleFlight(): SingleFlight {
  const inFlightOperations = new Map<string, Promise<unknown>>();

  return {
    run<Value>(key: string, operation: () => Promise<Value>): Promise<Value> {
      const existingOperation = inFlightOperations.get(key);
      if (existingOperation) {
        return existingOperation as Promise<Value>;
      }

      const sharedOperation = Promise.resolve()
        .then(operation)
        .finally(() => {
          inFlightOperations.delete(key);
        });

      inFlightOperations.set(key, sharedOperation);
      return sharedOperation;
    },
  };
}
