const { Worker } = require('bullmq');
const redis = require('../config/redis');

class JobWorker {
  constructor(queueName, concurrency = 5) {
    this.queueName = queueName;
    this.concurrency = concurrency;
    this.worker = null;
    this.processors = new Map();
    this.isRunning = false;
  }

  // Регистрируем обработчик для определенного типа задачи
  registerProcessor(jobName, processor) {
    this.processors.set(jobName, processor);
    console.log(`Processor registered for job type: ${jobName}`);
  }

  // Запускаем воркер
  start() {
    if (this.isRunning) {
      console.log('Worker is already running');
      return;
    }

    this.worker = new Worker(
      this.queueName,
      async (job) => {
        const { name, data } = job;
        console.log(`Processing job: ${name} (ID: ${job.id})`);

        try {
          // Проверяем, есть ли зарегистрированный обработчик
          if (!this.processors.has(name)) {
            throw new Error(`No processor registered for job type: ${name}`);
          }

          const processor = this.processors.get(name);
          const result = await processor(data, job);

          console.log(`Job ${name} (ID: ${job.id}) completed successfully`);
          return result;
        } catch (error) {
          console.error(`Job ${name} (ID: ${job.id}) failed:`, error);
          throw error;
        }
      },
      {
        connection: redis,
        concurrency: this.concurrency,
        removeOnComplete: 100,
        removeOnFail: 50,
      }
    );

    // Обработчики событий воркера
    this.worker.on('completed', (job, result) => {
      console.log(`Job ${job.name} (ID: ${job.id}) completed with result:`, result);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Job ${job.name} (ID: ${job.id}) failed:`, err);
    });

    this.worker.on('error', (err) => {
      console.error('Worker error:', err);
    });

    this.worker.on('stalled', (jobId) => {
      console.warn(`Job ${jobId} stalled`);
    });

    this.isRunning = true;
    console.log(`Worker started for queue "${this.queueName}" with concurrency ${this.concurrency}`);
  }

  // Останавливаем воркер
  async stop() {
    if (!this.isRunning) {
      console.log('Worker is not running');
      return;
    }

    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }

    this.isRunning = false;
    console.log(`Worker stopped for queue "${this.queueName}"`);
  }

  // Получаем статистику воркера
  getStats() {
    if (!this.worker) {
      return { isRunning: false };
    }

    return {
      isRunning: this.isRunning,
      queueName: this.queueName,
      concurrency: this.concurrency,
      processors: Array.from(this.processors.keys()),
    };
  }
}

module.exports = JobWorker;
