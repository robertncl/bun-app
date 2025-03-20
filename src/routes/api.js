import { MainController } from '../controllers/main.js';

const mainController = new MainController();

export function setupRoutes(app) {
    app.get('/', mainController.getHome.bind(mainController));
    app.get('/data', mainController.getData.bind(mainController));
}