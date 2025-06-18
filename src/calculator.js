// Calculator logic for Bun app

export function calculator(operation, a, b) {
  if (typeof a !== 'number' || typeof b !== 'number' || isNaN(a) || isNaN(b)) {
    return { error: 'Invalid numbers' };
  }
  switch (operation) {
    case 'add':
      return { result: a + b };
    case 'subtract':
      return { result: a - b };
    case 'multiply':
      return { result: a * b };
    case 'divide':
      if (b === 0) return { error: 'Division by zero' };
      return { result: a / b };
    default:
      return { error: 'Unknown operation' };
  }
} 