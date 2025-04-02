class MainController {
    getHome(req) {
        return new Response('This is a freshly steamed bun');
    }

    getData(req) {
        return new Response(JSON.stringify({ data: 'Sample Data' }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

export { MainController };