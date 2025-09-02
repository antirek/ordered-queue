# Queue Order - BullMQ Project

Проект для работы с очередями задач на базе BullMQ и Redis.

## Возможности

- 🚀 Управление очередями задач с помощью BullMQ
- 🔄 Обработка задач с помощью воркеров
- 📧 Примеры обработчиков для email и данных
- ⚙️ Настраиваемые параметры очереди
- 📊 Мониторинг статистики очередей
- 🛡️ Graceful shutdown и обработка ошибок

## Требования

- Node.js 16+
- Redis сервер
- npm или yarn

## Установка

1. Клонируйте репозиторий:
```bash
git clone <repository-url>
cd queue-order
```

2. Установите зависимости:
```bash
npm install
```

3. Скопируйте файл конфигурации:
```bash
cp env.example .env
```

4. Настройте переменные окружения в файле `.env`:
```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Queue Configuration
QUEUE_NAME=default-queue
CONCURRENCY=5

# Application Configuration
NODE_ENV=development
PORT=3000
```

## Запуск

### Запуск Redis

Убедитесь, что Redis сервер запущен. Если у вас Docker:

```bash
docker run -d -p 6379:6379 redis:alpine
```

### Запуск приложения

```bash
npm start
```

Или для разработки с автоматической перезагрузкой:

```bash
npm run dev
```

## Структура проекта

```
queue-order/
├── config/
│   └── redis.js          # Конфигурация Redis
├── queues/
│   └── queue.js          # Менеджер очередей
├── workers/
│   └── worker.js         # Обработчик задач
├── processors/
│   ├── emailProcessor.js  # Обработчик email задач
│   └── dataProcessor.js   # Обработчик данных
├── app.js                 # Основное приложение
├── package.json
└── README.md
```

## Использование

### Создание очереди

```javascript
const QueueManager = require('./queues/queue');

const queue = new QueueManager('my-queue');
await queue.initialize();
```

### Добавление задачи

```javascript
await queue.addJob('job-name', { data: 'example' }, {
  delay: 5000,        // Задержка в миллисекундах
  priority: 10,       // Приоритет задачи
  attempts: 3         // Количество попыток
});
```

### Создание воркера

```javascript
const JobWorker = require('./workers/worker');

const worker = new JobWorker('my-queue', 5); // 5 параллельных задач

// Регистрация обработчика
worker.registerProcessor('job-name', async (data, job) => {
  // Логика обработки задачи
  return { result: 'success' };
});

worker.start();
```

### Получение статистики

```javascript
const stats = await queue.getJobCounts();
console.log(stats);
// {
//   waiting: 5,
//   active: 2,
//   completed: 10,
//   failed: 1
// }
```

## Примеры обработчиков

### Email обработчик

```javascript
const emailProcessor = require('./processors/emailProcessor');

// Регистрация в воркере
worker.registerProcessor('send-email', emailProcessor);

// Добавление email задачи
await queue.addJob('send-email', {
  to: 'user@example.com',
  subject: 'Welcome',
  body: 'Hello!',
  template: 'welcome'
});
```

### Data обработчик

```javascript
const dataProcessor = require('./processors/dataProcessor');

// Регистрация в воркере
worker.registerProcessor('process-data', dataProcessor);

// Добавление задачи обработки данных
await queue.addJob('process-data', {
  input: [1, 2, 3, 4, 5],
  operation: 'aggregate',
  options: { method: 'sum' }
});
```

## API

### QueueManager

- `initialize()` - Инициализация очереди
- `addJob(name, data, options)` - Добавление задачи
- `getJob(jobId)` - Получение задачи по ID
- `getJobs(status, start, end)` - Получение списка задач
- `getJobCounts()` - Получение статистики
- `pause()` - Приостановка очереди
- `resume()` - Возобновление очереди
- `close()` - Закрытие очереди

### JobWorker

- `registerProcessor(jobName, processor)` - Регистрация обработчика
- `start()` - Запуск воркера
- `stop()` - Остановка воркера
- `getStats()` - Получение статистики воркера

## Мониторинг

Приложение выводит подробные логи о:
- Подключении к Redis
- Инициализации очередей и воркеров
- Добавлении и обработке задач
- Ошибках и их обработке
- Статистике очередей

## Graceful Shutdown

Приложение корректно обрабатывает сигналы завершения:
- `SIGINT` (Ctrl+C)
- `SIGTERM`

При получении сигнала приложение:
1. Останавливает воркеры
2. Закрывает очереди
3. Корректно завершает работу

## Разработка

### Добавление новых обработчиков

1. Создайте файл в папке `processors/`
2. Экспортируйте функцию-обработчик
3. Зарегистрируйте в воркере

### Настройка параметров

Основные параметры настраиваются через переменные окружения в файле `.env`.

## Troubleshooting

### Redis connection error

Убедитесь, что:
- Redis сервер запущен
- Параметры подключения корректны
- Порт 6379 доступен

### Queue not initialized

Вызовите `await queue.initialize()` перед использованием очереди.

### No processor registered

Зарегистрируйте обработчик для типа задачи с помощью `worker.registerProcessor()`.

## Лицензия

ISC
