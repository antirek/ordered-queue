const QueueManager = require('./queues/queue');
const JobWorker = require('./workers/worker');
const emailProcessor = require('./processors/emailProcessor');
const dataProcessor = require('./processors/dataProcessor');
require('dotenv').config();

class QueueApplication {
  constructor() {
    this.queueManager = null;
    this.worker = null;
    this.isRunning = false;
  }

  async initialize() {
    try {
      console.log('Initializing Queue Application...');
      
      // Инициализируем очередь
      this.queueManager = new QueueManager(process.env.QUEUE_NAME || 'default-queue');
      await this.queueManager.initialize();
      
      // Инициализируем воркер
      this.worker = new JobWorker(
        process.env.QUEUE_NAME || 'default-queue',
        parseInt(process.env.CONCURRENCY) || 5
      );
      
      // Регистрируем обработчики
      this.worker.registerProcessor('send-email', emailProcessor);
      this.worker.registerProcessor('process-data', dataProcessor);
      
      // Запускаем воркер
      this.worker.start();
      
      this.isRunning = true;
      console.log('Queue Application initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize Queue Application:', error);
      throw error;
    }
  }

  async addEmailJob(emailData) {
    if (!this.isRunning) {
      throw new Error('Application not running');
    }
    
    return await this.queueManager.addJob('send-email', emailData);
  }

  async addDataJob(data, operation, options = {}) {
    if (!this.isRunning) {
      throw new Error('Application not running');
    }
    
    const jobData = { input: data, operation, options };
    return await this.queueManager.addJob('process-data', jobData);
  }

  async getQueueStats() {
    if (!this.isRunning) {
      throw new Error('Application not running');
    }
    
    const jobCounts = await this.queueManager.getJobCounts();
    const workerStats = this.worker.getStats();
    
    return {
      queue: jobCounts,
      worker: workerStats,
      timestamp: new Date().toISOString()
    };
  }

  async gracefulShutdown() {
    console.log('Shutting down Queue Application...');
    
    if (this.worker) {
      await this.worker.stop();
    }
    
    if (this.queueManager) {
      await this.queueManager.close();
    }
    
    this.isRunning = false;
    console.log('Queue Application shut down successfully');
  }
}

// Пример использования
async function main() {
  const app = new QueueApplication();
  
  try {
    // Инициализируем приложение
    await app.initialize();
    
    // Добавляем несколько задач для демонстрации
    console.log('\n--- Adding sample jobs ---');
    
    // Email задача
    await app.addEmailJob({
      to: 'user@example.com',
      subject: 'Welcome to our service',
      body: 'Thank you for joining us!',
      template: 'welcome'
    });
    
    // Data processing задачи
    await app.addDataJob(
      [{ id: 1, value: 10 }, { id: 2, value: 20 }, { id: 3, value: 30 }],
      'aggregate'
    );
    
    await app.addDataJob(
      [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }],
      'validate'
    );
    
    await app.addDataJob(
      { id: 1, data: 'sample' },
      'transform'
    );
    
    // Показываем статистику
    console.log('\n--- Queue Statistics ---');
    const stats = await app.getQueueStats();
    console.log(JSON.stringify(stats, null, 2));
    
    // Ждем немного для обработки задач
    console.log('\n--- Waiting for jobs to process ---');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Показываем финальную статистику
    console.log('\n--- Final Queue Statistics ---');
    const finalStats = await app.getQueueStats();
    console.log(JSON.stringify(finalStats, null, 2));
    
  } catch (error) {
    console.error('Application error:', error);
  } finally {
    // Graceful shutdown
    await app.gracefulShutdown();
    process.exit(0);
  }
}

// Обработка сигналов для graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Запускаем приложение если файл запущен напрямую
if (require.main === module) {
  main().catch(console.error);
}

module.exports = QueueApplication;
