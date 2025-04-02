import { handleRequest } from '../src/routes/api';
import { MainController } from '../src/controllers/main';

describe('API Routes', () => {
    let controller;

    beforeAll(() => {
        controller = new MainController();
    });

    test('GET / should return home page', async () => {
        const req = new Request('http://localhost/');
        const response = await controller.getHome(req);
        const text = await response.text();
        expect(text).toBe('Welcome to the Home Page');
    });

    test('GET /data should return data', async () => {
        const req = new Request('http://localhost/data');
        const response = await controller.getData(req);
        const data = await response.json();
        expect(data).toEqual({ data: 'Sample Data' });
    });
});