// Пример обработчика для отправки email
async function emailProcessor(data, job) {
  const { to, subject, body, template } = data;
  
  console.log(`Processing email job for: ${to}`);
  
  // Имитируем отправку email
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Логируем детали задачи
  console.log(`Email job details:`, {
    to,
    subject,
    template,
    jobId: job.id,
    timestamp: new Date().toISOString()
  });
  
  // Возвращаем результат
  return {
    success: true,
    messageId: `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    sentAt: new Date().toISOString()
  };
}

module.exports = emailProcessor;
