const QueueManager = require('../queues/queue');
const JobWorker = require('../workers/worker');
require('dotenv').config();

async function simpleExample() {
  const queueName = 'simple-queue';
  
  // Создаем очередь
  const queue = new QueueManager(queueName);
  await queue.initialize();
  
  // Создаем воркер
  const worker = new JobWorker(queueName, 2);
  
  // Регистрируем простой обработчик
  worker.registerProcessor('simple-task', async (data, job) => {
    console.log(`Processing simple task with data:`, data);
    await new Promise(resolve => setTimeout(resolve, 1000));
    return { processed: true, timestamp: new Date().toISOString() };
  });
  
  // Запускаем воркер
  worker.start();
  
  // Добавляем несколько задач
  console.log('Adding jobs...');
  
  for (let i = 1; i <= 5; i++) {
    await queue.addJob('simple-task', { 
      message: `Task ${i}`,
      number: i 
    });
  }
  
  // Ждем обработки
  console.log('Waiting for jobs to process...');
  await new Promise(resolve => setTimeout(resolve, 8000));
  
  // Показываем статистику
  const stats = await queue.getJobCounts();
  console.log('Final stats:', stats);
  
  // Закрываем
  await worker.stop();
  await queue.close();
  
  console.log('Example completed!');
}

// Запускаем пример
if (require.main === module) {
  simpleExample().catch(console.error);
}

module.exports = simpleExample;
