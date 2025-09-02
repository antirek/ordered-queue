const QueueManager = require('../queues/queue');
const JobWorker = require('../workers/worker');
require('dotenv').config();

async function advancedExample() {
  const queueName = 'advanced-queue';
  
  // Создаем очередь
  const queue = new QueueManager(queueName);
  await queue.initialize();
  
  // Создаем воркер с высокой производительностью
  const worker = new JobWorker(queueName, 10);
  
  // Регистрируем различные обработчики
  worker.registerProcessor('fast-task', async (data, job) => {
    console.log(`Fast task ${job.id}:`, data);
    await new Promise(resolve => setTimeout(resolve, 100));
    return { type: 'fast', processed: true };
  });
  
  worker.registerProcessor('slow-task', async (data, job) => {
    console.log(`Slow task ${job.id}:`, data);
    await new Promise(resolve => setTimeout(resolve, 3000));
    return { type: 'slow', processed: true };
  });
  
  worker.registerProcessor('priority-task', async (data, job) => {
    console.log(`Priority task ${job.id}:`, data);
    await new Promise(resolve => setTimeout(resolve, 500));
    return { type: 'priority', processed: true, priority: data.priority };
  });
  
  worker.registerProcessor('delayed-task', async (data, job) => {
    console.log(`Delayed task ${job.id}:`, data);
    return { type: 'delayed', processed: true, delay: data.delay };
  });
  
  // Запускаем воркер
  worker.start();
  
  console.log('Adding various types of jobs...');
  
  // Быстрые задачи
  for (let i = 1; i <= 20; i++) {
    await queue.addJob('fast-task', { 
      message: `Fast task ${i}`,
      timestamp: new Date().toISOString()
    });
  }
  
  // Медленные задачи
  for (let i = 1; i <= 5; i++) {
    await queue.addJob('slow-task', { 
      message: `Slow task ${i}`,
      timestamp: new Date().toISOString()
    });
  }
  
  // Приоритетные задачи
  await queue.addJob('priority-task', { 
    message: 'High priority task',
    priority: 'high'
  }, { priority: 1 });
  
  await queue.addJob('priority-task', { 
    message: 'Low priority task',
    priority: 'low'
  }, { priority: 10 });
  
  // Отложенные задачи
  await queue.addJob('delayed-task', { 
    message: 'Delayed task 1',
    delay: 5000
  }, { delay: 5000 });
  
  await queue.addJob('delayed-task', { 
    message: 'Delayed task 2',
    delay: 10000
  }, { delay: 10000 });
  
  // Мониторинг в реальном времени
  let interval = setInterval(async () => {
    try {
      const stats = await queue.getJobCounts();
      console.log('\n--- Queue Status ---');
      console.log(`Waiting: ${stats.waiting}`);
      console.log(`Active: ${stats.active}`);
      console.log(`Completed: ${stats.completed}`);
      console.log(`Failed: ${stats.failed}`);
      console.log(`Delayed: ${stats.delayed}`);
      
      // Останавливаем мониторинг если все задачи завершены
      if (stats.waiting === 0 && stats.active === 0 && stats.delayed === 0) {
        clearInterval(interval);
        console.log('\nAll jobs completed!');
        
        // Показываем финальную статистику
        const finalStats = await queue.getJobCounts();
        console.log('Final statistics:', finalStats);
        
        // Закрываем
        await worker.stop();
        await queue.close();
        console.log('Advanced example completed!');
      }
    } catch (error) {
      console.error('Error getting stats:', error);
    }
  }, 2000);
  
  // Ждем максимум 2 минуты
  setTimeout(() => {
    clearInterval(interval);
    console.log('Timeout reached, closing...');
    worker.stop().then(() => queue.close());
  }, 120000);
}

// Запускаем пример
if (require.main === module) {
  advancedExample().catch(console.error);
}

module.exports = advancedExample;
