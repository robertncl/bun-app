class MainController {
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
    }
}

export { MainController };