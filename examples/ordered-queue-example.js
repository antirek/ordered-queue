const OrderedQueueWithRetry = require('../queues/ordered-queue-with-retry');
require('dotenv').config();

async function orderedQueueExample() {
  console.log('🚀 Starting Ordered Queue Example with Retry Logic');
  
  // Создаем упорядоченную очередь
  const queue = new OrderedQueueWithRetry('ordered-example-queue');
  
  try {
    // Инициализируем очередь
    await queue.initialize();
    
    // Настраиваем параметры повторных попыток
    queue.setRetryConfig(3, 5000); // 3 попытки, задержка 5 секунд
    
    // Регистрируем обработчик, который иногда будет падать
    queue.registerProcessor('ordered-task', async (data, job) => {
      const { message, shouldFail, order } = data;
      
      console.log(`📝 Processing task: ${message} (Order: ${order})`);
      
      // Имитируем обработку
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Некоторые задачи будут падать для демонстрации повторных попыток
      if (shouldFail) {
        console.log(`❌ Task ${message} (Order: ${order}) will fail`);
        throw new Error(`Simulated failure for task ${message}`);
      }
      
      console.log(`✅ Task ${message} (Order: ${order}) completed successfully`);
      return { success: true, message, order, processedAt: new Date().toISOString() };
    });
    
    // Запускаем воркер
    queue.start();
    
    console.log('\n📋 Adding ordered tasks to queue...');
    
    // Добавляем задачи в определенном порядке
    const tasks = [
      { message: 'First task', shouldFail: false, order: 1 },
      { message: 'Second task', shouldFail: true, order: 2 },  // Эта задача упадет
      { message: 'Third task', shouldFail: false, order: 3 },
      { message: 'Fourth task', shouldFail: true, order: 4 },  // Эта задача тоже упадет
      { message: 'Fifth task', shouldFail: false, order: 5 },
      { message: 'Sixth task', shouldFail: false, order: 6 },
    ];
    
    for (const task of tasks) {
      await queue.addJob('ordered-task', task);
      console.log(`➕ Added task: ${task.message} (Order: ${task.order})`);
    }
    
    console.log('\n⏳ Monitoring queue status...');
    
    // Мониторинг в реальном времени
    let interval = setInterval(async () => {
      try {
        const stats = await queue.getOrderedJobCounts();
        
        console.log('\n📊 --- Queue Status ---');
        console.log(`Total jobs added: ${stats.totalOrder}`);
        console.log(`Waiting: ${stats.waiting}`);
        console.log(`Active: ${stats.active}`);
        console.log(`Completed: ${stats.completed}`);
        console.log(`Failed: ${stats.failed}`);
        console.log(`Delayed: ${stats.delayed}`);
        
        // Показываем ожидающие задачи в порядке
        if (stats.orderedWaiting.length > 0) {
          console.log('\n⏸️  Waiting tasks (in order):');
          stats.orderedWaiting.forEach(task => {
            console.log(`   ${task.order}. ${task.name} (Retry: ${task.retryCount})`);
          });
        }
        
        // Показываем отложенные задачи в порядке
        if (stats.orderedDelayed.length > 0) {
          console.log('\n⏰ Delayed tasks (in order):');
          stats.orderedDelayed.forEach(task => {
            console.log(`   ${task.order}. ${task.name} (Retry: ${task.retryCount}, Delay: ${task.delay}ms)`);
          });
        }
        
        // Проверяем, завершены ли все задачи
        if (stats.waiting === 0 && stats.active === 0 && stats.delayed === 0) {
          clearInterval(interval);
          console.log('\n🎉 All tasks completed!');
          
          // Показываем финальную статистику
          const finalStats = await queue.getOrderedJobCounts();
          console.log('\n📈 Final Statistics:');
          console.log(JSON.stringify(finalStats, null, 2));
          
          // Закрываем очередь
          await queue.close();
          console.log('\n🏁 Ordered queue example completed!');
        }
      } catch (error) {
        console.error('❌ Error getting stats:', error);
      }
    }, 2000);
    
    // Ждем максимум 2 минуты
    setTimeout(() => {
      clearInterval(interval);
      console.log('\n⏰ Timeout reached, closing...');
      queue.close();
    }, 120000);
    
  } catch (error) {
    console.error('❌ Error in ordered queue example:', error);
    await queue.close();
  }
}

// Запускаем пример
if (require.main === module) {
  orderedQueueExample().catch(console.error);
}

module.exports = orderedQueueExample;
