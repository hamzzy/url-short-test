export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  redis: {
    urls: (process.env.REDIS_URLS || '').split(','),
  },
  base_url: process.env.BASE_URL || 'http://localhost:3000',
  cache_enabled: process.env.CACHE_ENABLED === 'true',
  l1_cache_size: parseInt(process.env.L1_CACHE_SIZE, 10) || 1000,
  rate_limit_window_sec: parseInt(process.env.RATE_LIMIT_WINDOW_SEC, 10) || 60,
  rate_limit_max_requests:
    parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  cleanup_interval_min: parseInt(process.env.CLEANUP_INTERVAL_MIN, 10) || 60,
  virtual_nodes: parseInt(process.env.VIRTUAL_NODES, 10) || 10,
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost',
  },
});
