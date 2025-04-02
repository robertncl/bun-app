class MainController {
    getHome(req) {
        return new Response('Welcome to the Home Page');
    }

    getData(req) {
        return new Response(JSON.stringify({ data: 'Sample Data' }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

export { MainController };