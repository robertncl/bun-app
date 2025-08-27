// A safe mathematical expression evaluator using the shunting-yard algorithm
// Supports: + - * / ^, parentheses, unary minus, and functions/constants
// Functions: sin, cos, tan, asin, acos, atan, sqrt, log (base10), ln, abs, pow
// Constants: pi, e

const CONSTANTS = {
  pi: Math.PI,
  e: Math.E,
};

const FUNCTIONS = {
  sin: (x, { deg }) => Math.sin(deg ? toRad(x) : x),
  cos: (x, { deg }) => Math.cos(deg ? toRad(x) : x),
  tan: (x, { deg }) => Math.tan(deg ? toRad(x) : x),
  asin: (x, { deg }) => (deg ? toDeg(Math.asin(x)) : Math.asin(x)),
  acos: (x, { deg }) => (deg ? toDeg(Math.acos(x)) : Math.acos(x)),
  atan: (x, { deg }) => (deg ? toDeg(Math.atan(x)) : Math.atan(x)),
  sqrt: (x) => Math.sqrt(x),
  log: (x) => Math.log10(x),
  ln: (x) => Math.log(x),
  abs: (x) => Math.abs(x),
  pow: (a, b) => Math.pow(a, b),
  min: (a, b) => Math.min(a, b),
  max: (a, b) => Math.max(a, b),
};

const FUNCTION_ARITY = {
  sin: 1,
  cos: 1,
  tan: 1,
  asin: 1,
  acos: 1,
  atan: 1,
  sqrt: 1,
  log: 1,
  ln: 1,
  abs: 1,
  pow: 2,
  min: 2,
  max: 2,
};

const OPERATORS = {
  '+': { prec: 2, assoc: 'L', args: 2, fn: (a, b) => a + b },
  '-': { prec: 2, assoc: 'L', args: 2, fn: (a, b) => a - b },
  '*': { prec: 3, assoc: 'L', args: 2, fn: (a, b) => a * b },
  '/': { prec: 3, assoc: 'L', args: 2, fn: (a, b) => a / b },
  '^': { prec: 4, assoc: 'R', args: 2, fn: (a, b) => Math.pow(a, b) },
  'u-': { prec: 5, assoc: 'R', args: 1, fn: (a) => -a }, // unary minus
};

function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }

function isAlpha(ch) { return /[a-zA-Z_]/.test(ch); }
function isDigit(ch) { return /[0-9]/.test(ch); }
function isSpace(ch) { return /\s/.test(ch); }

export function evaluateExpression(expr, options = { deg: false }) {
  if (typeof expr !== 'string') {
    return { error: 'Invalid expression' };
  }
  try {
    const rpn = toRPN(expr);
    const result = evalRPN(rpn, options);
    if (!Number.isFinite(result)) return { error: 'Invalid result' };
    return { result };
  } catch (e) {
    return { error: 'Invalid expression' };
  }
}

function toRPN(input) {
  const tokens = tokenize(input);
  const output = [];
  const stack = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'number') {
      output.push(t);
    } else if (t.type === 'ident') {
      // function if next token is lparen, else constant
      const next = tokens[i + 1];
      if (next && next.type === 'lparen') {
        stack.push({ type: 'func', value: t.value });
      } else {
        output.push(t);
      }
    } else if (t.type === 'comma') {
      while (stack.length && stack[stack.length - 1].value !== '(') {
        output.push(stack.pop());
      }
      if (!stack.length) throw new Error('Misplaced comma');
    } else if (t.type === 'op') {
      const o1 = t;
      while (stack.length && stack[stack.length - 1].type === 'op') {
        const o2 = stack[stack.length - 1];
        const a1 = OPERATORS[o1.value];
        const a2 = OPERATORS[o2.value];
        if (!a2) break;
        if ((a1.assoc === 'L' && a1.prec <= a2.prec) || (a1.assoc === 'R' && a1.prec < a2.prec)) {
          output.push(stack.pop());
        } else break;
      }
      stack.push(o1);
    } else if (t.type === 'lparen') {
      stack.push(t);
    } else if (t.type === 'rparen') {
      while (stack.length && stack[stack.length - 1].type !== 'lparen') {
        output.push(stack.pop());
      }
      if (!stack.length) throw new Error('Mismatched parentheses');
      stack.pop(); // pop '('
      // if function on top, pop it to output
      if (stack.length && stack[stack.length - 1].type === 'func') {
        output.push(stack.pop());
      }
    }
  }

  while (stack.length) {
    const s = stack.pop();
    if (s.type === 'lparen' || s.type === 'rparen') throw new Error('Mismatched parentheses');
    output.push(s);
  }

  return output;
}

function tokenize(src) {
  const tokens = [];
  let i = 0;
  let prevType = 'start';
  while (i < src.length) {
    const ch = src[i];
    if (isSpace(ch)) { i++; continue; }
    if (isDigit(ch) || (ch === '.' && isDigit(src[i + 1] || ''))) {
      let s = '';
      while (isDigit(src[i] || '') || src[i] === '.') { s += src[i++]; }
      tokens.push({ type: 'number', value: parseFloat(s) });
      prevType = 'number';
      continue;
    }
    if (isAlpha(ch)) {
      let s = '';
      while (isAlpha(src[i] || '') || isDigit(src[i] || '')) { s += src[i++]; }
      tokens.push({ type: 'ident', value: s.toLowerCase() });
      prevType = 'ident';
      continue;
    }
    if (ch === ',') { tokens.push({ type: 'comma', value: ',' }); i++; prevType = 'comma'; continue; }
    if (ch === '(') { tokens.push({ type: 'lparen', value: '(' }); i++; prevType = 'lparen'; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen', value: ')' }); i++; prevType = 'rparen'; continue; }
    if ('+-*/^'.includes(ch)) {
      let op = ch;
      if (ch === '-' && (prevType === 'start' || prevType === 'op' || prevType === 'lparen' || prevType === 'comma')) {
        op = 'u-';
      }
      tokens.push({ type: 'op', value: op });
      i++;
      prevType = 'op';
      continue;
    }
    throw new Error('Unexpected character');
  }
  return tokens;
}

function evalRPN(rpn, options) {
  const stack = [];
  for (const t of rpn) {
    if (t.type === 'number') {
      stack.push(t.value);
    } else if (t.type === 'ident') {
      // identifier can be constant or function; we peek ahead next items in RPN are numbers/ops
      // In this simplified evaluator, identifiers without following parentheses are constants
      const name = t.value;
      if (name in CONSTANTS) {
        stack.push(CONSTANTS[name]);
      } else if (name in FUNCTIONS) {
        // Determine arity by inspecting stack (common 1 or 2)
        // We treat it as 1-arg unless 2 are available and next token is comma in infix version
        // Since we converted to RPN already, we cannot see commas; assume typical 1 or 2 args by availability
        const fn = FUNCTIONS[name];
        const arity = fn.length; // JS function length equals number of declared params (1 or 2)
        const args = [];
        for (let i = 0; i < arity; i++) {
          if (!stack.length) throw new Error('Insufficient values');
          args.unshift(stack.pop());
        }
        const val = fn(...args, options);
        stack.push(val);
      } else {
        throw new Error('Unknown identifier');
      }
    } else if (t.type === 'func') {
      const name = t.value;
      const fn = FUNCTIONS[name];
      if (!fn) throw new Error('Unknown function');
      const arity = FUNCTION_ARITY[name] ?? 1;
      const args = [];
      for (let i = 0; i < arity; i++) {
        if (!stack.length) throw new Error('Insufficient values');
        args.unshift(stack.pop());
      }
      const val = fn(...args, options);
      stack.push(val);
    } else if (t.type === 'op') {
      const op = OPERATORS[t.value];
      if (!op) throw new Error('Unknown operator');
      const args = [];
      for (let i = 0; i < op.args; i++) {
        if (!stack.length) throw new Error('Insufficient values');
        args.unshift(stack.pop());
      }
      const val = op.fn(...args);
      stack.push(val);
    } else {
      throw new Error('Unexpected token');
    }
  }
  if (stack.length !== 1) throw new Error('Invalid expression');
  return stack[0];
}


