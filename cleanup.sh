#!/bin/bash
echo "Cleaning up old Redis cluster configuration"
redis-cli -h redis-node-1 -p 6379 cluster reset
redis-cli -h redis-node-2 -p 6379 cluster reset
redis-cli -h redis-node-3 -p 6379 cluster reset