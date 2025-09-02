# Упорядоченные очереди с сохранением порядка при повторных попытках

## Проблема

В стандартных очередях BullMQ при неудачном выполнении задачи происходит следующее:

1. Задача помечается как неудачная
2. Если настроены повторные попытки, задача добавляется в конец очереди
3. **Проблема**: нарушается порядок выполнения задач

**Пример:**
```
Исходный порядок: [Task1, Task2, Task3, Task4]
Task2 падает → повторная попытка добавляется в конец
Результат: [Task1, Task3, Task4, Task2] ❌ Порядок нарушен
```

## Решение

Мы создали специальную реализацию `OrderedQueueWithRetry`, которая:

1. **Сохраняет порядок** выполнения задач
2. **Автоматически обрабатывает** повторные попытки
3. **Откладывает неудачные задачи** на указанное время
4. **Блокирует выполнение** следующих задач до завершения текущей

## Как это работает

### 1. Назначение порядковых номеров

```javascript
// Каждая задача получает уникальный порядковый номер
const order = this.currentOrder++;
const job = await this.queue.add(jobName, {
  ...data,
  _order: order,           // Порядковый номер
  _originalData: data,     // Оригинальные данные
  _retryCount: 0,          // Счетчик попыток
  _maxRetries: 3           // Максимум попыток
});
```

### 2. Обработка неудачных задач

```javascript
// При падении задачи
async handleJobFailure(job, error) {
  const retryCount = job.data._retryCount || 0;
  const maxRetries = job.data._maxRetries || 3;
  
  if (retryCount >= maxRetries) {
    // Превышен лимит попыток
    return;
  }
  
  // Создаем повторную попытку с тем же порядковым номером
  const retryJob = await this.queue.add(job.name, {
    ...job.data._originalData,
    _order: job.data._order,        // Сохраняем порядок!
    _retryCount: retryCount + 1,    // Увеличиваем счетчик
    _maxRetries: maxRetries
  }, {
    delay: this.retryDelay,         // Откладываем на указанное время
    attempts: 1,
    backoff: false
  });
}
```

### 3. Сохранение порядка выполнения

```javascript
// Воркер работает с concurrency = 1
this.worker = new Worker(this.queueName, processor, {
  concurrency: 1,  // Только одна задача одновременно
  attempts: 1,     // Отключаем автоматические повторные попытки
  backoff: false
});
```

## Использование

### Базовая настройка

```javascript
const OrderedQueueWithRetry = require('./queues/ordered-queue-with-retry');

// Создаем очередь
const queue = new OrderedQueueWithRetry('my-ordered-queue');
await queue.initialize();

// Настраиваем параметры повторных попыток
queue.setRetryConfig(3, 60000); // 3 попытки, задержка 1 минута

// Регистрируем обработчик
queue.registerProcessor('my-task', async (data, job) => {
  // Ваша логика обработки
  if (shouldFail) {
    throw new Error('Task failed');
  }
  return { success: true };
});

// Запускаем воркер
queue.start();
```

### Добавление задач

```javascript
// Задачи будут выполняться в порядке добавления
await queue.addJob('my-task', { message: 'Task 1' });
await queue.addJob('my-task', { message: 'Task 2' });
await queue.addJob('my-task', { message: 'Task 3' });
```

### Мониторинг

```javascript
const stats = await queue.getOrderedJobCounts();

console.log('Waiting tasks in order:');
stats.orderedWaiting.forEach(task => {
  console.log(`${task.order}. ${task.name} (Retry: ${task.retryCount})`);
});

console.log('Delayed tasks in order:');
stats.orderedDelayed.forEach(task => {
  console.log(`${task.order}. ${task.name} (Retry: ${task.retryCount})`);
});
```

## Пример выполнения

```
🚀 Starting Ordered Queue Example with Retry Logic
📋 Adding ordered tasks to queue...
➕ Added task: First task (Order: 1)
➕ Added task: Second task (Order: 2)
➕ Added task: Third task (Order: 3)
➕ Added task: Fourth task (Order: 4)
➕ Added task: Fifth task (Order: 5)
➕ Added task: Sixth task (Order: 6)

📝 Processing task: First task (Order: 1)
✅ Task First task (Order: 1) completed successfully

📝 Processing task: Second task (Order: 2)
❌ Task Second task (Order: 2) will fail
📝 Job 2 (Order: 2) failed, scheduling retry 1/3 in 5000ms

📝 Processing task: Third task (Order: 3)
✅ Task Third task (Order: 3) completed successfully

📝 Processing task: Fourth task (Order: 4)
❌ Task Fourth task (Order: 4) will fail
📝 Job 4 (Order: 4) failed, scheduling retry 1/3 in 5000ms

📝 Processing task: Fifth task (Order: 5)
✅ Task Fifth task (Order: 5) completed successfully

📝 Processing task: Sixth task (Order: 6)
✅ Task Sixth task (Order: 6) completed successfully

⏰ Delayed tasks (in order):
   2. ordered-task (Retry: 1, Delay: 5000ms)
   4. ordered-task (Retry: 1, Delay: 5000ms)

📝 Processing task: Second task (Order: 2) - Retry 1
✅ Task Second task (Order: 2) completed successfully

📝 Processing task: Fourth task (Order: 4) - Retry 1
✅ Task Fourth task (Order: 4) completed successfully

🎉 All tasks completed!
```

## Ключевые особенности

### ✅ Преимущества

1. **Сохранение порядка** - задачи выполняются строго в порядке добавления
2. **Автоматические повторные попытки** - настраиваемое количество попыток
3. **Настраиваемая задержка** - время ожидания перед повторной попыткой
4. **Мониторинг** - детальная информация о состоянии очереди
5. **Graceful shutdown** - корректное завершение работы

### ⚠️ Ограничения

1. **Concurrency = 1** - только одна задача выполняется одновременно
2. **Память порядка** - порядковые номера хранятся в памяти
3. **Redis зависимость** - требует работающий Redis сервер

### 🔧 Настройка

```javascript
// Количество повторных попыток
queue.setRetryConfig(5, 30000); // 5 попыток, задержка 30 секунд

// Очистка памяти порядка
await queue.cleanupOrderedJobs();

// Пауза/возобновление
await queue.pause();
await queue.resume();
```

## Альтернативные подходы

### 1. Использование приоритетов

```javascript
// Задачи с высоким приоритетом выполняются первыми
await queue.addJob('task', data, { priority: 1 });
await queue.addJob('task', data, { priority: 10 });
```

### 2. Использование задержек

```javascript
// Откладываем выполнение задачи
await queue.addJob('task', data, { delay: 60000 });
```

### 3. Использование планировщика

```javascript
// Выполняем задачу в определенное время
await queue.addJob('task', data, { 
  delay: Date.now() + 60000 
});
```

## Заключение

`OrderedQueueWithRetry` решает проблему сохранения порядка выполнения задач при повторных попытках. Это особенно полезно для:

- Обработки данных в строгом порядке
- Систем, где порядок критически важен
- Задач, которые могут временно падать
- Сценариев с повторными попытками

Используйте эту реализацию, когда порядок выполнения задач важнее производительности.
