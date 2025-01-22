const http = require('k6/http');
const { sleep, check } = require('k6');

export const options = {
  stages: [
    { duration: '30s', target: 1000 }, // Ramp-up to 1000 users
    { duration: '1m', target: 1000 }, // Stay at 1000 users
    { duration: '10s', target: 0 }, // Ramp-down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<20'], // 95% of requests should be below 20ms
  },
};

export default function () {
  const url = 'http://localhost:3000/shorten'; // Replace with your actual endpoint
  const payload = JSON.stringify({
    url: 'https://example.com',
    customCode: null,
    ttlMinutes: null,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.post(url, payload, params);
  check(res, {
    'status was 200': (r) => r.status == 200,
  });

  sleep(1);
}