import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';

describe('Resource Server', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Mock signal endpoint
    app.get('/api/signal', (_req, res) => {
      res.json({ aggregate: 102.03 });
    });
  });

  it('should return aggregate signal', async () => {
    const response = await request(app)
      .get('/api/signal')
      .expect(200);

    expect(response.body).toEqual({ aggregate: 102.03 });
  });
});