import { MainController } from '../controllers/main.js';

const mainController = new MainController();

<<<<<<< HEAD
export function setupRoutes(app) {
    app.get('/add', mainController.add.bind(mainController));
    app.get('/subtract', mainController.subtract.bind(mainController));
    app.get('/multiply', mainController.multiply.bind(mainController));
    app.get('/divide', mainController.divide.bind(mainController));
=======
export async function handleRequest(req) {
  const url = new URL(req.url);

  switch (url.pathname) {
    case '/':
      return mainController.getHome(req);
    case '/data':
      return mainController.getData(req);
    case '/styles.css':
      return new Response(`
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-color: red; /* Changed from #f9f9f9 to red */
        }
        .title {
            color: #333;
            text-align: center;
            margin-top: 20px;
        }
      `, {
        headers: { 'Content-Type': 'text/css' }
      });
    default:
      return new Response('Not Found', { status: 404 });
  }
>>>>>>> 6f33076d598cda0312e4943a1ec1ea0b8cb0918d
}