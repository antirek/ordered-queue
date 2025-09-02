const { Queue, Worker, QueueScheduler } = require('bullmq');
const redis = require('../config/redis');

class QueueManager {
  constructor(queueName = 'default-queue') {
    this.queueName = queueName;
    this.queue = null;
    this.worker = null;
    this.scheduler = null;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      // Создаем очередь
      this.queue = new Queue(this.queueName, {
        connection: redis,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      });

      // Создаем планировщик для отложенных задач
      this.scheduler = new QueueScheduler(this.queueName, {
        connection: redis,
      });

      this.isInitialized = true;
      console.log(`Queue "${this.queueName}" initialized successfully`);
    } catch (error) {
      console.error('Failed to initialize queue:', error);
      throw error;
    }
  }

  async addJob(jobName, data, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Queue not initialized. Call initialize() first.');
    }

    try {
      const job = await this.queue.add(jobName, data, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        ...options,
      });

      console.log(`Job "${jobName}" added with ID: ${job.id}`);
      return job;
    } catch (error) {
      console.error('Failed to add job:', error);
      throw error;
    }
  }

  async getJob(jobId) {
    if (!this.isInitialized) {
      throw new Error('Queue not initialized. Call initialize() first.');
    }

    return await this.queue.getJob(jobId);
  }

  async getJobs(status = 'waiting', start = 0, end = 100) {
    if (!this.isInitialized) {
      throw new Error('Queue not initialized. Call initialize() first.');
    }

    return await this.queue.getJobs(status, start, end);
  }

  async getJobCounts() {
    if (!this.isInitialized) {
      throw new Error('Queue not initialized. Call initialize() first.');
    }

    return await this.queue.getJobCounts();
  }

  async pause() {
    if (!this.isInitialized) {
      throw new Error('Queue not initialized. Call initialize() first.');
    }

    await this.queue.pause();
    console.log(`Queue "${this.queueName}" paused`);
  }

  async resume() {
    if (!this.isInitialized) {
      throw new Error('Queue not initialized. Call initialize() first.');
    }

    await this.queue.resume();
    console.log(`Queue "${this.queueName}" resumed`);
  }

  async close() {
    if (this.worker) {
      await this.worker.close();
    }
    if (this.scheduler) {
      await this.scheduler.close();
    }
    if (this.queue) {
      await this.queue.close();
    }
    console.log(`Queue "${this.queueName}" closed`);
  }
}

module.exports = QueueManager;
