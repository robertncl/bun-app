class MainController {
<<<<<<< HEAD
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
=======
    getHome(req) {
        return new Response(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Home</title>
                <link rel="stylesheet" href="/styles.css">
            </head>
            <body>
                <h1 class="title"><b>This is a freshly steamed bun</b></h1>
            </body>
            </html>
        `, {
            headers: { 'Content-Type': 'text/html' }
        });
    }

    getData(req) {
        return new Response(JSON.stringify({ data: 'Sample Data' }), {
            headers: { 'Content-Type': 'application/json' }
        });
>>>>>>> 6f33076d598cda0312e4943a1ec1ea0b8cb0918d
    }
}

export { MainController };