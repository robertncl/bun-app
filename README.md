# Bun Calculator API

This is a simple calculator API built with the Bun framework. It demonstrates how to set up a basic HTTP server with Bun to handle arithmetic operations via API endpoints.

## Project Structure

```
bun-app
├── src
│   └── index.js          # Entry point and main server logic
├── tests
│   └── index.test.js     # Unit tests for the application
├── package.json          # npm configuration file
├── bun.lockb             # Bun dependency lock file
├── tsconfig.json         # TypeScript configuration file
└── README.md             # Project documentation
```

## Getting Started

To get started with the Bun calculator app, follow these steps:

1. Clone the repository:
   ```sh
   git clone <repository-url>
   cd bun-app
   ```

2. Install dependencies:
   ```sh
   bun install
   ```

3. Run the application:
   ```sh
   bun run src/index.js
   ```
   The server will start on http://localhost:3000

## Calculator API Endpoints

All endpoints expect two query parameters: `a` and `b` (numbers).

- **GET /add?a=1&b=2**: Returns the sum of `a` and `b`.
- **GET /subtract?a=5&b=3**: Returns the difference of `a` and `b`.
- **GET /multiply?a=4&b=6**: Returns the product of `a` and `b`.
- **GET /divide?a=8&b=2**: Returns the quotient of `a` divided by `b`.

**Example Response:**
```json
{
  "result": 3
}
```

If invalid numbers are provided, or division by zero is attempted, an error message is returned:
```json
{
  "error": "Invalid numbers"
}
```

## Testing

To run the tests, use the following command:
```sh
bun test
```

## Continuous Integration

This project uses GitHub Actions to automatically install dependencies, run tests, and check that the server starts on every push or pull request to the `main` branch. See `.github/workflows/build.yaml` for details.

## Contributing

Feel free to submit issues or pull requests for improvements or bug fixes.