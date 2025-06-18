class MainController {
    add(req, res) {
        const a = parseFloat(req.query.a);
        const b = parseFloat(req.query.b);
        if (isNaN(a) || isNaN(b)) {
            return res.json({ error: 'Invalid numbers' });
        }
        res.json({ result: a + b });
    }

    subtract(req, res) {
        const a = parseFloat(req.query.a);
        const b = parseFloat(req.query.b);
        if (isNaN(a) || isNaN(b)) {
            return res.json({ error: 'Invalid numbers' });
        }
        res.json({ result: a - b });
    }

    multiply(req, res) {
        const a = parseFloat(req.query.a);
        const b = parseFloat(req.query.b);
        if (isNaN(a) || isNaN(b)) {
            return res.json({ error: 'Invalid numbers' });
        }
        res.json({ result: a * b });
    }

    divide(req, res) {
        const a = parseFloat(req.query.a);
        const b = parseFloat(req.query.b);
        if (isNaN(a) || isNaN(b)) {
            return res.json({ error: 'Invalid numbers' });
        }
        if (b === 0) {
            return res.json({ error: 'Division by zero' });
        }
        res.json({ result: a / b });
    }
}

export { MainController };