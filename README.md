# Scalable URL Shortener

This project is a highly scalable URL shortener service . It leverages a combination of advanced caching strategies, consistent hashing, message queues, and a circuit breaker pattern for fault tolerance.

## Architecture

The system is built with a microservices-like architecture, comprising the following key components:

1.  **Load Balancer:**
    *   Distributes incoming traffic across multiple application server instances.
    *  Currently, implemented as a simple round-robin, with a list of application server hosts.
    *   Implemented with `nginx`.

2.  **Application Servers (NestJS):**
    *   Serves as the main entry point for requests using `NestJS`.
    *   Handles URL shortening and redirection requests.
    *   Implements rate limiting based on IP addresses to prevent abuse.
    *   Uses a multi-layered caching mechanism.

3.  **L1 Cache (In-Memory LRU):**
    *   A local, in-memory cache (using `lru-cache-node`) in each application server instance, storing frequently accessed short URL mappings.
    *   Provides extremely fast access times for hot data.
    *   Implements an LRU (Least Recently Used) policy.

4.  **L2 Cache (Redis Cluster):**
    *   A distributed cache using Redis cluster for persistent storage of short URL mappings.
    *   Utilizes consistent hashing to distribute keys across Redis nodes evenly (using `farmhash` and binary search).
        * Implements a precomputed lookup table to ensure fast lookups
    *   `ioredis` used to provide robust connection pooling.

5.  **Bloom Filter:**
    *   Implemented locally in the server for each url.
    *   A probabilistic data structure to quickly check if a short URL key exists, avoiding unnecessary Redis lookups.

6.  **Circuit Breaker:**
    *   Protects against Redis node failures by temporarily stopping requests when Redis is unavailable, and allowing it to try to recover after a timeout.
    *   Avoids cascading failures.
    * Configurable failure threshold and retry timeout

7.  **Asynchronous Analytics (RabbitMQ):**
    *   Handles analytics asynchronously using RabbitMQ as a message broker.
    *   When short URLs are accessed, a message is published to a queue containing click data, which is later used to store in Redis.
    * Uses a channel with a publisher and consumer.

## How to Start

This section describes how to start the URL shortener service using Docker Compose.

### Prerequisites

*   Docker and Docker Compose installed on your system.
*   A `.env` file with configuration variables (see the `.env.example` file)

1.  **Create a `.env` file** (or copy from `.env.example` and update):

    ```env
      PORT=3000
        REDIS_URLS=redis-cluster-1:6379,redis-cluster-2:6379,redis-cluster-3:6379
        REDIS_POOL_SIZE=100
        BASE_URL=http://localhost
        CACHE_ENABLED=true
        L1_CACHE_SIZE=1000
        RATE_LIMIT_WINDOW_SEC=60
        RATE_LIMIT_MAX_REQUESTS=100
        CLEANUP_INTERVAL_MIN=60
        VIRTUAL_NODES=10
        RABBITMQ_URL=amqp://guest:guest@rabbitmq
    ```
    * **Note:** For a real production system use proper secrets management, rather than placing secrets in the `.env` file.

3.  **Build and Run:**
    ```bash
    docker compose up --build
    ```

    This command will:
    *   Build the Docker image for the URL shortener service.
    *   Create and start all the required services defined in `docker-compose.yml` (including the Nginx load balancer, three application instances, Redis cluster, and RabbitMQ message broker).

## API Usage

Once the service is up and running, you can use the following endpoints:

*   **Shorten URL:**

    `POST /shorten`

    Request Body:

    ```json
    {
    "url": "http://www.example.com/very/long/url",
    "customCode": "optional-custom-code",
    "ttlMinutes": 10
    }
    ```

    Response:

    ```json
    {
    "short_url": "http://localhost/<shortcode>"
    }
    ```

*   **Redirect URL:**

    `GET /<shortcode>`

    Redirects to the original URL.

*   **Get Analytics:**

    `GET /analytics/<shortcode>?limit=<number>&offset=<number>`
    Returns click data, using pagination.

* **Health Check**
  `GET /health`
  Returns health status of the service, with status of the connected dependencies.

## Further Enhancements

*   **Comprehensive Testing:** Implement thorough unit, integration, and load tests.

## Contributing

Contributions to the project are welcome. Please follow the contribution guidelines.

## License

This project is licensed under the MIT License.