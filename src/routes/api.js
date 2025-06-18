import { MainController } from '../controllers/main.js';

const mainController = new MainController();

export function setupRoutes(app) {
    app.get('/add', mainController.add.bind(mainController));
    app.get('/subtract', mainController.subtract.bind(mainController));
    app.get('/multiply', mainController.multiply.bind(mainController));
    app.get('/divide', mainController.divide.bind(mainController));
}