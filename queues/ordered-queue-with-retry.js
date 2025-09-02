const { Queue, Worker, QueueScheduler } = require('bullmq');
const redis = require('../config/redis');

class OrderedQueueWithRetry {
  constructor(queueName = 'ordered-queue-with-retry') {
    this.queueName = queueName;
    this.queue = null;
    this.worker = null;
    this.scheduler = null;
    this.isInitialized = false;
    this.processingOrder = new Map(); // Хранит порядок задач
    this.currentOrder = 0;
    this.maxRetries = 3; // Максимальное количество повторных попыток
    this.retryDelay = 60000; // Задержка перед повторной попыткой (1 минута)
    this.processors = new Map(); // Обработчики задач
  }

  async initialize() {
    try {
      // Создаем очередь
      this.queue = new Queue(this.queueName, {
        connection: redis,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 1, // Только одна попытка
        },
      });

      // Создаем планировщик для отложенных задач
      this.scheduler = new QueueScheduler(this.queueName, {
        connection: redis,
      });

      this.isInitialized = true;
      console.log(`Ordered Queue with Retry "${this.queueName}" initialized successfully`);
    } catch (error) {
      console.error('Failed to initialize ordered queue with retry:', error);
      throw error;
    }
  }

  // Регистрируем обработчик для определенного типа задачи
  registerProcessor(jobName, processor) {
    this.processors.set(jobName, processor);
    console.log(`Processor registered for job type: ${jobName}`);
  }

  // Добавляем задачу в очередь
  async addJob(jobName, data, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Queue not initialized. Call initialize() first.');
    }

    try {
      // Назначаем порядковый номер для задачи
      const order = this.currentOrder++;
      
      const job = await this.queue.add(jobName, {
        ...data,
        _order: order,
        _originalData: data,
        _retryCount: 0,
        _maxRetries: this.maxRetries
      }, {
        ...options,
        attempts: 1,
        backoff: false,
      });

      // Сохраняем порядок задачи
      this.processingOrder.set(job.id, order);
      
      console.log(`Job "${jobName}" added with ID: ${job.id}, order: ${order}`);
      return job;
    } catch (error) {
      console.error('Failed to add job:', error);
      throw error;
    }
  }

  // Запускаем воркер
  start() {
    if (!this.isInitialized) {
      throw new Error('Queue not initialized. Call initialize() first.');
    }

    this.worker = new Worker(
      this.queueName,
      async (job) => {
        const { name, data } = job;
        console.log(`Processing ordered job: ${name} (ID: ${job.id}, Order: ${data._order}, Retry: ${data._retryCount})`);

        try {
          // Проверяем, есть ли зарегистрированный обработчик
          if (!this.processors.has(name)) {
            throw new Error(`No processor registered for job type: ${name}`);
          }

          const processor = this.processors.get(name);
          const result = await processor(data._originalData, job);

          console.log(`Ordered job ${name} (ID: ${job.id}, Order: ${data._order}) completed successfully`);
          return result;
        } catch (error) {
          console.error(`Ordered job ${name} (ID: ${job.id}, Order: ${data._order}) failed:`, error);
          
          // Обрабатываем повторную попытку
          await this.handleJobFailure(job, error);
          
          throw error; // Перебрасываем ошибку для BullMQ
        }
      },
      {
        connection: redis,
        concurrency: 1, // Только одна задача одновременно для сохранения порядка
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 1,
        backoff: false,
      }
    );

    // Обработчики событий воркера
    this.worker.on('completed', (job, result) => {
      console.log(`Ordered job ${job.name} (ID: ${job.id}, Order: ${job.data._order}) completed with result:`, result);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Ordered job ${job.name} (ID: ${job.id}, Order: ${job.data._order}) failed:`, err);
    });

    this.worker.on('error', (err) => {
      console.error('Ordered worker error:', err);
    });

    this.worker.on('stalled', (jobId) => {
      console.warn(`Ordered job ${jobId} stalled`);
    });

    console.log(`Ordered worker started for queue "${this.queueName}" with concurrency 1`);
  }

  // Обрабатываем неудачную задачу
  async handleJobFailure(job, error) {
    const retryCount = job.data._retryCount || 0;
    const maxRetries = job.data._maxRetries || this.maxRetries;
    
    if (retryCount >= maxRetries) {
      console.log(`Job ${job.id} (Order: ${job.data._order}) exceeded max retries (${maxRetries}), marking as permanently failed`);
      return;
    }

    try {
      console.log(`Job ${job.id} (Order: ${job.data._order}) failed, scheduling retry ${retryCount + 1}/${maxRetries} in ${this.retryDelay}ms`);
      
      // Создаем новую задачу с тем же порядковым номером
      const retryJob = await this.queue.add(job.name, {
        ...job.data._originalData,
        _order: job.data._order,
        _originalData: job.data._originalData,
        _retryCount: retryCount + 1,
        _maxRetries: maxRetries,
        _previousJobId: job.id
      }, {
        delay: this.retryDelay,
        attempts: 1,
        backoff: false,
        jobId: `retry_${job.id}_${Date.now()}`
      });

      // Сохраняем порядок для повторной попытки
      this.processingOrder.set(retryJob.id, job.data._order);
      
      console.log(`Retry job scheduled with ID: ${retryJob.id}, order: ${job.data._order}`);
    } catch (retryError) {
      console.error('Failed to schedule retry job:', retryError);
    }
  }

  // Получаем статистику с информацией о порядке и повторных попытках
  async getOrderedJobCounts() {
    if (!this.isInitialized) {
      throw new Error('Queue not initialized. Call initialize() first.');
    }

    try {
      const jobCounts = await this.queue.getJobCounts();
      const waitingJobs = await this.queue.getJobs('waiting', 0, -1);
      const delayedJobs = await this.queue.getJobs('delayed', 0, -1);
      
      // Сортируем ожидающие задачи по порядку
      const orderedWaiting = waitingJobs
        .map(job => ({
          id: job.id,
          name: job.name,
          order: job.data._order || 0,
          retryCount: job.data._retryCount || 0
        }))
        .sort((a, b) => a.order - b.order);

      // Сортируем отложенные задачи по порядку
      const orderedDelayed = delayedJobs
        .map(job => ({
          id: job.id,
          name: job.name,
          order: job.data._order || 0,
          retryCount: job.data._retryCount || 0,
          delay: job.delay
        }))
        .sort((a, b) => a.order - b.order);

      return {
        ...jobCounts,
        orderedWaiting,
        orderedDelayed,
        totalOrder: this.currentOrder,
        maxRetries: this.maxRetries,
        retryDelay: this.retryDelay
      };
    } catch (error) {
      console.error('Failed to get ordered job counts:', error);
      throw error;
    }
  }

  // Настраиваем параметры повторных попыток
  setRetryConfig(maxRetries, retryDelay) {
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
    console.log(`Retry config updated: maxRetries=${maxRetries}, retryDelay=${retryDelay}ms`);
  }

  // Очищаем завершенные задачи из памяти порядка
  async cleanupOrderedJobs() {
    try {
      const completedJobs = await this.queue.getJobs('completed', 0, -1);
      const failedJobs = await this.queue.getJobs('failed', 0, -1);
      
      [...completedJobs, ...failedJobs].forEach(job => {
        this.processingOrder.delete(job.id);
      });
      
      console.log(`Cleaned up ${completedJobs.length + failedJobs.length} completed/failed jobs from order memory`);
    } catch (error) {
      console.error('Failed to cleanup ordered jobs:', error);
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

  async pause() {
    if (!this.isInitialized) {
      throw new Error('Queue not initialized. Call initialize() first.');
    }

    await this.queue.pause();
    console.log(`Ordered Queue "${this.queueName}" paused`);
  }

  async resume() {
    if (!this.isInitialized) {
      throw new Error('Queue not initialized. Call initialize() first.');
    }

    await this.queue.resume();
    console.log(`Ordered Queue "${this.queueName}" resumed`);
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
    console.log(`Ordered Queue "${this.queueName}" closed`);
  }
}

module.exports = OrderedQueueWithRetry;
