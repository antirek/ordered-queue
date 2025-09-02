// Пример обработчика для обработки данных
async function dataProcessor(data, job) {
  const { input, operation, options } = data;
  
  console.log(`Processing data job with operation: ${operation}`);
  
  // Имитируем обработку данных
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  let result;
  
  switch (operation) {
    case 'transform':
      result = transformData(input, options);
      break;
    case 'validate':
      result = validateData(input, options);
      break;
    case 'aggregate':
      result = aggregateData(input, options);
      break;
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
  
  console.log(`Data processing completed for job ${job.id}`);
  
  return {
    success: true,
    operation,
    result,
    processedAt: new Date().toISOString(),
    inputSize: Array.isArray(input) ? input.length : 1
  };
}

function transformData(input, options) {
  // Простое преобразование данных
  if (Array.isArray(input)) {
    return input.map(item => ({
      ...item,
      transformed: true,
      timestamp: new Date().toISOString()
    }));
  }
  
  return {
    ...input,
    transformed: true,
    timestamp: new Date().toISOString()
  };
}

function validateData(input, options) {
  // Простая валидация
  const errors = [];
  
  if (Array.isArray(input)) {
    input.forEach((item, index) => {
      if (!item.id) {
        errors.push(`Item at index ${index} missing id`);
      }
    });
  } else if (!input.id) {
    errors.push('Input missing id');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    validatedAt: new Date().toISOString()
  };
}

function aggregateData(input, options) {
  // Простая агрегация
  if (Array.isArray(input)) {
    const count = input.length;
    const sum = input.reduce((acc, item) => acc + (item.value || 0), 0);
    const average = count > 0 ? sum / count : 0;
    
    return {
      count,
      sum,
      average,
      aggregatedAt: new Date().toISOString()
    };
  }
  
  return {
    count: 1,
    value: input.value || 0,
    aggregatedAt: new Date().toISOString()
  };
}

module.exports = dataProcessor;
