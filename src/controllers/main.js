class MainController {
    getHome(req, res) {
        res.send('Welcome to the Home Page');
    }

    getData(req, res) {
        res.json({ data: 'Sample Data' });
    }
}

export { MainController };