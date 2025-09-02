const { Worker } = require('bullmq');
const redis = require('../config/redis');

class OrderedJobWorker {
  constructor(queueName, concurrency = 1) {
    this.queueName = queueName;
    this.concurrency = concurrency; // Для упорядоченной очереди обычно 1
    this.worker = null;
    this.processors = new Map();
    this.isRunning = false;
    this.isProcessing = false;
    this.currentJob = null;
  }

  // Регистрируем обработчик для определенного типа задачи
  registerProcessor(jobName, processor) {
    this.processors.set(jobName, processor);
    console.log(`Processor registered for job type: ${jobName}`);
  }

  // Запускаем воркер
  start() {
    if (this.isRunning) {
      console.log('Ordered worker is already running');
      return;
    }

    this.worker = new Worker(
      this.queueName,
      async (job) => {
        const { name, data } = job;
        console.log(`Processing ordered job: ${name} (ID: ${job.id}, Order: ${data._order})`);

        try {
          // Проверяем, есть ли зарегистрированный обработчик
          if (!this.processors.has(name)) {
            throw new Error(`No processor registered for job type: ${name}`);
          }

          const processor = this.processors.get(name);
          const result = await processor(data, job);

          console.log(`Ordered job ${name} (ID: ${job.id}, Order: ${data._order}) completed successfully`);
          return result;
        } catch (error) {
          console.error(`Ordered job ${name} (ID: ${job.id}, Order: ${data._order}) failed:`, error);
          throw error;
        }
      },
      {
        connection: redis,
        concurrency: this.concurrency, // Обычно 1 для упорядоченной очереди
        removeOnComplete: 100,
        removeOnFail: 50,
        // Отключаем автоматические повторные попытки
        attempts: 1,
        backoff: false,
      }
    );

    // Обработчики событий воркера
    this.worker.on('completed', (job, result) => {
      console.log(`Ordered job ${job.name} (ID: ${job.id}, Order: ${job.data._order}) completed with result:`, result);
      this.isProcessing = false;
      this.currentJob = null;
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Ordered job ${job.name} (ID: ${job.id}, Order: ${job.data._order}) failed:`, err);
      this.isProcessing = false;
      this.currentJob = null;
      
      // Здесь мы не обрабатываем повторные попытки автоматически
      // Это делается на уровне очереди
    });

    this.worker.on('error', (err) => {
      console.error('Ordered worker error:', err);
    });

    this.worker.on('stalled', (jobId) => {
      console.warn(`Ordered job ${jobId} stalled`);
    });

    this.isRunning = true;
    console.log(`Ordered worker started for queue "${this.queueName}" with concurrency ${this.concurrency}`);
  }

  // Останавливаем воркер
  async stop() {
    if (!this.isRunning) {
      console.log('Ordered worker is not running');
      return;
    }

    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }

    this.isRunning = false;
    this.isProcessing = false;
    this.currentJob = null;
    console.log(`Ordered worker stopped for queue "${this.queueName}"`);
  }

  // Получаем статистику воркера
  getStats() {
    if (!this.worker) {
      return { isRunning: false };
    }

    return {
      isRunning: this.isRunning,
      isProcessing: this.isProcessing,
      currentJob: this.currentJob ? {
        id: this.currentJob.id,
        name: this.currentJob.name,
        order: this.currentJob.data._order
      } : null,
      queueName: this.queueName,
      concurrency: this.concurrency,
      processors: Array.from(this.processors.keys()),
    };
  }

  // Проверяем, обрабатывается ли задача
  isCurrentlyProcessing() {
    return this.isProcessing;
  }

  // Получаем текущую обрабатываемую задачу
  getCurrentJob() {
    return this.currentJob;
  }
}

module.exports = OrderedJobWorker;
