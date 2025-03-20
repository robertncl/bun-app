import { setupRoutes } from '../src/routes/api';
import { MainController } from '../src/controllers/main';

describe('API Routes', () => {
    let controller;

    beforeAll(() => {
        controller = new MainController();
    });

    test('GET / should return home page', async () => {
        const req = {};
        const res = {
            send: jest.fn(),
        };

        await controller.getHome(req, res);
        expect(res.send).toHaveBeenCalledWith('Welcome to the Home Page');
    });

    test('GET /data should return data', async () => {
        const req = {};
        const res = {
            json: jest.fn(),
        };

        await controller.getData(req, res);
        expect(res.json).toHaveBeenCalledWith({ data: 'Sample Data' });
    });
});