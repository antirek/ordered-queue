// Симуляция упорядоченной очереди с повторными попытками
// Демонстрирует логику работы без Redis

class OrderedQueueSimulation {
  constructor() {
    this.queue = [];
    this.processingOrder = new Map();
    this.currentOrder = 0;
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 секунд для демонстрации
    this.isProcessing = false;
    this.processors = new Map();
  }

  // Регистрируем обработчик
  registerProcessor(jobName, processor) {
    this.processors.set(jobName, processor);
    console.log(`📝 Processor registered for: ${jobName}`);
  }

  // Добавляем задачу
  async addJob(jobName, data) {
    const order = this.currentOrder++;
    
    const job = {
      id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: jobName,
      data: {
        ...data,
        _order: order,
        _originalData: data,
        _retryCount: 0,
        _maxRetries: this.maxRetries
      },
      status: 'waiting',
      createdAt: new Date()
    };

    this.queue.push(job);
    this.processingOrder.set(job.id, order);
    
    console.log(`➕ Added job: ${jobName} (Order: ${order}, ID: ${job.id})`);
    
    // Запускаем обработку, если не обрабатываем
    if (!this.isProcessing) {
      this.processNext();
    }
    
    return job;
  }

  // Обрабатываем следующую задачу
  async processNext() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    
    // Сортируем по порядку
    this.queue.sort((a, b) => a.data._order - b.data._order);
    
    // Берем первую задачу
    const job = this.queue.shift();
    
    if (!job) {
      this.isProcessing = false;
      return;
    }

    console.log(`\n🔄 Processing job: ${job.name} (Order: ${job.data._order}, ID: ${job.id})`);
    
    try {
      // Проверяем, есть ли обработчик
      if (!this.processors.has(job.name)) {
        throw new Error(`No processor registered for job type: ${job.name}`);
      }

      const processor = this.processors.get(job.name);
      const result = await processor(job.data._originalData, job);
      
      console.log(`✅ Job ${job.name} (Order: ${job.data._order}) completed successfully`);
      console.log(`   Result:`, result);
      
    } catch (error) {
      console.log(`❌ Job ${job.name} (Order: ${job.data._order}) failed:`, error.message);
      
      // Обрабатываем повторную попытку
      await this.handleJobFailure(job, error);
    }
    
    this.isProcessing = false;
    
    // Обрабатываем следующую задачу
    if (this.queue.length > 0) {
      this.processNext();
    }
  }

  // Обрабатываем неудачную задачу
  async handleJobFailure(job, error) {
    const retryCount = job.data._retryCount || 0;
    const maxRetries = job.data._maxRetries || this.maxRetries;
    
    if (retryCount >= maxRetries) {
      console.log(`🚫 Job ${job.name} (Order: ${job.data._order}) exceeded max retries (${maxRetries})`);
      return;
    }

    console.log(`⏰ Scheduling retry ${retryCount + 1}/${maxRetries} for job ${job.name} (Order: ${job.data._order}) in ${this.retryDelay}ms`);
    
    // Создаем повторную попытку
    const retryJob = {
      id: `retry_${job.id}_${Date.now()}`,
      name: job.name,
      data: {
        ...job.data._originalData,
        _order: job.data._order,        // Сохраняем порядок!
        _originalData: job.data._originalData,
        _retryCount: retryCount + 1,
        _maxRetries: maxRetries
      },
      status: 'delayed',
      createdAt: new Date(),
      retryAt: new Date(Date.now() + this.retryDelay)
    };

    // Добавляем в очередь с задержкой
    setTimeout(() => {
      retryJob.status = 'waiting';
      this.queue.push(retryJob);
      this.processingOrder.set(retryJob.id, retryJob.data._order);
      
      console.log(`🔄 Retry job ${retryJob.name} (Order: ${retryJob.data._order}) is now ready for processing`);
      
      // Запускаем обработку, если не обрабатываем
      if (!this.isProcessing) {
        this.processNext();
      }
    }, this.retryDelay);
  }

  // Получаем статистику
  getStats() {
    const waiting = this.queue.filter(job => job.status === 'waiting');
    const delayed = this.queue.filter(job => job.status === 'delayed');
    
    return {
      totalOrder: this.currentOrder,
      waiting: waiting.length,
      delayed: delayed.length,
      isProcessing: this.isProcessing,
      orderedWaiting: waiting
        .map(job => ({
          id: job.id,
          name: job.name,
          order: job.data._order,
          retryCount: job.data._retryCount
        }))
        .sort((a, b) => a.order - b.order),
      orderedDelayed: delayed
        .map(job => ({
          id: job.id,
          name: job.name,
          order: job.data._order,
          retryCount: job.data._retryCount,
          retryAt: job.retryAt
        }))
        .sort((a, b) => a.order - b.order)
    };
  }

  // Настраиваем параметры повторных попыток
  setRetryConfig(maxRetries, retryDelay) {
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
    console.log(`⚙️  Retry config updated: maxRetries=${maxRetries}, retryDelay=${retryDelay}ms`);
  }
}

// Пример использования
async function simulationExample() {
  console.log('🚀 Starting Ordered Queue Simulation');
  
  const queue = new OrderedQueueSimulation();
  
  // Настраиваем параметры повторных попыток
  queue.setRetryConfig(3, 3000); // 3 попытки, задержка 3 секунды
  
  // Регистрируем обработчик, который иногда будет падать
  queue.registerProcessor('simulated-task', async (data, job) => {
    const { message, shouldFail, order } = data;
    
    console.log(`   📝 Processing: ${message} (Order: ${order})`);
    
    // Имитируем обработку
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Некоторые задачи будут падать для демонстрации
    if (shouldFail) {
      throw new Error(`Simulated failure for task ${message}`);
    }
    
    return { success: true, message, order, processedAt: new Date().toISOString() };
  });
  
  console.log('\n📋 Adding tasks to queue...');
  
  // Добавляем задачи в определенном порядке
  const tasks = [
    { message: 'First task', shouldFail: false, order: 1 },
    { message: 'Second task', shouldFail: true, order: 2 },   // Упадет
    { message: 'Third task', shouldFail: false, order: 3 },
    { message: 'Fourth task', shouldFail: true, order: 4 },   // Упадет
    { message: 'Fifth task', shouldFail: false, order: 5 },
    { message: 'Sixth task', shouldFail: false, order: 6 },
  ];
  
  for (const task of tasks) {
    await queue.addJob('simulated-task', task);
  }
  
  console.log('\n⏳ Monitoring queue status...');
  
  // Мониторинг в реальном времени
  let interval = setInterval(() => {
    const stats = queue.getStats();
    
    console.log('\n📊 --- Queue Status ---');
    console.log(`Total jobs added: ${stats.totalOrder}`);
    console.log(`Waiting: ${stats.waiting}`);
    console.log(`Delayed: ${stats.delayed}`);
    console.log(`Currently processing: ${stats.isProcessing}`);
    
    if (stats.orderedWaiting.length > 0) {
      console.log('\n⏸️  Waiting tasks (in order):');
      stats.orderedWaiting.forEach(task => {
        console.log(`   ${task.order}. ${task.name} (Retry: ${task.retryCount})`);
      });
    }
    
    if (stats.orderedDelayed.length > 0) {
      console.log('\n⏰ Delayed tasks (in order):');
      stats.orderedDelayed.forEach(task => {
        console.log(`   ${task.order}. ${task.name} (Retry: ${task.retryCount})`);
      });
    }
    
    // Проверяем, завершены ли все задачи
    if (stats.waiting === 0 && stats.delayed === 0 && !stats.isProcessing) {
      clearInterval(interval);
      console.log('\n🎉 All tasks completed!');
      console.log('\n🏁 Simulation completed!');
    }
  }, 1000);
  
  // Ждем максимум 1 минуту
  setTimeout(() => {
    clearInterval(interval);
    console.log('\n⏰ Timeout reached, simulation ended');
  }, 60000);
}

// Запускаем симуляцию
if (require.main === module) {
  simulationExample().catch(console.error);
}

module.exports = { OrderedQueueSimulation, simulationExample };
