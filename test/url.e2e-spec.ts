import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module'; // Replace with the actual path to your AppModule
import { UrlService } from '../src/url/url.service';

describe('UrlController (e2e)', () => {
  let app: INestApplication;
  let urlService: UrlService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    urlService = moduleFixture.get<UrlService>(UrlService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /shorten', () => {
    it('should shorten a URL', async () => {
      const response = await request(app.getHttpServer())
        .post('/shorten')
        .send({
          url: 'https://example.com',
          ttlMinutes: 10,
        })
        .expect(201);

      expect(response.body).toHaveProperty('short_url');
      expect(response.body.short_url).toMatch(/http/);
    });

    it('should throw an error if custom code is already in use', async () => {
      const customCode = 'custom123';
      await urlService.shortenUrl({
        url: 'https://example.com',
        customCode,
        ttlMinutes: 10,
      });

      await request(app.getHttpServer())
        .post('/shorten')
        .send({
          url: 'https://another.com',
          customCode,
        })
        .expect(400);
    });
  });

  describe('GET /:shortCode', () => {
    it('should redirect to the original URL', async () => {
      const shortUrl = await urlService.shortenUrl({
        url: 'https://example.com',
        ttlMinutes: 10,
      });
      const shortCode = shortUrl.short_url.split('/').pop();

      const response = await request(app.getHttpServer())
        .get(`/${shortCode}`)
        .expect(302);

      expect(response.headers.location).toBe('https://example.com');
    });

    it('should return 404 for an invalid short code', async () => {
      await request(app.getHttpServer()).get('/invalidCode').expect(404);
    });
  });

  describe('GET /analytics/:shortCode', () => {
    it('should fetch analytics for a valid short code', async () => {
      const shortUrl = await urlService.shortenUrl({
        url: 'https://example.com',
        ttlMinutes: 10,
      });

      const shortCode = shortUrl.short_url.split('/').pop();

      const response = await request(app.getHttpServer())
        .get(`/analytics/${shortCode}`)
        .query({ limit: 10, offset: 0 })
        .expect(200);

      expect(response.body).toHaveProperty('clicks');
      expect(Array.isArray(response.body.clicks)).toBe(true);
    });

    it('should return empty analytics for a short code with no clicks', async () => {
      const shortUrl = await urlService.shortenUrl({
        url: 'https://example.com/no-clicks',
        ttlMinutes: 10,
      });

      const shortCode = shortUrl.short_url.split('/').pop();

      const response = await request(app.getHttpServer())
        .get(`/analytics/${shortCode}`)
        .expect(200);

      expect(response.body.clicks).toEqual([]);
    });
  });
});
