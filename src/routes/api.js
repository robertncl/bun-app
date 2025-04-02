import { MainController } from '../controllers/main.js';

const mainController = new MainController();

export async function handleRequest(req) {
  const url = new URL(req.url);
  
  switch (url.pathname) {
    case '/':
      return mainController.getHome(req);
    case '/data':
      return mainController.getData(req);
    default:
      return new Response('Not Found', { status: 404 });
  }
}