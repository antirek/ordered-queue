const { Queue, Worker, QueueScheduler } = require('bullmq');
const redis = require('../config/redis');

class OrderedQueueManager {
  constructor(queueName = 'ordered-queue') {
    this.queueName = queueName;
    this.queue = null;
    this.scheduler = null;
    this.isInitialized = false;
    this.processingOrder = new Map(); // Хранит порядок задач
    this.currentOrder = 0;
  }

  async initialize() {
    try {
      // Создаем очередь с настройками для сохранения порядка
      this.queue = new Queue(this.queueName, {
        connection: redis,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 1, // Только одна попытка, повторные попытки обрабатываем вручную
        },
      });

      // Создаем планировщик для отложенных задач
      this.scheduler = new QueueScheduler(this.queueName, {
        connection: redis,
      });

      this.isInitialized = true;
      console.log(`Ordered Queue "${this.queueName}" initialized successfully`);
    } catch (error) {
      console.error('Failed to initialize ordered queue:', error);
      throw error;
    }
  }

  async addJob(jobName, data, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Queue not initialized. Call initialize() first.');
    }

    try {
      // Назначаем порядковый номер для задачи
      const order = this.currentOrder++;
      
      const job = await this.queue.add(jobName, {
        ...data,
        _order: order, // Добавляем порядковый номер в данные
        _originalData: data // Сохраняем оригинальные данные
      }, {
        ...options,
        // Убираем стандартные настройки повторных попыток
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

  // Получаем следующую задачу в правильном порядке
  async getNextJob() {
    if (!this.isInitialized) {
      throw new Error('Queue not initialized. Call initialize() first.');
    }

    try {
      // Получаем все ожидающие задачи
      const waitingJobs = await this.queue.getJobs('waiting', 0, -1);
      
      if (waitingJobs.length === 0) {
        return null;
      }

      // Сортируем по порядковому номеру
      waitingJobs.sort((a, b) => {
        const orderA = a.data._order || 0;
        const orderB = b.data._order || 0;
        return orderA - orderB;
      });

      // Возвращаем первую задачу в правильном порядке
      return waitingJobs[0];
    } catch (error) {
      console.error('Failed to get next job:', error);
      throw error;
    }
  }

  // Обрабатываем неудачную задачу с отложением
  async handleFailedJob(job, error, delayMs = 60000) {
    if (!this.isInitialized) {
      throw new Error('Queue not initialized. Call initialize() first.');
    }

    try {
      console.log(`Job ${job.id} failed, scheduling retry in ${delayMs}ms`);
      
      // Создаем новую задачу с тем же порядковым номером
      const retryJob = await this.queue.add(job.name, {
        ...job.data._originalData,
        _order: job.data._order,
        _originalData: job.data._originalData,
        _retryCount: (job.data._retryCount || 0) + 1,
        _previousJobId: job.id
      }, {
        delay: delayMs,
        attempts: 1,
        backoff: false,
        // Сохраняем тот же порядковый номер
        jobId: `retry_${job.id}_${Date.now()}`
      });

      // Сохраняем порядок для повторной попытки
      this.processingOrder.set(retryJob.id, job.data._order);
      
      console.log(`Retry job scheduled with ID: ${retryJob.id}, order: ${job.data._order}`);
      return retryJob;
    } catch (error) {
      console.error('Failed to schedule retry job:', error);
      throw error;
    }
  }

  // Получаем статистику с информацией о порядке
  async getOrderedJobCounts() {
    if (!this.isInitialized) {
      throw new Error('Queue not initialized. Call initialize() first.');
    }

    try {
      const jobCounts = await this.queue.getJobCounts();
      const waitingJobs = await this.queue.getJobs('waiting', 0, -1);
      
      // Сортируем ожидающие задачи по порядку
      const orderedWaiting = waitingJobs
        .map(job => ({
          id: job.id,
          name: job.name,
          order: job.data._order || 0,
          retryCount: job.data._retryCount || 0
        }))
        .sort((a, b) => a.order - b.order);

      return {
        ...jobCounts,
        orderedWaiting,
        totalOrder: this.currentOrder
      };
    } catch (error) {
      console.error('Failed to get ordered job counts:', error);
      throw error;
    }
  }

  // Очищаем завершенные задачи из памяти порядка
  async cleanupOrderedJobs() {
    try {
      const completedJobs = await this.queue.getJobs('completed', 0, -1);
      const failedJobs = await this.queue.getJobs('failed', 0, -1);
      
      // Удаляем завершенные задачи из памяти порядка
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
    if (this.scheduler) {
      await this.scheduler.close();
    }
    if (this.queue) {
      await this.queue.close();
    }
    console.log(`Ordered Queue "${this.queueName}" closed`);
  }
}

module.exports = OrderedQueueManager;
