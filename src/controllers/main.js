class MainController {
    getHome(req, res) {
        res.send("Welcome to the Home Page!");
    }

    getData(req, res) {
        // Logic to retrieve data
        const data = { message: "Here is your data!" };
        res.json(data);
    }
}

export default MainController;